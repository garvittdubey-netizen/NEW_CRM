import { Request, Response } from 'express';
import * as dealService from '../services/deal.service';
import { buildDealTimeline } from '../services/deal-timeline.service';
import { syncLeadStatusFromDeal } from '../services/lead-sync.service';
import { isAdminLevel } from '../lib/roles';

/** Indian-format short money string used inside activity descriptions. */
function formatAmount(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

interface LifecycleEvent {
  eventType: string;
  notes: string;
}

/**
 * Diff the deal before/after an update and emit one event per meaningful
 * field change. We deliberately do NOT emit anything for cosmetic edits
 * (title, closingDate, propertyId, clientId) so the timeline stays focused
 * on the events the user asked for in the spec:
 *   STATUS_CHANGED, AMOUNT_UPDATED, AGENT_REASSIGNED, NOTES_UPDATED
 */
function collectLifecycleEvents(
  before: any,
  after: any,
  body: Record<string, unknown>,
): LifecycleEvent[] {
  const events: LifecycleEvent[] = [];

  if (body.status !== undefined && before.status !== after.status) {
    events.push({
      eventType: 'STATUS_CHANGED',
      notes: `Status changed from ${before.status} to ${after.status}`,
    });
  }

  // Amount diff — both values come back as numbers via the service's toDto.
  if (
    body.amount !== undefined &&
    Number(before.amount) !== Number(after.amount)
  ) {
    events.push({
      eventType: 'AMOUNT_UPDATED',
      notes: `Amount updated from ${formatAmount(Number(before.amount))} to ${formatAmount(Number(after.amount))}`,
    });
  }

  if (
    body.assignedAgentId !== undefined &&
    before.assignedAgentId !== after.assignedAgentId
  ) {
    const fromName = before.assignedAgent?.name ?? 'Unassigned';
    const toName = after.assignedAgent?.name ?? 'Unassigned';
    events.push({
      eventType: 'AGENT_REASSIGNED',
      notes: `Reassigned from ${fromName} to ${toName}`,
    });
  }

  if (body.notes !== undefined && (before.notes ?? null) !== (after.notes ?? null)) {
    events.push({ eventType: 'NOTES_UPDATED', notes: 'Notes updated' });
  }

  return events;
}

function validateRequired(body: Record<string, unknown>): string | null {
  const required: Array<[string, string]> = [
    ['title', 'Title'],
    ['propertyId', 'Property'],
    ['clientId', 'Client'],
  ];
  for (const [k, label] of required) {
    const v = body[k];
    if (typeof v !== 'string' || !v.trim()) return `${label} is required`;
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 'Amount must be a positive number';
  return null;
}

export async function listDeals(req: Request, res: Response): Promise<void> {
  try {
    const result = await dealService.listDeals({
      page: req.query.page ? Math.max(1, Number(req.query.page)) : 1,
      limit: req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 20,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      assignedAgentId: req.query.assignedAgentId as string | undefined,
      propertyId: req.query.propertyId as string | undefined,
      clientId: req.query.clientId as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      userId: req.user!.id,
      userRole: req.user!.role,
    });
    res.json(result);
  } catch (e) {
    console.error('listDeals:', e);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
}

export async function getOneDeal(req: Request, res: Response): Promise<void> {
  try {
    const deal = await dealService.getDealById(req.params.id);
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }
    if (!isAdminLevel(req.user!.role) && deal.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You do not have access to this deal' });
      return;
    }
    res.json(deal);
  } catch (e) {
    console.error('getOneDeal:', e);
    res.status(500).json({ error: 'Failed to fetch deal' });
  }
}

export async function addDeal(req: Request, res: Response): Promise<void> {
  const validationError = validateRequired(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  try {
    // RBAC mirrors Leads/Properties/Clients:
    //   - AGENT can only create deals owned by themselves (any other id is
    //     silently coerced to their own).
    //   - ADMIN may assign any agent. Explicit `null` is honoured as "owner
    //     omitted"; we fall back to the admin themselves. Deals must have an
    //     owner (the schema requires assignedAgentId), so we never persist null.
    const assignedAgentId =
      isAdminLevel(req.user!.role)
        ? req.body.assignedAgentId || req.user!.id
        : req.user!.id;

    const deal = await dealService.createDeal({
      ...req.body,
      assignedAgentId,
    });

    // Lifecycle log — fire-and-forget; never blocks the response.
    await dealService.logDealActivity({
      dealId: deal.id,
      userId: req.user!.id,
      eventType: 'CREATED',
      notes: `Deal "${deal.title}" created with status ${deal.status} for ${formatAmount(deal.amount)}`,
    });

    res.status(201).json(deal);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    // Foreign-key violation: bad propertyId / clientId / assignedAgentId.
    if (err.code === 'P2003' || err.code === 'P2025') {
      res.status(400).json({ error: 'Invalid property, client or agent reference' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to create deal' });
  }
}

export async function editDeal(req: Request, res: Response): Promise<void> {
  try {
    const existing = await dealService.getDealById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }

    // AGENT may edit only their own deals and may NOT change `assignedAgentId`
    // (admin-only re-assignment, matching the Lead/Client pattern).
    if (!isAdminLevel(req.user!.role)) {
      if (existing.assignedAgentId !== req.user!.id) {
        res.status(403).json({ error: 'You can only edit deals assigned to you' });
        return;
      }
      if (
        req.body.assignedAgentId !== undefined &&
        req.body.assignedAgentId !== req.user!.id
      ) {
        res.status(403).json({ error: 'Only an admin can reassign deals' });
        return;
      }
    }

    const deal = await dealService.updateDeal(req.params.id, req.body);

    // Auto-log lifecycle deltas. We diff field-by-field against the pre-update
    // snapshot so a single PUT can emit multiple semantically distinct events
    // (e.g. an admin re-assigning AND changing status in one call). Each
    // event has a stable `eventType` and a human-readable `notes` string.
    const lifecycleEvents = collectLifecycleEvents(existing, deal, req.body);
    for (const ev of lifecycleEvents) {
      await dealService.logDealActivity({
        dealId: deal.id,
        userId: req.user!.id,
        ...ev,
      });
    }

    // Cross-module sync: when the deal's status actually changed, propagate
    // the equivalent stage back to the linked Lead so the Lead page never
    // drifts from the Deal page. No-op if the deal status doesn't map, the
    // client has no linked lead, or the lead already matches the target.
    // Best-effort — errors are swallowed inside the service so the deal
    // update is never rolled back by a lead-sync glitch.
    if (req.body.status !== undefined && existing.status !== deal.status) {
      await syncLeadStatusFromDeal({
        dealId: deal.id,
        clientId: deal.clientId,
        newDealStatus: deal.status,
        actorId: req.user!.id,
      });
    }

    res.json(deal);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({ error: 'Invalid property, client or agent reference' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to update deal' });
  }
}

export async function removeDeal(req: Request, res: Response): Promise<void> {
  try {
    const existing = await dealService.getDealById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }
    if (!isAdminLevel(req.user!.role) && existing.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You can only delete deals assigned to you' });
      return;
    }
    await dealService.deleteDeal(req.params.id);
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete deal' });
  }
}


/**
 * GET /api/deals/:id/timeline
 *
 * Read-only timeline for the Deal detail page. RBAC mirrors `getOneDeal`:
 * ADMIN sees any deal's timeline, AGENT only their own.
 */
export async function getDealTimelineHandler(req: Request, res: Response): Promise<void> {
  try {
    const deal = await dealService.getDealById(req.params.id);
    if (!deal) {
      res.status(404).json({ error: 'Deal not found' });
      return;
    }
    if (!isAdminLevel(req.user!.role) && deal.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You do not have access to this deal' });
      return;
    }
    const items = await buildDealTimeline(req.params.id);
    res.json({ items });
  } catch (e) {
    console.error('getDealTimeline:', e);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
}

/**
 * GET /api/deals/:id/activities
 *
 * Alias of /timeline that the spec calls out separately. We serve the same
 * payload so the frontend can pick whichever name it likes — both are
 * RBAC-scoped identically.
 */
export async function getDealActivitiesHandler(req: Request, res: Response): Promise<void> {
  return getDealTimelineHandler(req, res);
}

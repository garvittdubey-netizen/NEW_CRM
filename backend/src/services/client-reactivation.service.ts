/**
 * Client reactivation service.
 *
 * Implements the "Reactivate Lead" workflow:
 *
 *   Client (deal lost / client inactive)
 *     ↓
 *   Reactivate Lead
 *     ↓
 *   - If the client still has a linked lead → flip its status back to NEW
 *     so the lead becomes active again in the funnel. linkedLeadId is
 *     PRESERVED.
 *   - If the linked lead is missing (linkedLeadId is null OR the lead row
 *     was deleted and the FK SetNull triggered) → create a new lead from
 *     the client's current data and attach it via client.linkedLeadId.
 *
 * Activity trail:
 *   - `ClientActivity` row with action="CLIENT_REVERTED" (used by the
 *     unified client timeline already wired in `client-timeline.service`).
 *   - `Activity` row tied to the (now-active) lead so it surfaces on the
 *     global Activity feed AND on the lead's own LeadTimeline.
 *
 * RBAC is enforced in the controller (must be ADMIN / SUPER_ADMIN, or the
 * AGENT currently assigned to the client). This service trusts the actor
 * and only persists.
 */
import { Prisma, LeadStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as clientService from './client.service';
import * as activityService from './activity.service';

const AGENT_SELECT = { id: true, name: true, email: true } as const;
const LEAD_RETURN_SELECT = {
  id: true,
  fullName: true,
  status: true,
  phone: true,
  email: true,
  assignedAgentId: true,
} as const;

export interface ReactivateInput {
  clientId: string;
  reason: string;
  actorId: string;
  actorName: string;
}

export interface ReactivateResult {
  client: Awaited<ReturnType<typeof clientService.getClientById>>;
  lead: {
    id: string;
    fullName: string;
    status: LeadStatus;
    phone: string | null;
    email: string | null;
    assignedAgentId: string | null;
  };
  /** Whether we restored an existing lead or created a fresh one. */
  mode: 'RESTORED' | 'CREATED';
}

export async function reactivateClient(input: ReactivateInput): Promise<ReactivateResult> {
  const { clientId, reason, actorId, actorName } = input;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      linkedLead: { select: LEAD_RETURN_SELECT },
      assignedAgent: { select: AGENT_SELECT },
    },
  });
  if (!client) {
    const err = new Error('Client not found');
    (err as Error & { code?: string }).code = 'NOT_FOUND';
    throw err;
  }

  let lead: ReactivateResult['lead'];
  let mode: ReactivateResult['mode'];

  if (client.linkedLeadId && client.linkedLead) {
    // RESTORE path — flip status to NEW so the lead becomes active in the
    // funnel again. Other fields (assignment, tags, history, comms) are
    // intentionally preserved.
    const updated = await prisma.lead.update({
      where: { id: client.linkedLead.id },
      data: { status: 'NEW' },
      select: LEAD_RETURN_SELECT,
    });
    lead = updated;
    mode = 'RESTORED';
  } else {
    // CREATE path — synthesize a new lead from the client snapshot. We
    // mirror what the Lead → Client conversion modal prefills, just in
    // reverse: name, phone, email, notes, assigned agent, preferred
    // location, budget. Tags default to ['reactivated'] so the funnel can
    // segment these from cold leads.
    const created = await prisma.lead.create({
      data: {
        fullName: client.fullName,
        phone: client.phone || null,
        email: client.email || null,
        budget: client.budget != null ? new Prisma.Decimal(client.budget) : null,
        preferredLocation: client.preferredLocation || null,
        status: 'NEW',
        // Source MANUAL is the safest default — REFERRAL/OTHER also make
        // sense semantically but MANUAL keeps analytics buckets predictable.
        source: 'MANUAL',
        notes: client.notes || null,
        assignedAgentId: client.assignedAgentId || null,
        tags: ['reactivated'],
      },
      select: LEAD_RETURN_SELECT,
    });
    lead = created;
    mode = 'CREATED';

    // Attach the freshly-created lead to the client without unlinking
    // anything else (spec: "Do NOT unlink linkedLeadId").
    await prisma.client.update({
      where: { id: client.id },
      data: { linkedLeadId: created.id },
    });
  }

  // -- Activity trail (best-effort, never blocks the response) ----------
  const descBase =
    mode === 'RESTORED'
      ? `Client reactivated — existing lead "${lead.fullName}" reopened`
      : `Client reactivated — new lead "${lead.fullName}" created`;

  await clientService.logClientActivity({
    clientId: client.id,
    userId: actorId,
    action: 'CLIENT_REVERTED',
    description: `${descBase} · Reason: ${reason}`,
    metadata: {
      reason,
      mode,
      leadId: lead.id,
      previousLinkedLeadId: client.linkedLeadId,
      actorName,
    },
  });

  // Also surface on the lead's own Activity timeline so users browsing the
  // reactivated lead can immediately see WHY it was re-opened.
  await activityService.log({
    userId: actorId,
    leadId: lead.id,
    action: 'CLIENT_REVERTED',
    description:
      mode === 'RESTORED'
        ? `Reopened from client "${client.fullName}" · Reason: ${reason}`
        : `Created from reactivated client "${client.fullName}" · Reason: ${reason}`,
    metadata: { reason, mode, clientId: client.id },
  });

  // Fresh DTO for the caller (decimal → number, joined fields included).
  const refreshed = await clientService.getClientById(client.id);
  return { client: refreshed, lead, mode };
}

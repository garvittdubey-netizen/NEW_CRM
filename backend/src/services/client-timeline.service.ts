import { prisma } from '../lib/prisma';

/**
 * Composite timeline for the Client detail page.
 *
 * Sources merged into one sorted feed:
 *   1. `client_activities`       — lifecycle events tracked by this module.
 *   2. `communications`          — WhatsApp + call logs against the linked lead.
 *   3. `follow_ups`              — follow-ups scheduled for the linked lead.
 *   4. `activities`              — Activity feed entries tagged to the lead.
 *
 * Sources 2-4 are pulled only when `linkedLeadId` is set on the client and
 * are read-only — we never write back into those tables from here.
 */
export interface TimelineItem {
  id: string;
  /** Stable per-source prefix so a list React key never collides. */
  source: 'CLIENT' | 'COMMUNICATION' | 'FOLLOWUP' | 'ACTIVITY' | 'DEAL';
  action: string;
  description: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor?: { id: string; name: string } | null;
}

const AGENT_SELECT = { id: true, name: true } as const;

export async function buildClientTimeline(clientId: string): Promise<TimelineItem[]> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, linkedLeadId: true },
  });
  if (!client) return [];

  const items: TimelineItem[] = [];

  // 1. Native client lifecycle activities
  const clientActs = await prisma.clientActivity.findMany({
    where: { clientId: client.id },
    include: { user: { select: AGENT_SELECT } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  for (const a of clientActs) {
    items.push({
      id: `client:${a.id}`,
      source: 'CLIENT',
      action: a.action,
      description: a.description,
      metadata: (a.metadata as Record<string, unknown> | null) ?? null,
      createdAt: a.createdAt.toISOString(),
      actor: a.user ? { id: a.user.id, name: a.user.name } : null,
    });
  }

  if (client.linkedLeadId) {
    // 2. Communications (WhatsApp + calls) on the linked lead
    const comms = await prisma.communication.findMany({
      where: { leadId: client.linkedLeadId },
      include: { createdBy: { select: AGENT_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    for (const c of comms) {
      const direction = c.direction ? c.direction.toLowerCase() : 'outbound';
      const verb =
        c.type === 'CALL'
          ? `Call logged (${c.callOutcome || 'no outcome'})`
          : `WhatsApp ${direction}`;
      const preview = (c.message || c.templateName || '').slice(0, 140);
      items.push({
        id: `comm:${c.id}`,
        source: 'COMMUNICATION',
        action: c.type,
        description: preview ? `${verb}: ${preview}` : verb,
        metadata: null,
        createdAt: c.createdAt.toISOString(),
        actor: c.createdBy ? { id: c.createdBy.id, name: c.createdBy.name } : null,
      });
    }

    // 3. Follow-ups on the linked lead
    const followUps = await prisma.followUp.findMany({
      where: { leadId: client.linkedLeadId },
      include: { assignedAgent: { select: AGENT_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    for (const f of followUps) {
      const when = f.followUpDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
      });
      items.push({
        id: `fu:${f.id}`,
        source: 'FOLLOWUP',
        action: f.status,
        description: `Follow-up ${f.status.toLowerCase()} for ${when}${
          f.notes ? ` — ${f.notes.slice(0, 100)}` : ''
        }`,
        metadata: null,
        createdAt: f.createdAt.toISOString(),
        actor: f.assignedAgent
          ? { id: f.assignedAgent.id, name: f.assignedAgent.name }
          : null,
      });
    }

    // 4. Generic lead Activity entries
    const leadActs = await prisma.activity.findMany({
      where: { leadId: client.linkedLeadId },
      include: { user: { select: AGENT_SELECT } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    for (const a of leadActs) {
      items.push({
        id: `lact:${a.id}`,
        source: 'ACTIVITY',
        action: a.action,
        description: a.description,
        metadata: (a.metadata as Record<string, unknown> | null) ?? null,
        createdAt: a.createdAt.toISOString(),
        actor: a.user ? { id: a.user.id, name: a.user.name } : null,
      });
    }
  }

  // 5. Deals attached to this client — merges both the deal creation events
  //    AND every status/agent/amount transition logged in DealActivity. This
  //    is what closes the loop on the spec's unified timeline:
  //      Lead activity → Client conversion → Deal creation → Deal status events.
  const dealActs = await prisma.dealActivity.findMany({
    where: { deal: { clientId: client.id } },
    include: {
      user: { select: AGENT_SELECT },
      deal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  for (const da of dealActs) {
    items.push({
      id: `deal:${da.id}`,
      source: 'DEAL',
      action: da.eventType,
      description: da.notes
        ? `Deal "${da.deal.title}" — ${da.notes}`
        : `Deal "${da.deal.title}" — ${da.eventType.toLowerCase().replace(/_/g, ' ')}`,
      metadata: { dealId: da.dealId },
      createdAt: da.createdAt.toISOString(),
      actor: da.user ? { id: da.user.id, name: da.user.name } : null,
    });
  }

  // Merged + sorted newest-first; cap to 200 so the UI never blows up.
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, 200);
}

import { prisma } from '../lib/prisma';

/**
 * Read-only timeline for a Deal. Sourced exclusively from the
 * `deal_activities` table — Phase-2 scope is just the deal's own lifecycle
 * events (CREATED, STATUS_CHANGED, AMOUNT_UPDATED, AGENT_REASSIGNED,
 * NOTES_UPDATED). We expose the same shape used by the Client timeline so
 * the React component can stay generic.
 */
export interface DealTimelineItem {
  id: string;
  source: 'DEAL';
  eventType: string;
  notes: string | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

const ACTOR_SELECT = { id: true, name: true } as const;

export async function buildDealTimeline(dealId: string): Promise<DealTimelineItem[]> {
  const rows = await prisma.dealActivity.findMany({
    where: { dealId },
    include: { user: { select: ACTOR_SELECT } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return rows.map((r) => ({
    id: `deal:${r.id}`,
    source: 'DEAL',
    eventType: r.eventType,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    actor: r.user ? { id: r.user.id, name: r.user.name } : null,
  }));
}

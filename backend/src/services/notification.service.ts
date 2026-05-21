import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isAdminLevel } from '../lib/roles';

/**
 * Lightweight notifications service.
 *
 * Design notes:
 *   - NO new tables, NO background jobs, NO WebSockets. We just aggregate
 *     existing rows (`follow_ups`, `deal_activities`, `leads`) into a single
 *     flat feed sorted newest-first.
 *   - Mark-as-read state lives on the FRONTEND in `localStorage`, scoped per
 *     user — the server simply returns the data with a stable `createdAt`,
 *     and the client decides which items are "new" relative to its
 *     `notif:lastRead:{userId}` marker.
 *   - RBAC: ADMIN gets a tenant-wide feed; AGENT gets only items tied to
 *     leads / deals / follow-ups assigned to them. Both share the exact
 *     same response shape so the frontend stays generic.
 */

export type NotificationKind = 'FOLLOWUP' | 'DEAL_ACTIVITY' | 'LEAD_ASSIGNMENT';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  /** Where the notification points to in the SPA. Used by the frontend to
   *  navigate when an item is clicked. */
  href: string;
  /** ISO timestamp — the canonical sort key. */
  createdAt: string;
  actor?: { id: string; name: string } | null;
}

const PER_KIND_LIMIT = 5;

interface Scope {
  userId: string;
  userRole: string;
}

/**
 * Build the merged notifications feed for the caller.
 *
 * We deliberately query each kind independently and merge — Prisma can't
 * UNION across tables cleanly, and each kind needs slightly different
 * scoping. The total result is capped to 3 × PER_KIND_LIMIT items.
 */
export async function buildNotifications(scope: Scope): Promise<NotificationItem[]> {
  const { userId, userRole } = scope;
  const isAdmin = isAdminLevel(userRole);
  const now = new Date();

  // ── 1. Follow-up reminders ────────────────────────────────────────────────
  // Today + overdue, status=PENDING, scoped to the agent (or all for admin).
  // We sort by followUpDate so the most-urgent ones appear first.
  const fuWhere: Prisma.FollowUpWhereInput = {
    status: 'PENDING',
    followUpDate: { lte: addDays(now, 1) }, // today + earlier (i.e. due-soon + overdue)
  };
  if (!isAdmin) fuWhere.assignedAgentId = userId;

  const fus = await prisma.followUp.findMany({
    where: fuWhere,
    include: { lead: { select: { id: true, fullName: true } } },
    orderBy: { followUpDate: 'asc' },
    take: PER_KIND_LIMIT,
  });

  const fuItems: NotificationItem[] = fus.map((f) => {
    const dueDate = new Date(f.followUpDate);
    const overdue = dueDate.getTime() < startOfDay(now).getTime();
    return {
      id: `fu:${f.id}`,
      kind: 'FOLLOWUP',
      title: overdue ? 'Overdue follow-up' : 'Follow-up due',
      description: `${f.lead?.fullName ?? 'Unknown lead'} · ${formatWhen(dueDate)}`,
      href: f.lead ? `/leads/${f.lead.id}` : '/followups',
      // Surface time as createdAt so newer follow-ups float to the top of the
      // merged feed. For overdue items we keep the original creation time
      // so the unread-badge logic stays consistent.
      createdAt: f.createdAt.toISOString(),
    };
  });

  // ── 2. Deal activity events ───────────────────────────────────────────────
  // The agent only sees events on deals they own; admin sees everything.
  const dealActWhere: Prisma.DealActivityWhereInput = {};
  if (!isAdmin) {
    dealActWhere.deal = { assignedAgentId: userId };
  }
  const dealActs = await prisma.dealActivity.findMany({
    where: dealActWhere,
    include: {
      user: { select: { id: true, name: true } },
      deal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: PER_KIND_LIMIT,
  });

  const dealItems: NotificationItem[] = dealActs.map((a) => ({
    id: `da:${a.id}`,
    kind: 'DEAL_ACTIVITY',
    title: prettyDealEvent(a.eventType),
    description: `${a.deal?.title ?? 'Deal'}${a.notes ? ` · ${truncate(a.notes, 80)}` : ''}`,
    href: a.deal ? `/deals/${a.deal.id}` : '/deals',
    createdAt: a.createdAt.toISOString(),
    actor: a.user ? { id: a.user.id, name: a.user.name } : null,
  }));

  // ── 3. Lead assignments ───────────────────────────────────────────────────
  // For an AGENT this surfaces "leads recently assigned to you". For an
  // ADMIN we surface every newly-assigned lead (sorted by createdAt desc so
  // the freshest land at the top).
  const leadWhere: Prisma.LeadWhereInput = isAdmin
    ? { assignedAgentId: { not: null } }
    : { assignedAgentId: userId };

  const recentLeads = await prisma.lead.findMany({
    where: leadWhere,
    include: { assignedAgent: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: PER_KIND_LIMIT,
  });

  const leadItems: NotificationItem[] = recentLeads.map((l) => ({
    id: `la:${l.id}`,
    kind: 'LEAD_ASSIGNMENT',
    title: isAdmin
      ? `Lead assigned · ${l.assignedAgent?.name ?? 'Unassigned'}`
      : 'Lead assigned to you',
    description: `${l.fullName}${l.phone ? ` · ${l.phone}` : ''}`,
    href: `/leads/${l.id}`,
    createdAt: l.createdAt.toISOString(),
    actor: l.assignedAgent ? { id: l.assignedAgent.id, name: l.assignedAgent.name } : null,
  }));

  return [...fuItems, ...dealItems, ...leadItems].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatWhen(d: Date): string {
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function prettyDealEvent(eventType: string): string {
  switch (eventType) {
    case 'CREATED':
      return 'Deal created';
    case 'STATUS_CHANGED':
      return 'Deal status changed';
    case 'AMOUNT_UPDATED':
      return 'Deal amount updated';
    case 'AGENT_REASSIGNED':
      return 'Deal reassigned';
    case 'NOTES_UPDATED':
      return 'Deal notes updated';
    default:
      return 'Deal activity';
  }
}

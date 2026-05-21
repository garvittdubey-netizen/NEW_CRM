import {
  Prisma,
  LeadStatus,
  FollowUpStatus,
  CommunicationType,
  CommunicationDirection,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { isAdminLevel } from '../lib/roles';

/**
 * Analytics service — read-only aggregations over the existing CRM tables.
 *
 * RBAC scoping rules (applied via `buildLeadScope` / `buildFollowUpScope` /
 * `buildCommScope`):
 *   - ADMIN: sees the whole tenant (no extra filter).
 *   - AGENT: sees only rows tied to a lead currently assigned to them, or to
 *            follow-ups assigned to them.
 */

export type AnalyticsRange = 'today' | '7d' | '30d' | 'custom';

export interface RangeInput {
  range?: AnalyticsRange;
  from?: string; // ISO date string
  to?: string;   // ISO date string
}

export interface ResolvedRange {
  from: Date;
  to: Date;
  label: AnalyticsRange;
}

/**
 * Resolves a `range` query parameter into a concrete [from, to] window.
 * Defaults to the last 30 days. `custom` requires both `from` and `to`; if
 * either is missing we fall back to 30d so the dashboard never errors out.
 */
export function resolveRange(input: RangeInput): ResolvedRange {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);

  const range = input.range ?? '30d';

  if (range === 'today') {
    const from = new Date(now);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: 'today' };
  }

  if (range === '7d') {
    const from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    return { from, to, label: '7d' };
  }

  if (range === 'custom' && input.from && input.to) {
    const from = new Date(input.from);
    const customTo = new Date(input.to);
    if (!isNaN(from.getTime()) && !isNaN(customTo.getTime())) {
      from.setHours(0, 0, 0, 0);
      customTo.setHours(23, 59, 59, 999);
      return { from, to: customTo, label: 'custom' };
    }
  }

  // Default: last 30 days
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  return { from, to, label: '30d' };
}

interface Scope {
  userId: string;
  userRole: string;
}

/** Restricts the Lead query to leads visible to the caller. */
function buildLeadScope(scope: Scope, range: ResolvedRange): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {
    createdAt: { gte: range.from, lte: range.to },
  };
  if (scope.userRole === 'AGENT') {
    where.assignedAgentId = scope.userId;
  }
  return where;
}

/** Restricts the FollowUp query to follow-ups visible to the caller. */
function buildFollowUpScope(scope: Scope, range: ResolvedRange): Prisma.FollowUpWhereInput {
  const where: Prisma.FollowUpWhereInput = {
    createdAt: { gte: range.from, lte: range.to },
  };
  if (scope.userRole === 'AGENT') {
    where.assignedAgentId = scope.userId;
  }
  return where;
}

/** Restricts Communication queries to messages tied to leads the caller can see. */
function buildCommScope(scope: Scope, range: ResolvedRange): Prisma.CommunicationWhereInput {
  const where: Prisma.CommunicationWhereInput = {
    createdAt: { gte: range.from, lte: range.to },
  };
  if (scope.userRole === 'AGENT') {
    where.lead = { assignedAgentId: scope.userId };
  }
  return where;
}

// ── Overview ────────────────────────────────────────────────────────────────

export async function getOverview(scope: Scope, range: ResolvedRange) {
  const leadWhere = buildLeadScope(scope, range);

  const [totalLeads, wonLeads, lostLeads] = await Promise.all([
    prisma.lead.count({ where: leadWhere }),
    prisma.lead.count({ where: { ...leadWhere, status: 'WON' } }),
    prisma.lead.count({ where: { ...leadWhere, status: 'LOST' } }),
  ]);

  const conversionRate = totalLeads > 0 ? +(wonLeads / totalLeads * 100).toFixed(2) : 0;

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label },
    totalLeads,
    wonLeads,
    lostLeads,
    conversionRate, // percentage 0..100
  };
}

// ── Leads by status ─────────────────────────────────────────────────────────

const STATUS_ORDER: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATING',
  'WON',
  'LOST',
];

export async function getLeadsByStatus(scope: Scope, range: ResolvedRange) {
  const where = buildLeadScope(scope, range);

  const grouped = await prisma.lead.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });

  const map = new Map(grouped.map((g) => [g.status, g._count._all]));
  return STATUS_ORDER.map((status) => ({
    status,
    count: map.get(status) ?? 0,
  }));
}

// ── Leads by source ─────────────────────────────────────────────────────────

const SOURCE_ORDER = [
  'FACEBOOK',
  'WHATSAPP',
  'WEBSITE',
  'REFERRAL',
  'MANUAL',
  'PROPERTY_PORTAL',
  'OTHER',
] as const;

export async function getLeadsBySource(scope: Scope, range: ResolvedRange) {
  const where = buildLeadScope(scope, range);

  const grouped = await prisma.lead.groupBy({
    by: ['source'],
    where,
    _count: { _all: true },
  });

  const map = new Map(grouped.map((g) => [g.source, g._count._all]));
  return SOURCE_ORDER.map((source) => ({
    source,
    count: map.get(source) ?? 0,
  }));
}

// ── Follow-ups ──────────────────────────────────────────────────────────────

const FOLLOWUP_STATUSES: FollowUpStatus[] = ['PENDING', 'COMPLETED', 'MISSED'];

export async function getFollowUpStats(scope: Scope, range: ResolvedRange) {
  const where = buildFollowUpScope(scope, range);

  const grouped = await prisma.followUp.groupBy({
    by: ['status'],
    where,
    _count: { _all: true },
  });

  const map = new Map(grouped.map((g) => [g.status, g._count._all]));
  const byStatus = FOLLOWUP_STATUSES.map((status) => ({
    status,
    count: map.get(status) ?? 0,
  }));

  const total = byStatus.reduce((acc, row) => acc + row.count, 0);
  const completed = map.get('COMPLETED') ?? 0;
  const completionRate = total > 0 ? +(completed / total * 100).toFixed(2) : 0;

  return { byStatus, total, completed, completionRate };
}

// ── Agent performance ───────────────────────────────────────────────────────

/**
 * Per-agent breakdown of assigned leads + outcomes.
 *
 * - ADMIN: returns every agent with at least one assigned lead OR an explicit
 *   row in `users` with role=AGENT (so newly-onboarded agents show up at 0).
 * - AGENT: returns exactly one row — the caller's own card.
 */
export async function getAgentPerformance(scope: Scope, range: ResolvedRange) {
  const isAdmin = isAdminLevel(scope.userRole);

  const agents = await prisma.user.findMany({
    where: isAdmin ? { role: 'AGENT' } : { id: scope.userId },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: 'asc' },
  });

  if (agents.length === 0) return [];

  const agentIds = agents.map((a) => a.id);
  const inRange: Prisma.LeadWhereInput = {
    assignedAgentId: { in: agentIds },
    createdAt: { gte: range.from, lte: range.to },
  };

  const grouped = await prisma.lead.groupBy({
    by: ['assignedAgentId', 'status'],
    where: inRange,
    _count: { _all: true },
  });

  type Bucket = { assigned: number; contacted: number; won: number; lost: number };
  const counts = new Map<string, Bucket>();
  for (const id of agentIds) {
    counts.set(id, { assigned: 0, contacted: 0, won: 0, lost: 0 });
  }

  for (const row of grouped) {
    if (!row.assignedAgentId) continue;
    const bucket = counts.get(row.assignedAgentId);
    if (!bucket) continue;
    const n = row._count._all;
    bucket.assigned += n;
    if (row.status === 'CONTACTED') bucket.contacted += n;
    if (row.status === 'WON') bucket.won += n;
    if (row.status === 'LOST') bucket.lost += n;
  }

  return agents.map((a) => {
    const b = counts.get(a.id)!;
    const conversionRate = b.assigned > 0 ? +(b.won / b.assigned * 100).toFixed(2) : 0;
    return {
      agentId: a.id,
      agentName: a.name,
      agentEmail: a.email,
      assignedLeads: b.assigned,
      contactedLeads: b.contacted,
      wonLeads: b.won,
      lostLeads: b.lost,
      conversionRate,
    };
  });
}

// ── Communication metrics ───────────────────────────────────────────────────

export async function getCommunicationStats(scope: Scope, range: ResolvedRange) {
  const where = buildCommScope(scope, range);

  const grouped = await prisma.communication.groupBy({
    by: ['type', 'direction'],
    where,
    _count: { _all: true },
  });

  let messagesSent = 0;
  let messagesReceived = 0;
  let callsLogged = 0;

  for (const row of grouped) {
    const n = row._count._all;
    if (row.type === CommunicationType.WHATSAPP) {
      if (row.direction === CommunicationDirection.OUTBOUND) messagesSent += n;
      else if (row.direction === CommunicationDirection.INBOUND) messagesReceived += n;
    } else if (row.type === CommunicationType.CALL) {
      callsLogged += n;
    }
  }

  return {
    messagesSent,
    messagesReceived,
    callsLogged,
    total: messagesSent + messagesReceived + callsLogged,
  };
}

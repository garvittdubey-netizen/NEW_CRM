import {
  Prisma,
  LeadStatus,
  LeadSource,
  PropertyStatus,
  DealStatus,
  FollowUpStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Reports service — tenant-wide aggregations powering the ADMIN-only
 * `/reports` page. Unlike the dashboard analytics service these queries
 * are NOT range-scoped by default (a "Total clients" card is most useful
 * as an absolute number), but the lead/deal queries accept an optional
 * range filter so the page can offer a "This month / 7d / 30d" toggle.
 *
 * RBAC enforcement lives at the router layer (`requireRole('ADMIN')`), so
 * this service trusts that only an admin reaches it.
 */

const LEAD_STATUS_ORDER: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATING',
  'WON',
  'LOST',
];

const LEAD_SOURCE_ORDER: LeadSource[] = [
  'FACEBOOK',
  'WHATSAPP',
  'WEBSITE',
  'REFERRAL',
  'MANUAL',
  'PROPERTY_PORTAL',
  'OTHER',
];

const PROPERTY_STATUS_ORDER: PropertyStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD'];

const DEAL_STATUS_ORDER: DealStatus[] = [
  'NEW',
  'NEGOTIATION',
  'DOCUMENTATION',
  'PAYMENT_PENDING',
  'WON',
  'LOST',
];

export interface ReportRange {
  from?: Date;
  to?: Date;
}

function leadDateFilter(r?: ReportRange): Prisma.LeadWhereInput {
  if (!r?.from && !r?.to) return {};
  const filter: Prisma.DateTimeFilter = {};
  if (r.from) filter.gte = r.from;
  if (r.to) filter.lte = r.to;
  return { createdAt: filter };
}

// ── Lead report ─────────────────────────────────────────────────────────────

export async function getLeadReport(range?: ReportRange) {
  const where = leadDateFilter(range);

  const [total, byStatusRaw, bySourceRaw] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ['status'], where, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ['source'], where, _count: { _all: true } }),
  ]);

  const statusMap = new Map(byStatusRaw.map((g) => [g.status, g._count._all]));
  const sourceMap = new Map(bySourceRaw.map((g) => [g.source, g._count._all]));

  const byStatus = LEAD_STATUS_ORDER.map((s) => ({ status: s, count: statusMap.get(s) ?? 0 }));
  const bySource = LEAD_SOURCE_ORDER.map((s) => ({ source: s, count: sourceMap.get(s) ?? 0 }));

  const won = statusMap.get('WON') ?? 0;
  const conversionRate = total > 0 ? +((won / total) * 100).toFixed(2) : 0;

  return { total, byStatus, bySource, won, conversionRate };
}

// ── Property report ─────────────────────────────────────────────────────────

export async function getPropertyReport() {
  const [total, byStatusRaw] = await Promise.all([
    prisma.property.count(),
    prisma.property.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const map = new Map(byStatusRaw.map((g) => [g.status, g._count._all]));
  const byStatus = PROPERTY_STATUS_ORDER.map((s) => ({ status: s, count: map.get(s) ?? 0 }));
  const available = map.get('AVAILABLE') ?? 0;
  const sold = map.get('SOLD') ?? 0;
  return { total, byStatus, available, sold };
}

// ── Client report ───────────────────────────────────────────────────────────

export async function getClientReport() {
  const [total, linked] = await Promise.all([
    prisma.client.count(),
    prisma.client.count({ where: { linkedLeadId: { not: null } } }),
  ]);
  const unlinked = total - linked;
  return { total, linked, unlinked };
}

// ── Deal report ─────────────────────────────────────────────────────────────

export async function getDealReport(range?: ReportRange) {
  const dateFilter: Prisma.DealWhereInput =
    range?.from || range?.to
      ? {
          createdAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.to ? { lte: range.to } : {}),
          },
        }
      : {};

  const [total, byStatusRaw, totals] = await Promise.all([
    prisma.deal.count({ where: dateFilter }),
    prisma.deal.groupBy({
      by: ['status'],
      where: dateFilter,
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.deal.aggregate({ where: dateFilter, _sum: { amount: true } }),
  ]);

  const map = new Map(byStatusRaw.map((g) => [g.status, g]));
  const byStatus = DEAL_STATUS_ORDER.map((s) => {
    const row = map.get(s);
    return {
      status: s,
      count: row?._count._all ?? 0,
      value: row?._sum.amount != null ? Number(row._sum.amount) : 0,
    };
  });

  // Revenue trend: last 12 calendar months, WON deals only, summed by
  // month-of-createdAt. Done as a raw query so we don't have to load every
  // deal into memory.
  const trendRows = await prisma.$queryRaw<
    { month: Date; revenue: string | number; count: bigint }[]
  >`
    SELECT
      date_trunc('month', "createdAt") AS month,
      COALESCE(SUM("amount"), 0)        AS revenue,
      COUNT(*)                          AS count
    FROM "deals"
    WHERE "status" = 'WON'
      AND "createdAt" >= NOW() - INTERVAL '12 months'
    GROUP BY month
    ORDER BY month ASC
  `;

  const revenueTrend = trendRows.map((r) => ({
    month: new Date(r.month).toISOString().slice(0, 7),
    revenue: Number(r.revenue) || 0,
    count: Number(r.count) || 0,
  }));

  return {
    total,
    byStatus,
    totalValue: Number(totals._sum.amount ?? 0),
    wonCount: map.get('WON')?._count._all ?? 0,
    lostCount: map.get('LOST')?._count._all ?? 0,
    revenueTrend,
  };
}

// ── Agent report ────────────────────────────────────────────────────────────

/**
 * Per-agent rollup combining:
 *   - dealsCount       — total deals assigned to the agent
 *   - wonDealsCount    — subset where status = WON (success indicator)
 *   - leadsCount       — total leads assigned
 *   - leadConversion   — wonLeads / assignedLeads %
 *   - followUpDone     — followUps with status = COMPLETED for the agent
 *   - followUpTotal    — total followUps assigned
 *   - followUpRate     — followUpDone / followUpTotal %
 */
export async function getAgentReport() {
  const agents = await prisma.user.findMany({
    where: { role: 'AGENT' },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  if (agents.length === 0) return [];
  const agentIds = agents.map((a) => a.id);

  const [dealRows, leadRows, fuRows] = await Promise.all([
    prisma.deal.groupBy({
      by: ['assignedAgentId', 'status'],
      where: { assignedAgentId: { in: agentIds } },
      _count: { _all: true },
    }),
    prisma.lead.groupBy({
      by: ['assignedAgentId', 'status'],
      where: { assignedAgentId: { in: agentIds } },
      _count: { _all: true },
    }),
    prisma.followUp.groupBy({
      by: ['assignedAgentId', 'status'],
      where: { assignedAgentId: { in: agentIds } },
      _count: { _all: true },
    }),
  ]);

  interface Bucket {
    dealsCount: number;
    wonDealsCount: number;
    leadsCount: number;
    wonLeadsCount: number;
    followUpDone: number;
    followUpTotal: number;
  }

  const buckets = new Map<string, Bucket>();
  for (const id of agentIds) {
    buckets.set(id, {
      dealsCount: 0,
      wonDealsCount: 0,
      leadsCount: 0,
      wonLeadsCount: 0,
      followUpDone: 0,
      followUpTotal: 0,
    });
  }

  for (const r of dealRows) {
    if (!r.assignedAgentId) continue;
    const b = buckets.get(r.assignedAgentId);
    if (!b) continue;
    b.dealsCount += r._count._all;
    if (r.status === 'WON') b.wonDealsCount += r._count._all;
  }
  for (const r of leadRows) {
    if (!r.assignedAgentId) continue;
    const b = buckets.get(r.assignedAgentId);
    if (!b) continue;
    b.leadsCount += r._count._all;
    if (r.status === 'WON') b.wonLeadsCount += r._count._all;
  }
  for (const r of fuRows) {
    const b = buckets.get(r.assignedAgentId);
    if (!b) continue;
    b.followUpTotal += r._count._all;
    if (r.status === FollowUpStatus.COMPLETED) b.followUpDone += r._count._all;
  }

  return agents.map((a) => {
    const b = buckets.get(a.id)!;
    const leadConversion =
      b.leadsCount > 0 ? +((b.wonLeadsCount / b.leadsCount) * 100).toFixed(2) : 0;
    const followUpRate =
      b.followUpTotal > 0 ? +((b.followUpDone / b.followUpTotal) * 100).toFixed(2) : 0;
    return {
      agentId: a.id,
      agentName: a.name,
      agentEmail: a.email,
      dealsCount: b.dealsCount,
      wonDealsCount: b.wonDealsCount,
      leadsCount: b.leadsCount,
      wonLeadsCount: b.wonLeadsCount,
      leadConversion,
      followUpDone: b.followUpDone,
      followUpTotal: b.followUpTotal,
      followUpRate,
    };
  });
}

import { Prisma, FollowUpStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Minimal shape used when embedding the assigned agent in responses. */
const AGENT_SELECT = { id: true, name: true, email: true } as const;

/** Minimal shape used when embedding the parent lead in responses. */
const LEAD_SELECT = { id: true, fullName: true, status: true, phone: true } as const;

export interface ListFollowUpsOptions {
  /** Optional filter: only follow-ups for a single lead */
  leadId?: string;
  /** Optional filter: only follow-ups assigned to a specific agent */
  assignedAgentId?: string;
  /** Optional filter: status enum value */
  status?: string;
  /**
   * Window helper — pass 'upcoming' for follow-ups due today or later that are
   * still pending, 'overdue' for past follow-ups still pending, or 'today' for
   * follow-ups scheduled for today regardless of status.
   */
  window?: 'upcoming' | 'overdue' | 'today';
  /** Identity of the calling user — used for role-based scoping. */
  userId: string;
  userRole: string;
  page?: number;
  limit?: number;
}

/**
 * Builds the where clause for the follow-up list query.
 *
 * Role rules mirror the lead module:
 *   - ADMIN: sees everything (subject to explicit filters)
 *   - AGENT: only sees follow-ups whose assignedAgentId matches the caller.
 */
function buildWhere(opts: ListFollowUpsOptions): Prisma.FollowUpWhereInput {
  const where: Prisma.FollowUpWhereInput = {};

  if (opts.userRole === 'AGENT') {
    where.assignedAgentId = opts.userId;
  }

  if (opts.leadId) where.leadId = opts.leadId;
  if (opts.assignedAgentId) where.assignedAgentId = opts.assignedAgentId;
  if (opts.status && opts.status !== 'ALL') {
    where.status = opts.status as FollowUpStatus;
  }

  const now = new Date();
  if (opts.window === 'upcoming') {
    where.status = FollowUpStatus.PENDING;
    where.followUpDate = { gte: now };
  } else if (opts.window === 'overdue') {
    where.status = FollowUpStatus.PENDING;
    where.followUpDate = { lt: now };
  } else if (opts.window === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    where.followUpDate = { gte: start, lte: end };
  }

  return where;
}

export async function listFollowUps(opts: ListFollowUpsOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50));
  const where = buildWhere(opts);

  const [items, total] = await Promise.all([
    prisma.followUp.findMany({
      where,
      include: {
        lead: { select: LEAD_SELECT },
        assignedAgent: { select: AGENT_SELECT },
      },
      orderBy: { followUpDate: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.followUp.count({ where }),
  ]);

  return {
    followUps: items,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

export async function getFollowUpById(id: string) {
  return prisma.followUp.findUnique({
    where: { id },
    include: {
      lead: { select: LEAD_SELECT },
      assignedAgent: { select: AGENT_SELECT },
    },
  });
}

export interface FollowUpInput {
  leadId: string;
  assignedAgentId: string;
  followUpDate: string | Date;
  reminderDate?: string | Date | null;
  status?: string;
  notes?: string | null;
}

export async function createFollowUp(input: FollowUpInput) {
  return prisma.followUp.create({
    data: {
      leadId: input.leadId,
      assignedAgentId: input.assignedAgentId,
      followUpDate: new Date(input.followUpDate),
      reminderDate: input.reminderDate ? new Date(input.reminderDate) : null,
      status: (input.status as FollowUpStatus) || 'PENDING',
      notes: input.notes?.trim() || null,
    },
    include: {
      lead: { select: LEAD_SELECT },
      assignedAgent: { select: AGENT_SELECT },
    },
  });
}

export async function updateFollowUp(id: string, input: Partial<FollowUpInput>) {
  const data: Record<string, unknown> = {};
  if (input.leadId !== undefined) data.leadId = input.leadId;
  if (input.assignedAgentId !== undefined) data.assignedAgentId = input.assignedAgentId;
  if (input.followUpDate !== undefined) data.followUpDate = new Date(input.followUpDate);
  if (input.reminderDate !== undefined) {
    data.reminderDate = input.reminderDate ? new Date(input.reminderDate) : null;
  }
  if (input.status !== undefined) data.status = input.status as FollowUpStatus;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  return prisma.followUp.update({
    where: { id },
    data,
    include: {
      lead: { select: LEAD_SELECT },
      assignedAgent: { select: AGENT_SELECT },
    },
  });
}

export async function deleteFollowUp(id: string): Promise<void> {
  await prisma.followUp.delete({ where: { id } });
}

/**
 * Counts used by the dashboard cards.
 * AGENTs see counts scoped to their own follow-ups; ADMINs see global totals.
 */
export async function getDashboardCounts(userId: string, userRole: string) {
  const scope: Prisma.FollowUpWhereInput =
    userRole === 'AGENT' ? { assignedAgentId: userId } : {};

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const [todayCount, overdueCount, upcomingCount] = await Promise.all([
    prisma.followUp.count({
      where: { ...scope, followUpDate: { gte: startOfToday, lte: endOfToday } },
    }),
    prisma.followUp.count({
      where: { ...scope, status: 'PENDING', followUpDate: { lt: startOfToday } },
    }),
    prisma.followUp.count({
      where: { ...scope, status: 'PENDING', followUpDate: { gte: now } },
    }),
  ]);

  return { today: todayCount, overdue: overdueCount, upcoming: upcomingCount };
}

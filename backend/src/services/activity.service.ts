/**
 * Activity log service.
 *
 * Persists a short, human-readable line per user action so the team activity
 * feed and dashboard widget can show "Alice sent a WhatsApp message to John
 * Doe" / "Bob logged a call with Jane (5m, INTERESTED)".
 *
 * `log()` is fire-and-forget: it never throws to the caller. We catch and
 * log so the parent business action (e.g. sending a message) is not rolled
 * back if activity persistence fails.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface LogActivityInput {
  userId: string;
  leadId?: string | null;
  action: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export async function log(input: LogActivityInput): Promise<void> {
  try {
    await prisma.activity.create({
      data: {
        userId: input.userId,
        leadId: input.leadId ?? null,
        action: input.action,
        description: input.description,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
  } catch (err) {
    console.error('[activity.log] Failed to persist activity:', err);
  }
}

export interface ListActivitiesOptions {
  userId?: string;
  leadId?: string;
  action?: string;
  /** Calling user identity — drives RBAC scoping (admin sees all). */
  callerId: string;
  callerRole: string;
  page?: number;
  limit?: number;
}

const USER_SELECT = { id: true, name: true, email: true, role: true } as const;
const LEAD_SELECT = { id: true, fullName: true } as const;

export async function list(opts: ListActivitiesOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
  const where: Prisma.ActivityWhereInput = {};

  if (opts.callerRole === 'AGENT') {
    // Agents see activities they performed OR activities about leads
    // currently assigned to them.
    where.OR = [
      { userId: opts.callerId },
      { lead: { assignedAgentId: opts.callerId } },
    ];
  }
  if (opts.userId) where.userId = opts.userId;
  if (opts.leadId) where.leadId = opts.leadId;
  if (opts.action) where.action = opts.action;

  const [items, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      include: {
        user: { select: USER_SELECT },
        lead: { select: LEAD_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activity.count({ where }),
  ]);

  return { activities: items, total, page, limit, pages: Math.ceil(total / limit) };
}

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const AGENT_SELECT = { id: true, name: true, email: true, role: true } as const;
const LINKED_LEAD_SELECT = {
  id: true,
  fullName: true,
  status: true,
  phone: true,
} as const;

/** Decimal → number for clean JSON. */
function toDto(c: any) {
  return { ...c, budget: c.budget != null ? Number(c.budget) : null };
}

/**
 * RBAC scope helper — mirrors the Lead module exactly so the behaviour is
 * predictable across the app:
 *   ADMIN  → no scoping
 *   AGENT  → only clients assigned to themselves
 */
export function buildClientScope(userId: string, userRole: string): Prisma.ClientWhereInput {
  return userRole === 'AGENT' ? { assignedAgentId: userId } : {};
}

export interface ClientListParams {
  page?: number;
  limit?: number;
  search?: string;
  assignedAgentId?: string;
  linkedLeadId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  userRole: string;
}

export async function listClients(opts: ClientListParams) {
  const {
    page = 1,
    limit = 20,
    search,
    assignedAgentId,
    linkedLeadId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    userId,
    userRole,
  } = opts;

  const where: Prisma.ClientWhereInput = { ...buildClientScope(userId, userRole) };

  if (search?.trim()) {
    const term = search.trim();
    where.OR = [
      { fullName: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { preferredLocation: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (assignedAgentId && assignedAgentId !== 'ALL') {
    where.assignedAgentId = assignedAgentId;
  }
  if (linkedLeadId) {
    where.linkedLeadId = linkedLeadId === 'NONE' ? null : linkedLeadId;
  }

  const validSortFields = ['fullName', 'createdAt', 'updatedAt', 'budget'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      include: {
        assignedAgent: { select: AGENT_SELECT },
        linkedLead: { select: LINKED_LEAD_SELECT },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [orderField]: sortOrder },
    }),
    prisma.client.count({ where }),
  ]);

  return {
    clients: clients.map(toDto),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getClientById(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      assignedAgent: { select: AGENT_SELECT },
      linkedLead: { select: LINKED_LEAD_SELECT },
    },
  });
  return client ? toDto(client) : null;
}

export interface ClientInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  budget?: number | null;
  preferredLocation?: string | null;
  notes?: string | null;
  linkedLeadId?: string | null;
  assignedAgentId?: string | null;
}

export async function createClient(input: ClientInput) {
  const client = await prisma.client.create({
    data: {
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      budget: input.budget != null ? new Prisma.Decimal(input.budget) : null,
      preferredLocation: input.preferredLocation?.trim() || null,
      notes: input.notes?.trim() || null,
      linkedLeadId: input.linkedLeadId || null,
      assignedAgentId: input.assignedAgentId || null,
    },
    include: {
      assignedAgent: { select: AGENT_SELECT },
      linkedLead: { select: LINKED_LEAD_SELECT },
    },
  });
  return toDto(client);
}

export async function updateClient(id: string, input: Partial<ClientInput>) {
  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data.fullName = input.fullName.trim();
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.budget !== undefined)
    data.budget = input.budget != null ? new Prisma.Decimal(input.budget) : null;
  if (input.preferredLocation !== undefined)
    data.preferredLocation = input.preferredLocation?.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.linkedLeadId !== undefined) data.linkedLeadId = input.linkedLeadId || null;
  if (input.assignedAgentId !== undefined) data.assignedAgentId = input.assignedAgentId || null;

  const client = await prisma.client.update({
    where: { id },
    data,
    include: {
      assignedAgent: { select: AGENT_SELECT },
      linkedLead: { select: LINKED_LEAD_SELECT },
    },
  });
  return toDto(client);
}

export async function deleteClient(id: string): Promise<void> {
  await prisma.client.delete({ where: { id } });
}

/**
 * Records a single lifecycle event for a client. Failures are swallowed
 * (the parent write — create/update/etc — must never be rolled back by an
 * activity-log glitch).
 */
export async function logClientActivity(input: {
  clientId: string;
  userId: string | null;
  action: string;
  description: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    await prisma.clientActivity.create({
      data: {
        clientId: input.clientId,
        userId: input.userId,
        action: input.action,
        description: input.description,
        metadata: (input.metadata ?? null) as Prisma.InputJsonValue | null,
      },
    });
  } catch (e) {
    console.warn('[client.activity]', e);
  }
}

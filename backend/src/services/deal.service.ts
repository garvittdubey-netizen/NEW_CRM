import { Prisma, DealStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';

const AGENT_SELECT = { id: true, name: true, email: true, role: true } as const;
const PROPERTY_SELECT = {
  id: true,
  title: true,
  city: true,
  location: true,
  price: true,
  images: true,
  status: true,
} as const;
const CLIENT_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  email: true,
} as const;

/** Decimal → number conversion for clean JSON serialization. */
function toDto(d: any) {
  return {
    ...d,
    amount: d.amount != null ? Number(d.amount) : null,
    property: d.property
      ? { ...d.property, price: d.property.price != null ? Number(d.property.price) : null }
      : null,
  };
}

/**
 * RBAC scope helper — mirrors the Lead/Client modules exactly:
 *   ADMIN → no scoping
 *   AGENT → only deals where they are the assigned agent
 */
export function buildDealScope(userId: string, userRole: string): Prisma.DealWhereInput {
  return userRole === 'AGENT' ? { assignedAgentId: userId } : {};
}

export interface DealListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  assignedAgentId?: string;
  /** Filter by linked property — used by the Property detail page to show
   *  the count of deals attached to a given property. Additive, optional. */
  propertyId?: string;
  /** Filter by linked client — used by the Client detail page to show the
   *  client's existing deals. Additive, optional. */
  clientId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  userRole: string;
}

export async function listDeals(opts: DealListParams) {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    assignedAgentId,
    propertyId,
    clientId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    userId,
    userRole,
  } = opts;

  const where: Prisma.DealWhereInput = { ...buildDealScope(userId, userRole) };

  // Search spans the deal's own title/notes AND the joined property title /
  // client fullName so agents can find a deal by "the client we showed Bandra".
  if (search?.trim()) {
    const term = search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { notes: { contains: term, mode: 'insensitive' } },
      { property: { title: { contains: term, mode: 'insensitive' } } },
      { property: { city: { contains: term, mode: 'insensitive' } } },
      { client: { fullName: { contains: term, mode: 'insensitive' } } },
      { client: { phone: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (status && status !== 'ALL') where.status = status as DealStatus;
  if (assignedAgentId && assignedAgentId !== 'ALL') where.assignedAgentId = assignedAgentId;
  if (propertyId) where.propertyId = propertyId;
  if (clientId) where.clientId = clientId;

  const validSortFields = ['title', 'amount', 'createdAt', 'updatedAt', 'expectedClosingDate'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [deals, total] = await Promise.all([
    prisma.deal.findMany({
      where,
      include: {
        assignedAgent: { select: AGENT_SELECT },
        property: { select: PROPERTY_SELECT },
        client: { select: CLIENT_SELECT },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [orderField]: sortOrder },
    }),
    prisma.deal.count({ where }),
  ]);

  return {
    deals: deals.map(toDto),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getDealById(id: string) {
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      assignedAgent: { select: AGENT_SELECT },
      property: { select: PROPERTY_SELECT },
      client: { select: CLIENT_SELECT },
    },
  });
  return deal ? toDto(deal) : null;
}

export interface DealInput {
  title: string;
  propertyId: string;
  clientId: string;
  assignedAgentId?: string | null;
  amount: number;
  expectedClosingDate?: string | null;
  status?: string;
  notes?: string | null;
}

export async function createDeal(input: DealInput) {
  const deal = await prisma.deal.create({
    data: {
      title: input.title.trim(),
      propertyId: input.propertyId,
      clientId: input.clientId,
      assignedAgentId: input.assignedAgentId!,
      amount: new Prisma.Decimal(input.amount),
      expectedClosingDate: input.expectedClosingDate ? new Date(input.expectedClosingDate) : null,
      status: (input.status as DealStatus) || 'NEW',
      notes: input.notes?.trim() || null,
    },
    include: {
      assignedAgent: { select: AGENT_SELECT },
      property: { select: PROPERTY_SELECT },
      client: { select: CLIENT_SELECT },
    },
  });
  return toDto(deal);
}

export async function updateDeal(id: string, input: Partial<DealInput>) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.propertyId !== undefined) data.propertyId = input.propertyId;
  if (input.clientId !== undefined) data.clientId = input.clientId;
  if (input.assignedAgentId !== undefined) data.assignedAgentId = input.assignedAgentId;
  if (input.amount !== undefined) data.amount = new Prisma.Decimal(input.amount);
  if (input.expectedClosingDate !== undefined) {
    data.expectedClosingDate = input.expectedClosingDate
      ? new Date(input.expectedClosingDate)
      : null;
  }
  if (input.status !== undefined) data.status = input.status as DealStatus;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

  const deal = await prisma.deal.update({
    where: { id },
    data,
    include: {
      assignedAgent: { select: AGENT_SELECT },
      property: { select: PROPERTY_SELECT },
      client: { select: CLIENT_SELECT },
    },
  });
  return toDto(deal);
}

export async function deleteDeal(id: string): Promise<void> {
  await prisma.deal.delete({ where: { id } });
}

/**
 * Records a single lifecycle event for a deal. Failures are swallowed so the
 * parent write (create/update/delete) is never rolled back by an activity-log
 * glitch. Mirrors `logClientActivity` from the Client module.
 */
export async function logDealActivity(input: {
  dealId: string;
  userId: string | null;
  eventType: string;
  notes?: string | null;
}): Promise<void> {
  try {
    await prisma.dealActivity.create({
      data: {
        dealId: input.dealId,
        userId: input.userId,
        eventType: input.eventType,
        notes: input.notes ?? null,
      },
    });
  } catch (e) {
    console.warn('[deal.activity]', e);
  }
}

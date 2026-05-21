import { Prisma, LeadStatus, LeadSource } from '@prisma/client';
import { prisma } from '../lib/prisma';

const AGENT_SELECT = { id: true, name: true, email: true } as const;

// Converts Prisma Decimal to a plain number for JSON serialization
function toDto(lead: any) {
  return { ...lead, budget: lead.budget != null ? Number(lead.budget) : null };
}

export interface GetLeadsOptions {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  propertyType?: string;
  bhk?: string;
  assignedAgentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId: string;
  userRole: string;
}

export async function getLeads(opts: GetLeadsOptions) {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    propertyType,
    bhk,
    assignedAgentId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    userId,
    userRole,
  } = opts;

  const where: Prisma.LeadWhereInput = {};

  // Agents see only their assigned leads
  if (userRole === 'AGENT') {
    where.assignedAgentId = userId;
  }

  if (search?.trim()) {
    where.OR = [
      { fullName: { contains: search.trim(), mode: 'insensitive' } },
      { phone: { contains: search.trim(), mode: 'insensitive' } },
      { email: { contains: search.trim(), mode: 'insensitive' } },
      { preferredLocation: { contains: search.trim(), mode: 'insensitive' } },
    ];
  }

  if (status && status !== 'ALL') where.status = status as LeadStatus;
  if (propertyType && propertyType !== 'ALL') where.propertyType = propertyType;
  if (bhk && bhk !== 'ALL') where.bhk = bhk;
  if (assignedAgentId) where.assignedAgentId = assignedAgentId;

  const validSortFields = ['fullName', 'createdAt', 'updatedAt', 'budget', 'status'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: { assignedAgent: { select: AGENT_SELECT } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [orderField]: sortOrder },
    }),
    prisma.lead.count({ where }),
  ]);

  return {
    leads: leads.map(toDto),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

export async function getLeadById(id: string) {
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: { assignedAgent: { select: AGENT_SELECT } },
  });
  return lead ? toDto(lead) : null;
}

export interface LeadInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  budget?: number | null;
  preferredLocation?: string | null;
  bhk?: string | null;
  propertyType?: string | null;
  status?: string;
  source?: string;
  tags?: string[];
  notes?: string | null;
  assignedAgentId?: string | null;
}

export async function createLead(input: LeadInput) {
  const lead = await prisma.lead.create({
    data: {
      fullName: input.fullName.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      budget: input.budget != null ? new Prisma.Decimal(input.budget) : null,
      preferredLocation: input.preferredLocation?.trim() || null,
      bhk: input.bhk || null,
      propertyType: input.propertyType || null,
      status: (input.status as LeadStatus) || 'NEW',
      source: (input.source as LeadSource) || 'MANUAL',
      tags: input.tags ?? [],
      notes: input.notes?.trim() || null,
      assignedAgentId: input.assignedAgentId || null,
    },
    include: { assignedAgent: { select: AGENT_SELECT } },
  });
  return toDto(lead);
}

export async function updateLead(id: string, input: Partial<LeadInput>) {
  // Build update object with only defined fields
  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data.fullName = input.fullName.trim();
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.email !== undefined) data.email = input.email?.trim() || null;
  if (input.budget !== undefined) data.budget = input.budget != null ? new Prisma.Decimal(input.budget) : null;
  if (input.preferredLocation !== undefined) data.preferredLocation = input.preferredLocation?.trim() || null;
  if (input.bhk !== undefined) data.bhk = input.bhk || null;
  if (input.propertyType !== undefined) data.propertyType = input.propertyType || null;
  if (input.status !== undefined) data.status = input.status as LeadStatus;
  if (input.source !== undefined) data.source = input.source as LeadSource;
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.assignedAgentId !== undefined) data.assignedAgentId = input.assignedAgentId || null;

  const lead = await prisma.lead.update({
    where: { id },
    data,
    include: { assignedAgent: { select: AGENT_SELECT } },
  });
  return toDto(lead);
}

export async function deleteLead(id: string): Promise<void> {
  await prisma.lead.delete({ where: { id } });
}

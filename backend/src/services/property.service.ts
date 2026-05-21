import { Prisma, PropertyStatus, AreaUnit } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { deleteAssetByUrl } from './cloudinary.service';

const AGENT_SELECT = { id: true, name: true, email: true, role: true } as const;

/** Convert Decimal → number for clean JSON serialization to the frontend. */
function toDto(p: any) {
  return { ...p, price: p.price != null ? Number(p.price) : null };
}

export interface PropertyListParams {
  page?: number;
  limit?: number;
  search?: string;
  propertyType?: string;
  city?: string;
  status?: string;
  minPrice?: number;
  maxPrice?: number;
  ownerAgentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export async function listProperties(opts: PropertyListParams) {
  const {
    page = 1,
    limit = 20,
    search,
    propertyType,
    city,
    status,
    minPrice,
    maxPrice,
    ownerAgentId,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = opts;

  const where: Prisma.PropertyWhereInput = {};

  if (search?.trim()) {
    const term = search.trim();
    where.OR = [
      { title: { contains: term, mode: 'insensitive' } },
      { location: { contains: term, mode: 'insensitive' } },
      { city: { contains: term, mode: 'insensitive' } },
      { description: { contains: term, mode: 'insensitive' } },
    ];
  }

  if (propertyType && propertyType !== 'ALL') where.propertyType = propertyType;
  if (city && city !== 'ALL') where.city = { equals: city, mode: 'insensitive' };
  if (status && status !== 'ALL') where.status = status as PropertyStatus;
  if (ownerAgentId) where.ownerAgentId = ownerAgentId;

  if (minPrice != null || maxPrice != null) {
    where.price = {};
    if (minPrice != null) (where.price as Prisma.DecimalFilter).gte = new Prisma.Decimal(minPrice);
    if (maxPrice != null) (where.price as Prisma.DecimalFilter).lte = new Prisma.Decimal(maxPrice);
  }

  const validSortFields = ['title', 'price', 'createdAt', 'updatedAt', 'area'];
  const orderField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { ownerAgent: { select: AGENT_SELECT } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [orderField]: sortOrder },
    }),
    prisma.property.count({ where }),
  ]);

  return {
    properties: properties.map(toDto),
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getPropertyById(id: string) {
  const p = await prisma.property.findUnique({
    where: { id },
    include: { ownerAgent: { select: AGENT_SELECT } },
  });
  return p ? toDto(p) : null;
}

export interface PropertyInput {
  title: string;
  propertyType: string;
  location: string;
  city: string;
  price: number;
  area: number;
  areaUnit?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  status?: string;
  description?: string | null;
  images?: string[];
  ownerAgentId?: string | null;
}

export async function createProperty(input: PropertyInput) {
  const p = await prisma.property.create({
    data: {
      title: input.title.trim(),
      propertyType: input.propertyType.trim(),
      location: input.location.trim(),
      city: input.city.trim(),
      price: new Prisma.Decimal(input.price),
      area: Number(input.area),
      areaUnit: (input.areaUnit as AreaUnit) || 'SQFT',
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      status: (input.status as PropertyStatus) || 'AVAILABLE',
      description: input.description?.trim() || null,
      images: input.images ?? [],
      ownerAgentId: input.ownerAgentId || null,
    },
    include: { ownerAgent: { select: AGENT_SELECT } },
  });
  return toDto(p);
}

export async function updateProperty(id: string, input: Partial<PropertyInput>) {
  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.propertyType !== undefined) data.propertyType = input.propertyType.trim();
  if (input.location !== undefined) data.location = input.location.trim();
  if (input.city !== undefined) data.city = input.city.trim();
  if (input.price !== undefined) data.price = new Prisma.Decimal(input.price);
  if (input.area !== undefined) data.area = Number(input.area);
  if (input.areaUnit !== undefined) data.areaUnit = input.areaUnit as AreaUnit;
  if (input.bedrooms !== undefined) data.bedrooms = input.bedrooms;
  if (input.bathrooms !== undefined) data.bathrooms = input.bathrooms;
  if (input.status !== undefined) data.status = input.status as PropertyStatus;
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.images !== undefined) data.images = input.images;
  if (input.ownerAgentId !== undefined) data.ownerAgentId = input.ownerAgentId || null;

  const p = await prisma.property.update({
    where: { id },
    data,
    include: { ownerAgent: { select: AGENT_SELECT } },
  });
  return toDto(p);
}

/**
 * Deletes the DB row first, then best-effort cleans up the corresponding
 * Cloudinary assets (failures there never roll back the delete).
 */
export async function deleteProperty(id: string): Promise<void> {
  const existing = await prisma.property.findUnique({
    where: { id },
    select: { images: true },
  });
  await prisma.property.delete({ where: { id } });
  if (existing?.images?.length) {
    await Promise.all(existing.images.map((url) => deleteAssetByUrl(url)));
  }
}

/**
 * Returns leads whose preferred attributes overlap the given property's
 * location/city/type/budget. Pure DB query — no rule-engine magic. RBAC is
 * applied by the caller (ADMIN sees all matches, AGENT only own assigned).
 *
 * Matching criteria (any one of these triggers a row):
 *   - lead.preferredLocation contains property.location or property.city
 *   - lead.propertyType === property.propertyType
 *   - lead.budget >= property.price (lead can afford it)
 */
export async function findMatchingLeads(propertyId: string, opts: { userId: string; userRole: string }) {
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property) return [];

  const orConditions: Prisma.LeadWhereInput[] = [
    { preferredLocation: { contains: property.location, mode: 'insensitive' } },
    { preferredLocation: { contains: property.city, mode: 'insensitive' } },
    { propertyType: { equals: property.propertyType, mode: 'insensitive' } },
    { budget: { gte: property.price } },
  ];

  const where: Prisma.LeadWhereInput = {
    OR: orConditions,
    status: { notIn: ['LOST', 'WON'] },
  };
  if (opts.userRole === 'AGENT') {
    where.assignedAgentId = opts.userId;
  }

  const leads = await prisma.lead.findMany({
    where,
    include: {
      assignedAgent: { select: { id: true, name: true, email: true } },
      followUps: {
        where: { status: 'PENDING' },
        orderBy: { followUpDate: 'asc' },
        take: 1,
        select: { id: true, followUpDate: true, status: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 25,
  });

  // Score by how many criteria match — frontend uses this to sort visually.
  return leads.map((lead) => {
    let score = 0;
    if (lead.preferredLocation) {
      const loc = lead.preferredLocation.toLowerCase();
      if (loc.includes(property.location.toLowerCase())) score += 2;
      if (loc.includes(property.city.toLowerCase())) score += 1;
    }
    if (
      lead.propertyType &&
      lead.propertyType.toLowerCase() === property.propertyType.toLowerCase()
    ) {
      score += 2;
    }
    if (lead.budget != null && Number(lead.budget) >= Number(property.price)) {
      score += 1;
    }
    return {
      id: lead.id,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      status: lead.status,
      source: lead.source,
      preferredLocation: lead.preferredLocation,
      propertyType: lead.propertyType,
      budget: lead.budget != null ? Number(lead.budget) : null,
      assignedAgent: lead.assignedAgent,
      nextFollowUp: lead.followUps[0] || null,
      matchScore: score,
    };
  }).sort((a, b) => b.matchScore - a.matchScore);
}

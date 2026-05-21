import { Request, Response } from 'express';
import * as propertyService from '../services/property.service';
import { isAdminLevel } from '../lib/roles';

function parseNumQuery(v: unknown): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function listProperties(req: Request, res: Response): Promise<void> {
  try {
    const result = await propertyService.listProperties({
      page: req.query.page ? Math.max(1, Number(req.query.page)) : 1,
      limit: req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 20,
      search: req.query.search as string | undefined,
      propertyType: req.query.propertyType as string | undefined,
      city: req.query.city as string | undefined,
      status: req.query.status as string | undefined,
      minPrice: parseNumQuery(req.query.minPrice),
      maxPrice: parseNumQuery(req.query.maxPrice),
      ownerAgentId: req.query.ownerAgentId as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
    });
    res.json(result);
  } catch (e) {
    console.error('listProperties:', e);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
}

export async function getOneProperty(req: Request, res: Response): Promise<void> {
  try {
    const property = await propertyService.getPropertyById(req.params.id);
    if (!property) {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.json(property);
  } catch (e) {
    console.error('getOneProperty:', e);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
}

function validateRequired(body: Record<string, unknown>): string | null {
  const required: Array<[string, string]> = [
    ['title', 'Title'],
    ['propertyType', 'Property type'],
    ['location', 'Location'],
    ['city', 'City'],
  ];
  for (const [k, label] of required) {
    const v = body[k];
    if (typeof v !== 'string' || !v.trim()) return `${label} is required`;
  }
  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) return 'Price must be a positive number';
  const area = Number(body.area);
  if (!Number.isFinite(area) || area <= 0) return 'Area must be a positive number';
  return null;
}

export async function addProperty(req: Request, res: Response): Promise<void> {
  const validationError = validateRequired(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  try {
    // RBAC: AGENT cannot pick an ownerAgentId — they always own what they create.
    //       ADMIN may assign to any agent; if omitted, the admin owns it.
    const payload = {
      ...req.body,
      ownerAgentId:
        isAdminLevel(req.user!.role)
          ? req.body.ownerAgentId ?? req.user!.id
          : req.user!.id,
    };
    const property = await propertyService.createProperty(payload);
    res.status(201).json(property);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create property';
    res.status(400).json({ error: msg });
  }
}

export async function editProperty(req: Request, res: Response): Promise<void> {
  try {
    // Mirror Lead's ownership rule: ADMIN edits any, AGENT only own.
    if (!isAdminLevel(req.user!.role)) {
      const existing = await propertyService.getPropertyById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Property not found' });
        return;
      }
      if (existing.ownerAgentId !== req.user!.id) {
        res.status(403).json({ error: 'You can only edit properties you own' });
        return;
      }
      if (
        req.body.ownerAgentId !== undefined &&
        req.body.ownerAgentId !== req.user!.id
      ) {
        res.status(403).json({ error: 'Only an admin can reassign properties' });
        return;
      }
    }

    const property = await propertyService.updateProperty(req.params.id, req.body);
    res.json(property);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to update property' });
  }
}

export async function removeProperty(req: Request, res: Response): Promise<void> {
  try {
    if (!isAdminLevel(req.user!.role)) {
      const existing = await propertyService.getPropertyById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Property not found' });
        return;
      }
      if (existing.ownerAgentId !== req.user!.id) {
        res.status(403).json({ error: 'You can only delete properties you own' });
        return;
      }
    }
    await propertyService.deleteProperty(req.params.id);
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: 'Cannot delete property: it is referenced by an existing deal',
      });
      return;
    }
    res.status(500).json({ error: 'Failed to delete property' });
  }
}

export async function assignProperty(req: Request, res: Response): Promise<void> {
  try {
    const { agentId } = req.body;
    const property = await propertyService.updateProperty(req.params.id, {
      ownerAgentId: agentId || null,
    });
    res.json(property);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Property not found' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to reassign property' });
  }
}

export async function matchingLeads(req: Request, res: Response): Promise<void> {
  try {
    const leads = await propertyService.findMatchingLeads(req.params.id, {
      userId: req.user!.id,
      userRole: req.user!.role,
    });
    res.json({ leads });
  } catch (e) {
    console.error('matchingLeads:', e);
    res.status(500).json({ error: 'Failed to fetch matching leads' });
  }
}

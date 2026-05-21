import { Request, Response } from 'express';
import * as leadService from '../services/lead.service';
import { isAdminLevel } from '../lib/roles';

export async function listLeads(req: Request, res: Response): Promise<void> {
  try {
    const result = await leadService.getLeads({
      page: req.query.page ? Math.max(1, Number(req.query.page)) : 1,
      limit: req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 20,
      search: req.query.search as string | undefined,
      status: req.query.status as string | undefined,
      propertyType: req.query.propertyType as string | undefined,
      bhk: req.query.bhk as string | undefined,
      assignedAgentId: req.query.assignedAgentId as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      userId: req.user!.id,
      userRole: req.user!.role,
    });
    res.json(result);
  } catch (e) {
    console.error('listLeads:', e);
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
}

export async function getOneLead(req: Request, res: Response): Promise<void> {
  try {
    const lead = await leadService.getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.json(lead);
  } catch (e) {
    console.error('getOneLead:', e);
    res.status(500).json({ error: 'Failed to fetch lead' });
  }
}

export async function addLead(req: Request, res: Response): Promise<void> {
  const { fullName } = req.body;
  if (!fullName?.trim()) {
    res.status(400).json({ error: 'Full name is required' });
    return;
  }
  try {
    // Workflow safety: when an AGENT creates a lead without specifying an
    // assigned agent, default to themselves. Without this, the new lead
    // lands unassigned and immediately disappears from the agent's own
    // workspace because RBAC scopes AGENT to `assignedAgentId === self`.
    // ADMIN / SUPER_ADMIN can still create unassigned leads or assign
    // anyone manually — their flow is untouched.
    const payload = { ...req.body };
    if (req.user!.role === 'AGENT' && !payload.assignedAgentId) {
      payload.assignedAgentId = req.user!.id;
    }
    const lead = await leadService.createLead(payload);
    res.status(201).json(lead);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create lead';
    res.status(400).json({ error: msg });
  }
}

export async function editLead(req: Request, res: Response): Promise<void> {
  try {
    // Ownership rule: ADMIN can edit any lead.
    // AGENT can edit only leads currently assigned to themselves.
    if (!isAdminLevel(req.user!.role)) {
      const existing = await leadService.getLeadById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Lead not found' });
        return;
      }
      if (existing.assignedAgentId !== req.user!.id) {
        res.status(403).json({
          error: 'You can only edit leads assigned to you',
        });
        return;
      }
      // Prevent agents from re-assigning leads via the edit endpoint
      if (
        req.body.assignedAgentId !== undefined &&
        req.body.assignedAgentId !== req.user!.id
      ) {
        res.status(403).json({
          error: 'Only an admin can reassign leads',
        });
        return;
      }
    }

    const lead = await leadService.updateLead(req.params.id, req.body);
    res.json(lead);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to update lead' });
  }
}

export async function removeLead(req: Request, res: Response): Promise<void> {
  try {
    await leadService.deleteLead(req.params.id);
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete lead' });
  }
}

export async function assignLead(req: Request, res: Response): Promise<void> {
  try {
    const { agentId } = req.body;
    const lead = await leadService.updateLead(req.params.id, {
      assignedAgentId: agentId || null,
    });
    res.json(lead);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to assign lead' });
  }
}

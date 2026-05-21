import { Request, Response } from 'express';
import * as followUpService from '../services/followup.service';
import { prisma } from '../lib/prisma';
import { isAdminLevel } from '../lib/roles';

/**
 * Lists follow-ups visible to the current user.
 * Query params: leadId, assignedAgentId, status, window (upcoming|overdue|today),
 * page, limit
 */
export async function listFollowUps(req: Request, res: Response): Promise<void> {
  try {
    const result = await followUpService.listFollowUps({
      leadId: req.query.leadId as string | undefined,
      assignedAgentId: req.query.assignedAgentId as string | undefined,
      status: req.query.status as string | undefined,
      window: req.query.window as 'upcoming' | 'overdue' | 'today' | undefined,
      userId: req.user!.id,
      userRole: req.user!.role,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (e) {
    console.error('listFollowUps:', e);
    res.status(500).json({ error: 'Failed to fetch follow-ups' });
  }
}

export async function getFollowUp(req: Request, res: Response): Promise<void> {
  try {
    const followUp = await followUpService.getFollowUpById(req.params.id);
    if (!followUp) {
      res.status(404).json({ error: 'Follow-up not found' });
      return;
    }
    // Agents may only view their own follow-ups
    if (!isAdminLevel(req.user!.role) && followUp.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You do not have access to this follow-up' });
      return;
    }
    res.json(followUp);
  } catch (e) {
    console.error('getFollowUp:', e);
    res.status(500).json({ error: 'Failed to fetch follow-up' });
  }
}

/**
 * Creates a follow-up.
 *
 * Ownership rule: AGENTs may only create follow-ups assigned to themselves,
 * and only on leads currently assigned to them. ADMINs may create on any lead
 * and assign to any agent.
 */
export async function createFollowUp(req: Request, res: Response): Promise<void> {
  const { leadId, assignedAgentId, followUpDate } = req.body;

  if (!leadId || !assignedAgentId || !followUpDate) {
    res.status(400).json({
      error: 'leadId, assignedAgentId, and followUpDate are required',
    });
    return;
  }

  if (!isAdminLevel(req.user!.role)) {
    if (assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'Agents can only create follow-ups for themselves' });
      return;
    }
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { assignedAgentId: true },
    });
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    if (lead.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You can only create follow-ups on leads assigned to you' });
      return;
    }
  }

  try {
    const followUp = await followUpService.createFollowUp(req.body);
    res.status(201).json(followUp);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2003') {
      res.status(400).json({ error: 'Lead or agent does not exist' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to create follow-up' });
  }
}

/**
 * Edits a follow-up.
 * Ownership rule: AGENTs may only edit follow-ups assigned to themselves,
 * and may not reassign to another agent.
 */
export async function editFollowUp(req: Request, res: Response): Promise<void> {
  try {
    if (!isAdminLevel(req.user!.role)) {
      const existing = await followUpService.getFollowUpById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Follow-up not found' });
        return;
      }
      if (existing.assignedAgentId !== req.user!.id) {
        res.status(403).json({ error: 'You can only edit follow-ups assigned to you' });
        return;
      }
      if (
        req.body.assignedAgentId !== undefined &&
        req.body.assignedAgentId !== req.user!.id
      ) {
        res.status(403).json({ error: 'Only an admin can reassign follow-ups' });
        return;
      }
    }

    const followUp = await followUpService.updateFollowUp(req.params.id, req.body);
    res.json(followUp);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Follow-up not found' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to update follow-up' });
  }
}

/**
 * Marks a follow-up complete. Same ownership rule as edit.
 */
export async function completeFollowUp(req: Request, res: Response): Promise<void> {
  try {
    if (!isAdminLevel(req.user!.role)) {
      const existing = await followUpService.getFollowUpById(req.params.id);
      if (!existing) {
        res.status(404).json({ error: 'Follow-up not found' });
        return;
      }
      if (existing.assignedAgentId !== req.user!.id) {
        res.status(403).json({ error: 'You can only complete follow-ups assigned to you' });
        return;
      }
    }
    const followUp = await followUpService.updateFollowUp(req.params.id, { status: 'COMPLETED' });
    res.json(followUp);
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Follow-up not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to complete follow-up' });
  }
}

export async function deleteFollowUp(req: Request, res: Response): Promise<void> {
  try {
    await followUpService.deleteFollowUp(req.params.id);
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Follow-up not found' });
      return;
    }
    res.status(500).json({ error: 'Failed to delete follow-up' });
  }
}

export async function dashboardStats(req: Request, res: Response): Promise<void> {
  try {
    const counts = await followUpService.getDashboardCounts(req.user!.id, req.user!.role);
    res.json(counts);
  } catch (e) {
    console.error('dashboardStats:', e);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
}

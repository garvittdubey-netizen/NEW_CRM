import { Request, Response } from 'express';
import * as clientService from '../services/client.service';
import { buildClientTimeline } from '../services/client-timeline.service';
import { reactivateClient } from '../services/client-reactivation.service';
import { isAdminLevel } from '../lib/roles';

export async function listClients(req: Request, res: Response): Promise<void> {
  try {
    const result = await clientService.listClients({
      page: req.query.page ? Math.max(1, Number(req.query.page)) : 1,
      limit: req.query.limit ? Math.min(100, Math.max(1, Number(req.query.limit))) : 20,
      search: req.query.search as string | undefined,
      assignedAgentId: req.query.assignedAgentId as string | undefined,
      linkedLeadId: req.query.linkedLeadId as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
      userId: req.user!.id,
      userRole: req.user!.role,
    });
    res.json(result);
  } catch (e) {
    console.error('listClients:', e);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
}

export async function getOneClient(req: Request, res: Response): Promise<void> {
  try {
    const client = await clientService.getClientById(req.params.id);
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    // AGENT can only read their own assigned clients.
    if (!isAdminLevel(req.user!.role) && client.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You do not have access to this client' });
      return;
    }
    res.json(client);
  } catch (e) {
    console.error('getOneClient:', e);
    res.status(500).json({ error: 'Failed to fetch client' });
  }
}

export async function addClient(req: Request, res: Response): Promise<void> {
  const { fullName } = req.body as { fullName?: string };
  if (!fullName?.trim()) {
    res.status(400).json({ error: 'Full name is required' });
    return;
  }
  try {
    // AGENT always auto-owns what they create; ADMIN may assign anyone or leave
    // unassigned (matches the Lead module exactly). For ADMIN, an explicit
    // `null` in the body is honoured as "unassigned" — only `undefined`
    // (i.e. the field was omitted) falls back to the admin's own id.
    const assignedAgentId =
      isAdminLevel(req.user!.role)
        ? req.body.assignedAgentId === undefined
          ? req.user!.id
          : req.body.assignedAgentId
        : req.user!.id;

    const client = await clientService.createClient({
      ...req.body,
      assignedAgentId,
    });

    // Lifecycle log — never blocks the response on failure.
    await clientService.logClientActivity({
      clientId: client.id,
      userId: req.user!.id,
      action: 'CREATED',
      description: `Client "${client.fullName}" created`,
      metadata: {
        linkedLeadId: client.linkedLeadId,
        assignedAgentId: client.assignedAgentId,
      },
    });
    if (client.linkedLeadId) {
      await clientService.logClientActivity({
        clientId: client.id,
        userId: req.user!.id,
        action: 'LINKED_LEAD',
        description: `Linked to lead ${client.linkedLead?.fullName ?? client.linkedLeadId}`,
      });
    }

    res.status(201).json(client);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create client';
    res.status(400).json({ error: msg });
  }
}

export async function editClient(req: Request, res: Response): Promise<void> {
  try {
    const existing = await clientService.getClientById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }

    // RBAC mirrors Lead/Property:
    //   - ADMIN may edit any client.
    //   - AGENT may edit only clients assigned to themselves.
    //   - AGENT may NOT change assignedAgentId via PUT (only ADMIN can reassign).
    if (!isAdminLevel(req.user!.role)) {
      if (existing.assignedAgentId !== req.user!.id) {
        res.status(403).json({ error: 'You can only edit clients assigned to you' });
        return;
      }
      if (
        req.body.assignedAgentId !== undefined &&
        req.body.assignedAgentId !== req.user!.id
      ) {
        res.status(403).json({ error: 'Only an admin can reassign clients' });
        return;
      }
    }

    const updated = await clientService.updateClient(req.params.id, req.body);

    // Track significant lifecycle deltas so the timeline stays meaningful.
    const events: Array<{ action: string; description: string }> = [];
    if (req.body.linkedLeadId !== undefined && req.body.linkedLeadId !== existing.linkedLeadId) {
      events.push(
        req.body.linkedLeadId
          ? {
              action: 'LINKED_LEAD',
              description: `Linked to lead ${updated.linkedLead?.fullName ?? req.body.linkedLeadId}`,
            }
          : { action: 'UNLINKED_LEAD', description: 'Lead link removed' },
      );
    }
    if (
      req.body.assignedAgentId !== undefined &&
      req.body.assignedAgentId !== existing.assignedAgentId
    ) {
      events.push(
        req.body.assignedAgentId
          ? {
              action: 'AGENT_ASSIGNED',
              description: `Assigned to ${updated.assignedAgent?.name ?? 'an agent'}`,
            }
          : { action: 'AGENT_UNASSIGNED', description: 'Agent unassigned' },
      );
    }
    if (req.body.notes !== undefined && req.body.notes !== existing.notes) {
      events.push({ action: 'NOTES_UPDATED', description: 'Notes updated' });
    }
    if (!events.length) {
      events.push({ action: 'UPDATED', description: 'Client details updated' });
    }
    for (const ev of events) {
      await clientService.logClientActivity({
        clientId: updated.id,
        userId: req.user!.id,
        ...ev,
      });
    }

    res.json(updated);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to update client' });
  }
}

export async function removeClient(req: Request, res: Response): Promise<void> {
  try {
    const existing = await clientService.getClientById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (!isAdminLevel(req.user!.role) && existing.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You can only delete clients assigned to you' });
      return;
    }
    await clientService.deleteClient(req.params.id);
    res.status(204).send();
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: 'Cannot delete client: it is referenced by an existing deal',
      });
      return;
    }
    res.status(500).json({ error: 'Failed to delete client' });
  }
}

export async function assignClient(req: Request, res: Response): Promise<void> {
  try {
    const { agentId } = req.body as { agentId?: string | null };
    const existing = await clientService.getClientById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    const updated = await clientService.updateClient(req.params.id, {
      assignedAgentId: agentId || null,
    });
    await clientService.logClientActivity({
      clientId: updated.id,
      userId: req.user!.id,
      action: agentId ? 'AGENT_ASSIGNED' : 'AGENT_UNASSIGNED',
      description: agentId
        ? `Assigned to ${updated.assignedAgent?.name ?? 'an agent'}`
        : 'Agent unassigned',
    });
    res.json(updated);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    res.status(400).json({ error: err.message || 'Failed to assign client' });
  }
}

export async function getClientTimeline(req: Request, res: Response): Promise<void> {
  try {
    const client = await clientService.getClientById(req.params.id);
    if (!client) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (!isAdminLevel(req.user!.role) && client.assignedAgentId !== req.user!.id) {
      res.status(403).json({ error: 'You do not have access to this client' });
      return;
    }
    const items = await buildClientTimeline(req.params.id);
    res.json({ items });
  } catch (e) {
    console.error('getClientTimeline:', e);
    res.status(500).json({ error: 'Failed to load timeline' });
  }
}

/**
 * Reactivate-lead workflow.
 *
 * RBAC: SUPER_ADMIN, ADMIN, or the AGENT currently assigned to the client.
 * Body: { reason: string (required) }.
 *
 * Behaviour delegated to `client-reactivation.service`:
 *   - if client.linkedLeadId exists → flip that lead's status to NEW.
 *   - else                          → create a new lead prefilled from the
 *                                     client data and attach it as
 *                                     client.linkedLeadId.
 *   - logs ClientActivity (CLIENT_REVERTED) + lead Activity (CLIENT_REVERTED).
 */
export async function reactivateClientHandler(req: Request, res: Response): Promise<void> {
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      res.status(400).json({ error: 'Reason is required' });
      return;
    }
    if (reason.length > 500) {
      res.status(400).json({ error: 'Reason must be 500 characters or fewer' });
      return;
    }

    const existing = await clientService.getClientById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Client not found' });
      return;
    }
    if (!isAdminLevel(req.user!.role) && existing.assignedAgentId !== req.user!.id) {
      res
        .status(403)
        .json({ error: 'You can only reactivate clients assigned to you' });
      return;
    }

    const result = await reactivateClient({
      clientId: req.params.id,
      reason,
      actorId: req.user!.id,
      actorName: req.user!.email,
    });
    res.json(result);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === 'NOT_FOUND') {
      res.status(404).json({ error: err.message || 'Client not found' });
      return;
    }
    console.error('reactivateClientHandler:', e);
    res.status(500).json({ error: err.message || 'Failed to reactivate client' });
  }
}


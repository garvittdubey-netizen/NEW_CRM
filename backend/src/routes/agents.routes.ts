import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export const agentsRouter = Router();

/**
 * GET /api/agents — minimal agent directory for assignment dropdowns.
 *
 * Returns only users with role === 'AGENT'.
 * Exposes only { id, name, role } — emails are intentionally omitted so that
 * agents listing the directory cannot harvest contact details.
 * Admin accounts are never returned by this endpoint.
 */
agentsRouter.get('/', authenticate, async (_req, res) => {
  try {
    const agents = await prisma.user.findMany({
      where: { role: 'AGENT' },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    res.json(agents);
  } catch {
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

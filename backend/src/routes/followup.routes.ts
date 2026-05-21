import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listFollowUps,
  getFollowUp,
  createFollowUp,
  editFollowUp,
  completeFollowUp,
  deleteFollowUp,
  dashboardStats,
} from '../controllers/followup.controller';

export const followUpRouter = Router();

/**
 * GET    /api/followups            list (filterable, paginated)
 * GET    /api/followups/stats      dashboard counts (today/overdue/upcoming)
 * POST   /api/followups            create
 * GET    /api/followups/:id        get one
 * PUT    /api/followups/:id        edit (partial)
 * PATCH  /api/followups/:id/complete  mark complete
 * DELETE /api/followups/:id        delete (ADMIN only)
 */
followUpRouter.get('/', authenticate, listFollowUps);
followUpRouter.get('/stats', authenticate, dashboardStats);
followUpRouter.post('/', authenticate, createFollowUp);
followUpRouter.get('/:id', authenticate, getFollowUp);
followUpRouter.put('/:id', authenticate, editFollowUp);
followUpRouter.patch('/:id/complete', authenticate, completeFollowUp);
followUpRouter.delete('/:id', authenticate, requireRole('ADMIN'), deleteFollowUp);

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { list } from '../controllers/activity.controller';

export const activityRouter = Router();

/**
 * GET /api/activities
 *   Query: userId?, leadId?, action?, page?, limit?
 *
 *   RBAC: ADMIN sees all activities; AGENT sees activities they performed OR
 *   activities on leads currently assigned to them.
 */
activityRouter.get('/', authenticate, list);

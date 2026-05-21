import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  listDeals,
  getOneDeal,
  addDeal,
  editDeal,
  removeDeal,
  getDealTimelineHandler,
  getDealActivitiesHandler,
} from '../controllers/deal.controller';

export const dealRouter = Router();

dealRouter.get('/', authenticate, listDeals);
dealRouter.post('/', authenticate, addDeal);
// Timeline + activities mounted BEFORE `/:id` so they aren't captured as ids.
dealRouter.get('/:id/timeline', authenticate, getDealTimelineHandler);
dealRouter.get('/:id/activities', authenticate, getDealActivitiesHandler);
dealRouter.get('/:id', authenticate, getOneDeal);
dealRouter.put('/:id', authenticate, editDeal);
dealRouter.delete('/:id', authenticate, removeDeal);

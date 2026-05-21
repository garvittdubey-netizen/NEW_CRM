import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listProperties,
  getOneProperty,
  addProperty,
  editProperty,
  removeProperty,
  assignProperty,
  matchingLeads,
} from '../controllers/property.controller';

export const propertyRouter = Router();

propertyRouter.get('/', authenticate, listProperties);
propertyRouter.post('/', authenticate, addProperty);
propertyRouter.get('/:id', authenticate, getOneProperty);
propertyRouter.put('/:id', authenticate, editProperty);
propertyRouter.delete('/:id', authenticate, removeProperty);
propertyRouter.patch('/:id/assign', authenticate, requireRole('ADMIN'), assignProperty);
propertyRouter.get('/:id/matching-leads', authenticate, matchingLeads);

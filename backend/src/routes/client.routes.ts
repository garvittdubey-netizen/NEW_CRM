import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  listClients,
  getOneClient,
  addClient,
  editClient,
  removeClient,
  assignClient,
  getClientTimeline,
  reactivateClientHandler,
} from '../controllers/client.controller';

export const clientRouter = Router();

clientRouter.get('/', authenticate, listClients);
clientRouter.post('/', authenticate, addClient);
clientRouter.get('/:id', authenticate, getOneClient);
clientRouter.put('/:id', authenticate, editClient);
clientRouter.delete('/:id', authenticate, removeClient);
clientRouter.patch('/:id/assign', authenticate, requireRole('ADMIN'), assignClient);
clientRouter.get('/:id/timeline', authenticate, getClientTimeline);
clientRouter.post('/:id/reactivate', authenticate, reactivateClientHandler);

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  sendWhatsApp,
  logCall,
  list,
  listConversations,
  listTemplates,
} from '../controllers/communication.controller';

export const communicationRouter = Router();

/**
 * GET    /api/communications                    list (RBAC scoped, paginated)
 * GET    /api/communications/conversations      inbox sidebar (one row per lead)
 * GET    /api/communications/templates          approved WhatsApp templates
 * POST   /api/communications/whatsapp/send      send a free-form or template message
 * POST   /api/communications/calls              log a call manually
 */
communicationRouter.get('/', authenticate, list);
communicationRouter.get('/conversations', authenticate, listConversations);
communicationRouter.get('/templates', authenticate, listTemplates);
communicationRouter.post('/whatsapp/send', authenticate, sendWhatsApp);
communicationRouter.post('/calls', authenticate, logCall);

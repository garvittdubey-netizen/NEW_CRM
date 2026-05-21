import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { listNotifications } from '../controllers/notification.controller';

/**
 * Notifications endpoint. JWT-authenticated for any role; the service
 * layer scopes the feed (ADMIN tenant-wide, AGENT only their own work).
 */
export const notificationRouter = Router();

notificationRouter.get('/', authenticate, listNotifications);

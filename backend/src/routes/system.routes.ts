import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { getSystemStatus } from '../controllers/system.controller';

export const systemRouter = Router();

// ADMIN-only — the panel exposes credentialled probe results
// (e.g. WhatsApp template count) that should not leak to agents.
systemRouter.get('/status', authenticate, requireRole('ADMIN'), getSystemStatus);

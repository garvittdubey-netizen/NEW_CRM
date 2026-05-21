import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  readTenantSettings,
  writeTenantSettings,
} from '../controllers/tenant-settings.controller';

export const settingsRouter = Router();

// Any authenticated user can read tenant settings (so agents see e.g. their
// visibility mode). Only ADMIN can write.
settingsRouter.get('/tenant', authenticate, readTenantSettings);
settingsRouter.put('/tenant', authenticate, requireRole('ADMIN'), writeTenantSettings);

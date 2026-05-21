import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { listUsers, createUser, updateUser } from '../controllers/user.controller';

/**
 * User-management routes (ADMIN only).
 *
 * GET    /api/users          list users with optional ?search & ?role & ?isActive
 * POST   /api/users          create a new user
 * PUT    /api/users/:id      edit user (name / role / isActive / optional password)
 *
 * Email is intentionally immutable. Disable a user instead of deleting them
 * — destructive deletes would orphan leads / follow-ups / activities and
 * audit history is more valuable than a green field.
 */
export const usersRouter = Router();

usersRouter.get('/', authenticate, requireRole('ADMIN'), listUsers);
usersRouter.post('/', authenticate, requireRole('ADMIN'), createUser);
usersRouter.put('/:id', authenticate, requireRole('ADMIN'), updateUser);

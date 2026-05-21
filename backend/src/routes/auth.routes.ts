import { Router } from 'express';
import { login, register, me, logout } from '../controllers/auth.controller';
import {
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
} from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth';

export const authRouter = Router();

authRouter.post('/login', login);
authRouter.post('/register', register);
authRouter.post('/logout', authenticate, logout);
authRouter.get('/me', authenticate, me);

// Self-service profile + password (added in Phase 11 — Settings).
// `me` is preserved for backwards compatibility; `profile` returns the same
// shape plus `profileImage`.
authRouter.get('/profile', authenticate, getMyProfile);
authRouter.put('/profile', authenticate, updateMyProfile);
authRouter.put('/password', authenticate, changeMyPassword);

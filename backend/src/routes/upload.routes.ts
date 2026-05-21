import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { getCloudinarySignature } from '../controllers/upload.controller';

export const uploadRouter = Router();

// Any authenticated user (ADMIN or AGENT) can request an upload signature.
// The folder whitelist + JWT auth together prevent abuse.
uploadRouter.get('/cloudinary-signature', authenticate, getCloudinarySignature);

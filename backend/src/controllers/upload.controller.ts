import { Request, Response } from 'express';
import { signUpload } from '../services/cloudinary.service';

/**
 * Returns a short-lived signed payload the browser uses to POST a file
 * directly to Cloudinary. The API secret is never sent to the client; only
 * a signed `timestamp + folder` hash is.
 */
export async function getCloudinarySignature(req: Request, res: Response): Promise<void> {
  try {
    const folder = (req.query.folder as string | undefined) || 'properties';
    const payload = signUpload(folder);
    res.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to sign upload';
    res.status(400).json({ error: msg });
  }
}

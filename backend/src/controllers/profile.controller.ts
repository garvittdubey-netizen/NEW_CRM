import { Request, Response } from 'express';
import { getProfile, updateProfile, changePassword } from '../services/profile.service';

export async function getMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const profile = await getProfile(req.user!.id);
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(profile);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateMyProfile(req: Request, res: Response): Promise<void> {
  try {
    const { name, profileImage } = req.body ?? {};
    const updated = await updateProfile(req.user!.id, { name, profileImage });
    res.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to update profile';
    res.status(400).json({ error: message });
  }
}

export async function changeMyPassword(req: Request, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' });
      return;
    }
    await changePassword(req.user!.id, String(currentPassword), String(newPassword));
    res.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to change password';
    const code = (e as { code?: string })?.code;
    const status = code === 'WRONG_CURRENT_PASSWORD' ? 400 : 400;
    res.status(status).json({ error: message });
  }
}

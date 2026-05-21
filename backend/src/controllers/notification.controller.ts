import { Request, Response } from 'express';
import { buildNotifications } from '../services/notification.service';

/**
 * GET /api/notifications
 *
 * Read-only merged feed of follow-up reminders, deal activity events and
 * lead-assignment events visible to the caller. Mark-as-read is handled
 * entirely on the frontend via a localStorage timestamp, so there is no
 * mutation endpoint here.
 */
export async function listNotifications(req: Request, res: Response): Promise<void> {
  try {
    const items = await buildNotifications({
      userId: req.user!.id,
      userRole: req.user!.role,
    });
    res.json({ items });
  } catch (e) {
    console.error('listNotifications:', e);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
}

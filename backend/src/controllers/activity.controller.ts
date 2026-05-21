import { Request, Response } from 'express';
import * as activity from '../services/activity.service';

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const result = await activity.list({
      userId: req.query.userId as string | undefined,
      leadId: req.query.leadId as string | undefined,
      action: req.query.action as string | undefined,
      callerId: req.user!.id,
      callerRole: req.user!.role,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (e) {
    console.error('[list activities]', e);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
}

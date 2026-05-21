import { Request, Response } from 'express';
import * as analytics from '../services/analytics.service';

/**
 * Extracts the resolved date range from query params. Shared by every
 * analytics endpoint so the response always echoes back the window the
 * server actually computed against.
 */
function parseRange(req: Request) {
  return analytics.resolveRange({
    range: req.query.range as analytics.AnalyticsRange | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
}

function scopeOf(req: Request) {
  return { userId: req.user!.id, userRole: req.user!.role };
}

export async function overview(req: Request, res: Response): Promise<void> {
  try {
    const data = await analytics.getOverview(scopeOf(req), parseRange(req));
    res.json(data);
  } catch (e) {
    console.error('analytics.overview:', e);
    res.status(500).json({ error: 'Failed to fetch analytics overview' });
  }
}

export async function leadsByStatus(req: Request, res: Response): Promise<void> {
  try {
    const data = await analytics.getLeadsByStatus(scopeOf(req), parseRange(req));
    res.json({ data });
  } catch (e) {
    console.error('analytics.leadsByStatus:', e);
    res.status(500).json({ error: 'Failed to fetch leads by status' });
  }
}

export async function leadsBySource(req: Request, res: Response): Promise<void> {
  try {
    const data = await analytics.getLeadsBySource(scopeOf(req), parseRange(req));
    res.json({ data });
  } catch (e) {
    console.error('analytics.leadsBySource:', e);
    res.status(500).json({ error: 'Failed to fetch leads by source' });
  }
}

export async function followUpStats(req: Request, res: Response): Promise<void> {
  try {
    const data = await analytics.getFollowUpStats(scopeOf(req), parseRange(req));
    res.json(data);
  } catch (e) {
    console.error('analytics.followUpStats:', e);
    res.status(500).json({ error: 'Failed to fetch follow-up stats' });
  }
}

export async function agentPerformance(req: Request, res: Response): Promise<void> {
  try {
    const data = await analytics.getAgentPerformance(scopeOf(req), parseRange(req));
    res.json({ data });
  } catch (e) {
    console.error('analytics.agentPerformance:', e);
    res.status(500).json({ error: 'Failed to fetch agent performance' });
  }
}

export async function communicationStats(req: Request, res: Response): Promise<void> {
  try {
    const data = await analytics.getCommunicationStats(scopeOf(req), parseRange(req));
    res.json(data);
  } catch (e) {
    console.error('analytics.communicationStats:', e);
    res.status(500).json({ error: 'Failed to fetch communication stats' });
  }
}

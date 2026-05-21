import { Request, Response } from 'express';
import {
  getTenantSettings,
  updateTenantSettings,
  AgentVisibilityMode,
} from '../services/tenant-settings.service';

export async function readTenantSettings(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await getTenantSettings();
    res.json(settings);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Internal error' });
  }
}

export async function writeTenantSettings(req: Request, res: Response): Promise<void> {
  try {
    const { autoAssignLeadsEnabled, agentVisibilityMode } = req.body ?? {};
    const settings = await updateTenantSettings(req.user!.id, {
      autoAssignLeadsEnabled,
      agentVisibilityMode: agentVisibilityMode as AgentVisibilityMode | undefined,
    });
    res.json(settings);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Failed to save settings' });
  }
}

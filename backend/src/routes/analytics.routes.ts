import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  overview,
  leadsByStatus,
  leadsBySource,
  followUpStats,
  agentPerformance,
  communicationStats,
} from '../controllers/analytics.controller';
import {
  exportAnalyticsOverview,
  exportLeadsByStatus,
  exportLeadsBySource,
  exportFollowUpStats,
  exportAgentPerformance,
  exportCommunicationStats,
} from '../controllers/csv.controller';

/**
 * Dashboard analytics endpoints. All require JWT; per-endpoint RBAC scoping
 * is handled inside the service layer (ADMIN sees tenant-wide, AGENT sees
 * only their own assigned leads / follow-ups / communications).
 *
 * Common query params (all optional):
 *   range = today | 7d | 30d | custom   (default: 30d)
 *   from  = ISO date string              (required when range=custom)
 *   to    = ISO date string              (required when range=custom)
 *
 * Each section also has an `/export/*` sibling that streams a CSV file
 * with the same scoping + range rules.
 */
export const analyticsRouter = Router();

analyticsRouter.get('/overview',            authenticate, overview);
analyticsRouter.get('/leads-by-status',     authenticate, leadsByStatus);
analyticsRouter.get('/leads-by-source',     authenticate, leadsBySource);
analyticsRouter.get('/followups',           authenticate, followUpStats);
analyticsRouter.get('/agents',              authenticate, agentPerformance);
analyticsRouter.get('/communications',      authenticate, communicationStats);

// CSV exports — one per section (per product spec).
analyticsRouter.get('/export/overview',         authenticate, exportAnalyticsOverview);
analyticsRouter.get('/export/leads-by-status',  authenticate, exportLeadsByStatus);
analyticsRouter.get('/export/leads-by-source',  authenticate, exportLeadsBySource);
analyticsRouter.get('/export/followups',        authenticate, exportFollowUpStats);
analyticsRouter.get('/export/agents',           authenticate, exportAgentPerformance);
analyticsRouter.get('/export/communications',   authenticate, exportCommunicationStats);

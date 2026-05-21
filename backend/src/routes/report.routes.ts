import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import {
  leadReport,
  exportLeadReport,
  propertyReport,
  exportPropertyReport,
  clientReport,
  exportClientReport,
  dealReport,
  exportDealReport,
  agentReport,
  exportAgentReport,
} from '../controllers/report.controller';

/**
 * ADMIN-only Reports router. Five JSON GETs + five CSV exports. RBAC is
 * enforced once at the router level so every handler can trust that the
 * caller is an admin.
 *
 * Optional query params for lead + deal reports:
 *   from = ISO YYYY-MM-DD
 *   to   = ISO YYYY-MM-DD
 * Omit both for an all-time snapshot.
 */
export const reportRouter = Router();

reportRouter.use(authenticate, requireRole('ADMIN'));

reportRouter.get('/leads',               leadReport);
reportRouter.get('/leads/export',        exportLeadReport);
reportRouter.get('/properties',          propertyReport);
reportRouter.get('/properties/export',   exportPropertyReport);
reportRouter.get('/clients',             clientReport);
reportRouter.get('/clients/export',      exportClientReport);
reportRouter.get('/deals',               dealReport);
reportRouter.get('/deals/export',        exportDealReport);
reportRouter.get('/agents',              agentReport);
reportRouter.get('/agents/export',       exportAgentReport);

import api from './api';

// ── Lead report ─────────────────────────────────────────────────────────────

export interface LeadStatusBucket {
  status: string;
  count: number;
}
export interface LeadSourceBucket {
  source: string;
  count: number;
}
export interface LeadReport {
  total: number;
  byStatus: LeadStatusBucket[];
  bySource: LeadSourceBucket[];
  won: number;
  conversionRate: number;
}

// ── Property report ─────────────────────────────────────────────────────────

export interface PropertyStatusBucket {
  status: 'AVAILABLE' | 'RESERVED' | 'SOLD';
  count: number;
}
export interface PropertyReport {
  total: number;
  byStatus: PropertyStatusBucket[];
  available: number;
  sold: number;
}

// ── Client report ───────────────────────────────────────────────────────────

export interface ClientReport {
  total: number;
  linked: number;
  unlinked: number;
}

// ── Deal report ─────────────────────────────────────────────────────────────

export interface DealStatusBucket {
  status: string;
  count: number;
  value: number;
}
export interface RevenueTrendPoint {
  month: string;  // "YYYY-MM"
  revenue: number;
  count: number;
}
export interface DealReport {
  total: number;
  byStatus: DealStatusBucket[];
  totalValue: number;
  wonCount: number;
  lostCount: number;
  revenueTrend: RevenueTrendPoint[];
}

// ── Agent report ────────────────────────────────────────────────────────────

export interface AgentReportRow {
  agentId: string;
  agentName: string;
  agentEmail: string;
  dealsCount: number;
  wonDealsCount: number;
  leadsCount: number;
  wonLeadsCount: number;
  leadConversion: number;
  followUpDone: number;
  followUpTotal: number;
  followUpRate: number;
}

interface DateRangeParams {
  from?: string;
  to?: string;
}

export const reportsApi = {
  leads: (params?: DateRangeParams) =>
    api.get<LeadReport>('/reports/leads', { params }).then((r) => r.data),
  properties: () =>
    api.get<PropertyReport>('/reports/properties').then((r) => r.data),
  clients: () => api.get<ClientReport>('/reports/clients').then((r) => r.data),
  deals: (params?: DateRangeParams) =>
    api.get<DealReport>('/reports/deals', { params }).then((r) => r.data),
  agents: () =>
    api.get<{ data: AgentReportRow[] }>('/reports/agents').then((r) => r.data.data),
};

/**
 * Build an authenticated CSV download URL for a report section. Returned
 * URL contains the JWT in the query string only when necessary for the
 * blob workflow — by default the frontend uses the axios `responseType:
 * blob` pattern instead.
 */
export function reportExportPath(
  section: 'leads' | 'properties' | 'clients' | 'deals' | 'agents',
  params?: DateRangeParams,
): { url: string; params?: DateRangeParams } {
  return { url: `/reports/${section}/export`, params };
}

import api from './api';
import type {
  AnalyticsRange,
  AnalyticsRangeParams,
  AnalyticsOverview,
  LeadsByStatusResponse,
  LeadsBySourceResponse,
  FollowUpAnalytics,
  AgentPerformanceResponse,
  CommunicationStats,
} from '@/types';

/**
 * Converts a UI range filter into the query params the backend expects.
 * Custom range requires `from` and `to` to be ISO date strings (YYYY-MM-DD ok).
 */
export function rangeToParams(range: AnalyticsRange, from?: string, to?: string) {
  const params: AnalyticsRangeParams = { range };
  if (range === 'custom') {
    if (from) params.from = from;
    if (to) params.to = to;
  }
  return params;
}

export const analyticsApi = {
  overview: (params: AnalyticsRangeParams) =>
    api.get<AnalyticsOverview>('/analytics/overview', { params }).then((r) => r.data),

  leadsByStatus: (params: AnalyticsRangeParams) =>
    api.get<LeadsByStatusResponse>('/analytics/leads-by-status', { params }).then((r) => r.data),

  leadsBySource: (params: AnalyticsRangeParams) =>
    api.get<LeadsBySourceResponse>('/analytics/leads-by-source', { params }).then((r) => r.data),

  followUps: (params: AnalyticsRangeParams) =>
    api.get<FollowUpAnalytics>('/analytics/followups', { params }).then((r) => r.data),

  agents: (params: AnalyticsRangeParams) =>
    api.get<AgentPerformanceResponse>('/analytics/agents', { params }).then((r) => r.data),

  communications: (params: AnalyticsRangeParams) =>
    api.get<CommunicationStats>('/analytics/communications', { params }).then((r) => r.data),
};

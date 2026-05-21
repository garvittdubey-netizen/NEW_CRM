import api from './api';
import type {
  FollowUp,
  FollowUpsResponse,
  CreateFollowUpData,
  UpdateFollowUpData,
  FollowUpDashboardStats,
} from '@/types';

export interface FollowUpListParams {
  leadId?: string;
  assignedAgentId?: string;
  status?: string;
  window?: 'upcoming' | 'overdue' | 'today';
  page?: number;
  limit?: number;
}

export const followUpsApi = {
  list: (params: FollowUpListParams = {}) =>
    api.get<FollowUpsResponse>('/followups', { params }).then((r) => r.data),

  get: (id: string) => api.get<FollowUp>(`/followups/${id}`).then((r) => r.data),

  create: (data: CreateFollowUpData) =>
    api.post<FollowUp>('/followups', data).then((r) => r.data),

  update: (id: string, data: UpdateFollowUpData) =>
    api.put<FollowUp>(`/followups/${id}`, data).then((r) => r.data),

  complete: (id: string) =>
    api.patch<FollowUp>(`/followups/${id}/complete`).then((r) => r.data),

  delete: (id: string) => api.delete(`/followups/${id}`),

  stats: () => api.get<FollowUpDashboardStats>('/followups/stats').then((r) => r.data),
};

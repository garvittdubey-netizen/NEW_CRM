import api from './api';
import type { Lead, LeadsResponse, CreateLeadData, UpdateLeadData, User } from '@/types';

interface LeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  propertyType?: string;
  bhk?: string;
  assignedAgentId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const leadsApi = {
  list: (params: LeadListParams) =>
    api.get<LeadsResponse>('/leads', { params }).then((r) => r.data),

  get: (id: string) => api.get<Lead>(`/leads/${id}`).then((r) => r.data),

  create: (data: CreateLeadData) => api.post<Lead>('/leads', data).then((r) => r.data),

  update: (id: string, data: UpdateLeadData) =>
    api.put<Lead>(`/leads/${id}`, data).then((r) => r.data),

  delete: (id: string) => api.delete(`/leads/${id}`),

  assign: (id: string, agentId: string | null) =>
    api.patch<Lead>(`/leads/${id}/assign`, { agentId }).then((r) => r.data),
};

// Full user listing — ADMIN only on the backend.
export const usersApi = {
  list: () => api.get<User[]>('/users').then((r) => r.data),
};

// Minimal agent directory (id, name, role) — available to any authenticated user.
// Used by the lead-assignment dropdown so we don't leak admin accounts.
export interface AgentOption {
  id: string;
  name: string;
  role: 'AGENT';
}

export const agentsApi = {
  list: () => api.get<AgentOption[]>('/agents').then((r) => r.data),
};

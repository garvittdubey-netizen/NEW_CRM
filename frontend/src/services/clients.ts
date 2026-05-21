import api from './api';
import type {
  Client,
  ClientsResponse,
  CreateClientData,
  UpdateClientData,
  ClientTimelineItem,
} from '@/types';

export interface ClientListParams {
  page?: number;
  limit?: number;
  search?: string;
  assignedAgentId?: string;
  linkedLeadId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const clientsApi = {
  list: (params: ClientListParams) =>
    api.get<ClientsResponse>('/clients', { params }).then((r) => r.data),

  get: (id: string) => api.get<Client>(`/clients/${id}`).then((r) => r.data),

  create: (data: CreateClientData) =>
    api.post<Client>('/clients', data).then((r) => r.data),

  update: (id: string, data: UpdateClientData) =>
    api.put<Client>(`/clients/${id}`, data).then((r) => r.data),

  delete: (id: string) => api.delete(`/clients/${id}`),

  assign: (id: string, agentId: string | null) =>
    api.patch<Client>(`/clients/${id}/assign`, { agentId }).then((r) => r.data),

  timeline: (id: string) =>
    api.get<{ items: ClientTimelineItem[] }>(`/clients/${id}/timeline`).then((r) => r.data.items),

  reactivate: (id: string, reason: string) =>
    api
      .post<{
        client: Client;
        lead: {
          id: string;
          fullName: string;
          status: string;
          phone: string | null;
          email: string | null;
          assignedAgentId: string | null;
        };
        mode: 'RESTORED' | 'CREATED';
      }>(`/clients/${id}/reactivate`, { reason })
      .then((r) => r.data),
};

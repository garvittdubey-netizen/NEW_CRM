import api from './api';
import type {
  Deal,
  DealsResponse,
  CreateDealData,
  UpdateDealData,
  DealTimelineItem,
} from '@/types';

export interface DealListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  assignedAgentId?: string;
  propertyId?: string;
  clientId?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const dealsApi = {
  list: (params: DealListParams) =>
    api.get<DealsResponse>('/deals', { params }).then((r) => r.data),

  get: (id: string) => api.get<Deal>(`/deals/${id}`).then((r) => r.data),

  create: (data: CreateDealData) => api.post<Deal>('/deals', data).then((r) => r.data),

  update: (id: string, data: UpdateDealData) =>
    api.put<Deal>(`/deals/${id}`, data).then((r) => r.data),

  delete: (id: string) => api.delete(`/deals/${id}`),

  timeline: (id: string) =>
    api
      .get<{ items: DealTimelineItem[] }>(`/deals/${id}/timeline`)
      .then((r) => r.data.items),

  activities: (id: string) =>
    api
      .get<{ items: DealTimelineItem[] }>(`/deals/${id}/activities`)
      .then((r) => r.data.items),
};

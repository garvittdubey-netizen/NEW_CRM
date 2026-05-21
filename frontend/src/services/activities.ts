import api from './api';
import type { ActivitiesResponse } from '@/types';

export interface ListActivitiesParams {
  userId?: string;
  leadId?: string;
  action?: string;
  page?: number;
  limit?: number;
}

export const activitiesApi = {
  list: (params: ListActivitiesParams = {}) =>
    api.get<ActivitiesResponse>('/activities', { params }).then((r) => r.data),
};

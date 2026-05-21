import api from './api';
import type {
  Communication,
  CommunicationsResponse,
  ConversationSummary,
  LogCallPayload,
  SendWhatsAppPayload,
  WhatsAppTemplate,
} from '@/types';

export interface ListCommunicationsParams {
  leadId?: string;
  type?: 'WHATSAPP' | 'CALL';
  page?: number;
  limit?: number;
}

export const communicationsApi = {
  list: (params: ListCommunicationsParams = {}) =>
    api.get<CommunicationsResponse>('/communications', { params }).then((r) => r.data),

  conversations: () =>
    api
      .get<{ conversations: ConversationSummary[] }>('/communications/conversations')
      .then((r) => r.data.conversations),

  sendWhatsApp: (data: SendWhatsAppPayload) =>
    api.post<Communication>('/communications/whatsapp/send', data).then((r) => r.data),

  logCall: (data: LogCallPayload) =>
    api.post<Communication>('/communications/calls', data).then((r) => r.data),

  templates: () =>
    api
      .get<{ templates: WhatsAppTemplate[] }>('/communications/templates')
      .then((r) => r.data.templates),
};

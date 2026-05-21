/**
 * Meta WhatsApp Cloud API public webhook.
 *
 * - GET  /api/webhooks/whatsapp   Verification handshake. Echoes hub.challenge
 *                                  iff hub.verify_token matches our env value.
 * - POST /api/webhooks/whatsapp   HMAC-verified callback. Parses inbound
 *                                  messages and status updates and forwards
 *                                  them to the communication service.
 *
 * IMPORTANT: this router is mounted with a JSON parser configured to retain
 * the raw body buffer on req.rawBody. The signature middleware needs the
 * untouched bytes to verify HMAC. See index.ts.
 */
import { Router, Request, Response } from 'express';
import { WHATSAPP_VERIFY_TOKEN } from '../config/whatsapp';
import { verifyWhatsAppSignature } from '../middleware/verifyWhatsAppSignature';
import * as comm from '../services/communication.service';

export const whatsappWebhookRouter = Router();

whatsappWebhookRouter.get('/', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN && typeof challenge === 'string') {
    res.status(200).send(challenge);
    return;
  }
  res.status(403).send('Verification failed');
});

interface MetaMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}
interface MetaStatus {
  id?: string;
  status?: string;
  errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
}
interface MetaContact {
  profile?: { name?: string };
  wa_id?: string;
}
interface MetaChangeValue {
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
  contacts?: MetaContact[];
}
interface MetaChange { value?: MetaChangeValue; field?: string }
interface MetaEntry { changes?: MetaChange[] }
interface MetaWebhookPayload { object?: string; entry?: MetaEntry[] }

whatsappWebhookRouter.post(
  '/',
  verifyWhatsAppSignature,
  async (req: Request, res: Response): Promise<void> => {
    // Always 200 quickly — Meta retries for 7 days on non-200.
    res.status(200).json({ received: true });

    try {
      const body = req.body as MetaWebhookPayload;
      if (body.object !== 'whatsapp_business_account') return;
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          if (change.field !== 'messages') continue;
          const value = change.value ?? {};

          // Inbound messages
          for (const m of value.messages ?? []) {
            if (!m.id || !m.from) continue;
            const contact = value.contacts?.find((c) => c.wa_id === m.from);
            await comm.handleInboundMessage({
              whatsappMessageId: m.id,
              fromPhone: m.from,
              type: m.type || 'text',
              text: m.text?.body ?? null,
              contactName: contact?.profile?.name ?? null,
            });
          }

          // Delivery / read status updates
          for (const s of value.statuses ?? []) {
            if (!s.id || !s.status) continue;
            const firstErr = s.errors?.[0];
            await comm.updateMessageStatus(
              s.id,
              s.status,
              firstErr?.code,
              firstErr?.error_data?.details || firstErr?.message || firstErr?.title,
            );
          }
        }
      }
    } catch (e) {
      console.error('[whatsapp webhook] processing failed:', e);
    }
  },
);

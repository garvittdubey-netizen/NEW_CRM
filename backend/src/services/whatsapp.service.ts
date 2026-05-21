/**
 * Thin wrapper around the Meta WhatsApp Cloud API (Graph API).
 *
 * - sendText: free-form service message (only valid inside the 24h customer
 *   service window).
 * - sendTemplate: pre-approved template with positional body parameters.
 * - listTemplates: paginated list of templates from the WhatsApp Business
 *   Account (used by the template picker UI).
 *
 * All Graph API errors are normalised into `WhatsAppApiError` with the upstream
 * status/code/message preserved so the controller can map them to HTTP 400/502.
 */
import {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_BUSINESS_ACCOUNT_ID,
  WHATSAPP_GRAPH_BASE_URL,
  WHATSAPP_PHONE_NUMBER_ID,
  isWhatsAppConfigured,
} from '../config/whatsapp';

export class WhatsAppApiError extends Error {
  public readonly status: number;
  public readonly code?: number;
  public readonly details?: unknown;

  constructor(message: string, status: number, code?: number, details?: unknown) {
    super(message);
    this.name = 'WhatsAppApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface SendResult {
  whatsappMessageId: string;
  raw: unknown;
}

interface MetaSendResponse {
  messages?: Array<{ id: string }>;
  error?: { message?: string; code?: number };
}

async function graphFetch(path: string, init: RequestInit): Promise<unknown> {
  if (!isWhatsAppConfigured) {
    throw new WhatsAppApiError('WhatsApp Cloud API credentials are not configured', 503);
  }
  const url = `${WHATSAPP_GRAPH_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number } } | null)?.error;
    // Remap upstream 401 (e.g. expired access token) to 502 so the frontend's
    // global "redirect to /login on 401" interceptor doesn't conflate Meta auth
    // with our own JWT auth.
    const status = res.status === 401 ? 502 : res.status;
    throw new WhatsAppApiError(
      err?.message || `WhatsApp API error (${res.status})`,
      status,
      err?.code,
      body,
    );
  }
  return body;
}

export async function sendText(to: string, message: string): Promise<SendResult> {
  const body = (await graphFetch(`/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message },
    }),
  })) as MetaSendResponse;

  const id = body.messages?.[0]?.id;
  if (!id) throw new WhatsAppApiError('WhatsApp API did not return a message id', 502);
  return { whatsappMessageId: id, raw: body };
}

/**
 * Send an image hosted at a public URL. Meta downloads the image server-side
 * and delivers it as a native image attachment (NOT a plain link), which is
 * what we want when sharing a property card.
 *
 * The `caption` is optional and renders below the image; we leave it empty
 * for the property-share flow because the caller queues a separate, formatted
 * text message right after for richer formatting.
 */
export async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string,
): Promise<SendResult> {
  const body = (await graphFetch(`/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: caption ? { link: imageUrl, caption } : { link: imageUrl },
    }),
  })) as MetaSendResponse;

  const id = body.messages?.[0]?.id;
  if (!id) throw new WhatsAppApiError('WhatsApp API did not return a message id', 502);
  return { whatsappMessageId: id, raw: body };
}

export async function sendTemplate(
  to: string,
  templateName: string,
  languageCode: string,
  variables: string[] = [],
): Promise<SendResult> {
  const components =
    variables.length > 0
      ? [
          {
            type: 'body',
            parameters: variables.map((value) => ({ type: 'text', text: value })),
          },
        ]
      : undefined;

  const payload: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { policy: 'deterministic', code: languageCode },
      ...(components ? { components } : {}),
    },
  };

  const body = (await graphFetch(`/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })) as MetaSendResponse;

  const id = body.messages?.[0]?.id;
  if (!id) throw new WhatsAppApiError('WhatsApp API did not return a message id', 502);
  return { whatsappMessageId: id, raw: body };
}

export interface TemplateSummary {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  bodyText?: string;
  bodyParamCount: number;
}

interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components?: Array<{ type: string; text?: string; format?: string }>;
}

interface MetaTemplateList {
  data?: MetaTemplate[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string };
}

/**
 * Extract the body text from a template definition and count the {{n}}
 * placeholders so the UI can render the correct number of input fields.
 */
function summariseTemplate(t: MetaTemplate): TemplateSummary {
  const body = t.components?.find((c) => c.type === 'BODY');
  const bodyText = body?.text ?? '';
  const matches = bodyText.match(/{{\d+}}/g);
  return {
    id: t.id,
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category,
    bodyText,
    bodyParamCount: matches ? matches.length : 0,
  };
}

export async function listTemplates(limit = 100): Promise<TemplateSummary[]> {
  if (!WHATSAPP_BUSINESS_ACCOUNT_ID) {
    throw new WhatsAppApiError('WHATSAPP_BUSINESS_ACCOUNT_ID not configured', 503);
  }
  const data = (await graphFetch(
    `/${WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates?limit=${limit}&fields=id,name,language,status,category,components`,
    { method: 'GET' },
  )) as MetaTemplateList;
  return (data.data ?? []).map(summariseTemplate);
}

/**
 * Centralised WhatsApp Cloud API configuration.
 *
 * Reads credentials from process.env and exposes a single `isConfigured` flag
 * so feature code can fail with a clear "credentials missing" error instead of
 * crashing the server at boot.
 */
export const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? '';
export const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
export const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '';
export const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? '';
export const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN ?? '';
export const WHATSAPP_GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION ?? 'v22.0';

export const WHATSAPP_GRAPH_BASE_URL = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}`;

export const isWhatsAppConfigured =
  !!WHATSAPP_ACCESS_TOKEN &&
  !!WHATSAPP_PHONE_NUMBER_ID &&
  !!WHATSAPP_APP_SECRET &&
  !!WHATSAPP_VERIFY_TOKEN;

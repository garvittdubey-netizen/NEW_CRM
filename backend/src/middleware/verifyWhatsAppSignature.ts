/**
 * Verifies Meta's X-Hub-Signature-256 webhook signature.
 *
 * Requires that the parent Express route was mounted with a JSON parser
 * configured to stash the raw body on req.rawBody — see index.ts.
 *
 * Algorithm: HMAC-SHA256(rawBody, WHATSAPP_APP_SECRET) compared via
 * crypto.timingSafeEqual against the hex digest in the header.
 */
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { WHATSAPP_APP_SECRET } from '../config/whatsapp';

type ReqWithRaw = Request & { rawBody?: Buffer };

export function verifyWhatsAppSignature(req: ReqWithRaw, res: Response, next: NextFunction): void {
  const header =
    (req.get('X-Hub-Signature-256') || req.get('x-hub-signature-256') || '').trim();
  if (!header) {
    res.status(401).send('Signature missing');
    return;
  }
  const [algo, received] = header.split('=');
  if (algo !== 'sha256' || !received) {
    res.status(401).send('Invalid signature format');
    return;
  }
  if (!req.rawBody) {
    res.status(500).send('Server misconfiguration: rawBody unavailable');
    return;
  }
  if (!WHATSAPP_APP_SECRET) {
    res.status(503).send('WhatsApp app secret not configured');
    return;
  }

  const expected = crypto
    .createHmac('sha256', WHATSAPP_APP_SECRET)
    .update(req.rawBody)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  let receivedBuf: Buffer;
  try {
    receivedBuf = Buffer.from(received, 'hex');
  } catch {
    res.status(401).send('Invalid signature encoding');
    return;
  }
  if (expectedBuf.length !== receivedBuf.length) {
    res.status(401).send('Invalid signature');
    return;
  }
  if (!crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    res.status(401).send('Invalid signature');
    return;
  }
  next();
}

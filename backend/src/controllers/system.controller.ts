/**
 * Real-time health probes for the Settings → System Status panel.
 *
 * Every probe returns { healthy, latencyMs, message } so the UI can render
 * a consistent row per service. All probes have an internal timeout so a
 * stalled upstream cannot hang the response.
 *
 * Probes:
 *   - WhatsApp   : Meta Graph templates list (validates token + account id)
 *   - Cloudinary : GET /v1_1/<cloud>/ping (with Basic auth)
 *   - Database   : prisma.$queryRaw SELECT 1
 *   - Backend    : self — always healthy when this handler runs
 */
import { Request, Response } from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../lib/prisma';
import { listTemplates } from '../services/whatsapp.service';
import { isWhatsAppConfigured } from '../config/whatsapp';

interface ProbeResult {
  healthy: boolean;
  latencyMs: number;
  message: string;
}

interface SystemStatusResponse {
  whatsapp: ProbeResult;
  cloudinary: ProbeResult;
  database: ProbeResult;
  backend: ProbeResult;
  checkedAt: string;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} probe timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function probeWhatsApp(): Promise<ProbeResult> {
  const t0 = Date.now();
  if (!isWhatsAppConfigured) {
    return { healthy: false, latencyMs: 0, message: 'WhatsApp credentials not configured' };
  }
  try {
    const templates = await withTimeout(listTemplates(1), 5000, 'WhatsApp');
    return {
      healthy: true,
      latencyMs: Date.now() - t0,
      message: `OK — ${templates.length} template${templates.length === 1 ? '' : 's'} visible`,
    };
  } catch (e) {
    return {
      healthy: false,
      latencyMs: Date.now() - t0,
      message: e instanceof Error ? e.message : 'Unknown WhatsApp error',
    };
  }
}

async function probeCloudinary(): Promise<ProbeResult> {
  const t0 = Date.now();
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !key || !secret) {
    return { healthy: false, latencyMs: 0, message: 'Cloudinary credentials not configured' };
  }
  try {
    // cloudinary.api.ping returns a Promise. We use the SDK directly so the
    // signed Basic-auth header is constructed correctly.
    cloudinary.config({ cloud_name: cloud, api_key: key, api_secret: secret, secure: true });
    const result = (await withTimeout(cloudinary.api.ping(), 5000, 'Cloudinary')) as {
      status?: string;
    };
    const ok = result?.status === 'ok';
    return {
      healthy: ok,
      latencyMs: Date.now() - t0,
      message: ok ? `OK — cloud "${cloud}" reachable` : `Unexpected response: ${JSON.stringify(result)}`,
    };
  } catch (e) {
    return {
      healthy: false,
      latencyMs: Date.now() - t0,
      message: e instanceof Error ? e.message : 'Unknown Cloudinary error',
    };
  }
}

async function probeDatabase(): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000, 'Database');
    return { healthy: true, latencyMs: Date.now() - t0, message: 'OK — query succeeded' };
  } catch (e) {
    return {
      healthy: false,
      latencyMs: Date.now() - t0,
      message: e instanceof Error ? e.message : 'Unknown database error',
    };
  }
}

function probeBackend(): ProbeResult {
  // If this handler is running, the backend is reachable by definition.
  return { healthy: true, latencyMs: 0, message: 'OK — node backend reachable' };
}

export async function getSystemStatus(_req: Request, res: Response): Promise<void> {
  const [whatsapp, cloudinaryResult, database] = await Promise.all([
    probeWhatsApp(),
    probeCloudinary(),
    probeDatabase(),
  ]);
  const payload: SystemStatusResponse = {
    whatsapp,
    cloudinary: cloudinaryResult,
    database,
    backend: probeBackend(),
    checkedAt: new Date().toISOString(),
  };
  res.json(payload);
}

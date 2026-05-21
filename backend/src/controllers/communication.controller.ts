/**
 * HTTP layer for the Communication module. Thin — delegates everything to
 * the service.
 */
import { Request, Response } from 'express';
import { CommunicationType } from '@prisma/client';
import * as comm from '../services/communication.service';
import { WhatsAppApiError } from '../services/whatsapp.service';

type HttpError = Error & { httpStatus?: number };

function sendError(res: Response, e: unknown, fallback: number, label: string): void {
  if (e instanceof WhatsAppApiError) {
    res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({
      error: e.message,
      code: e.code,
      details: e.details,
    });
    return;
  }
  const err = e as HttpError;
  if (err.httpStatus) {
    res.status(err.httpStatus).json({ error: err.message });
    return;
  }
  console.error(`[${label}]`, e);
  res.status(fallback).json({ error: err.message || 'Unexpected error' });
}

export async function sendWhatsApp(req: Request, res: Response): Promise<void> {
  try {
    const record = await comm.sendWhatsApp({
      leadId: req.body.leadId,
      message: req.body.message,
      imageUrl: req.body.imageUrl,
      templateName: req.body.templateName,
      templateLang: req.body.templateLang,
      templateParams: req.body.templateParams,
      userId: req.user!.id,
      userRole: req.user!.role,
    });
    res.status(201).json(record);
  } catch (e) {
    sendError(res, e, 500, 'sendWhatsApp');
  }
}

export async function logCall(req: Request, res: Response): Promise<void> {
  try {
    const record = await comm.logCall({
      leadId: req.body.leadId,
      callOutcome: req.body.callOutcome,
      callDuration: req.body.callDuration,
      notes: req.body.notes,
      userId: req.user!.id,
      userRole: req.user!.role,
    });
    res.status(201).json(record);
  } catch (e) {
    sendError(res, e, 500, 'logCall');
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  try {
    const result = await comm.list({
      leadId: req.query.leadId as string | undefined,
      type: req.query.type as CommunicationType | undefined,
      userId: req.user!.id,
      userRole: req.user!.role,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (e) {
    sendError(res, e, 500, 'list communications');
  }
}

export async function listConversations(req: Request, res: Response): Promise<void> {
  try {
    const items = await comm.listConversations(req.user!.id, req.user!.role);
    res.json({ conversations: items });
  } catch (e) {
    sendError(res, e, 500, 'list conversations');
  }
}

export async function listTemplates(_req: Request, res: Response): Promise<void> {
  try {
    const items = await comm.listTemplates();
    res.json({ templates: items });
  } catch (e) {
    sendError(res, e, 502, 'list templates');
  }
}

/**
 * Communication domain service.
 *
 * Wraps the WhatsApp Cloud API client + Prisma persistence and ties every
 * action back into the activity log. Used by:
 *   - POST /api/communications/whatsapp/send     (send text or template)
 *   - POST /api/communications/calls             (log a call manually)
 *   - GET  /api/communications                   (paginated history, RBAC scoped)
 *   - GET  /api/communications/lead/:leadId      (per-lead timeline)
 *   - GET  /api/communications/templates         (cached pass-through of Meta templates)
 *
 * RBAC rule (enforced here, not at the controller):
 *   ADMIN  -> sees everything
 *   AGENT  -> sees communications whose lead is currently assigned to them
 */
import { Prisma, CommunicationType, CommunicationDirection } from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as whatsapp from './whatsapp.service';
import { WhatsAppApiError } from './whatsapp.service';
import * as activity from './activity.service';
import { isAdminLevel } from '../lib/roles';

const CREATOR_SELECT = { id: true, name: true, email: true, role: true } as const;
const LEAD_SELECT = { id: true, fullName: true, phone: true, assignedAgentId: true } as const;
const INCLUDE = {
  createdBy: { select: CREATOR_SELECT },
  lead: { select: LEAD_SELECT },
} as const;

function normalisePhone(raw: string): string {
  // Meta expects E.164 without the leading '+' (e.g. "919876543210")
  return raw.replace(/[^\d]/g, '');
}

async function assertLeadAccess(
  leadId: string,
  userId: string,
  userRole: string,
): Promise<{ id: string; phone: string | null; assignedAgentId: string | null; fullName: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, phone: true, assignedAgentId: true, fullName: true },
  });
  if (!lead) {
    const err = new Error('Lead not found');
    (err as Error & { httpStatus?: number }).httpStatus = 404;
    throw err;
  }
  if (!isAdminLevel(userRole) && lead.assignedAgentId !== userId) {
    const err = new Error('You can only communicate on leads assigned to you');
    (err as Error & { httpStatus?: number }).httpStatus = 403;
    throw err;
  }
  return lead;
}

// ── Sending WhatsApp messages ────────────────────────────────────────────────

export interface SendWhatsAppInput {
  leadId: string;
  message?: string;
  /** Public image URL (Cloudinary, etc.). When provided, an image message is
   *  sent FIRST as a native attachment, then the text body follows as a
   *  second message — exactly mirroring how a human would share a property.
   *  Each Meta call is persisted as its own Communication row for clean
   *  audit history. */
  imageUrl?: string;
  templateName?: string;
  templateLang?: string;
  templateParams?: string[];
  userId: string;
  userRole: string;
}

export async function sendWhatsApp(input: SendWhatsAppInput) {
  const lead = await assertLeadAccess(input.leadId, input.userId, input.userRole);
  if (!lead.phone) {
    const err = new Error('Lead has no phone number on file');
    (err as Error & { httpStatus?: number }).httpStatus = 400;
    throw err;
  }
  const to = normalisePhone(lead.phone);

  const isTemplate = !!input.templateName;
  const hasImage = !!input.imageUrl && !isTemplate;

  // ── 1. Image first (when present and not a template send) ─────────────────
  // We log the image send as its own Communication row so the per-lead
  // timeline accurately shows "image then text". The internal message field
  // stores the image URL for audit; only the recipient receives the native
  // image attachment.
  if (hasImage) {
    const imgResult = await whatsapp.sendImage(to, input.imageUrl!);
    await prisma.communication.create({
      data: {
        leadId: input.leadId,
        type: CommunicationType.WHATSAPP,
        direction: CommunicationDirection.OUTBOUND,
        message: `📷 Property image: ${input.imageUrl}`,
        status: 'SENT',
        whatsappMessageId: imgResult.whatsappMessageId,
        createdById: input.userId,
      },
    });
    await activity.log({
      userId: input.userId,
      leadId: input.leadId,
      action: 'WHATSAPP_SENT',
      description: `Sent property image to ${lead.fullName}`,
      metadata: { whatsappMessageId: imgResult.whatsappMessageId, isImage: true },
    });
  }

  // ── 2. Text or template ───────────────────────────────────────────────────
  let result: { whatsappMessageId: string };
  if (isTemplate) {
    result = await whatsapp.sendTemplate(
      to,
      input.templateName!,
      input.templateLang || 'en_US',
      input.templateParams ?? [],
    );
  } else {
    if (!input.message || !input.message.trim()) {
      const err = new Error('Message body is required');
      (err as Error & { httpStatus?: number }).httpStatus = 400;
      throw err;
    }
    result = await whatsapp.sendText(to, input.message.trim());
  }

  const record = await prisma.communication.create({
    data: {
      leadId: input.leadId,
      type: CommunicationType.WHATSAPP,
      direction: CommunicationDirection.OUTBOUND,
      message: isTemplate ? null : input.message?.trim(),
      templateName: isTemplate ? input.templateName : null,
      templateLang: isTemplate ? input.templateLang || 'en_US' : null,
      templateParams: isTemplate
        ? (input.templateParams as Prisma.InputJsonValue | undefined) ?? Prisma.JsonNull
        : Prisma.JsonNull,
      status: 'SENT',
      whatsappMessageId: result.whatsappMessageId,
      createdById: input.userId,
    },
    include: INCLUDE,
  });

  await activity.log({
    userId: input.userId,
    leadId: input.leadId,
    action: 'WHATSAPP_SENT',
    description: isTemplate
      ? `Sent WhatsApp template "${input.templateName}" to ${lead.fullName}`
      : hasImage
        ? `Sent property details (with image) to ${lead.fullName}`
        : `Sent WhatsApp message to ${lead.fullName}`,
    metadata: {
      whatsappMessageId: result.whatsappMessageId,
      isTemplate,
      includedImage: hasImage,
    },
  });

  return record;
}

// ── Manual call log ──────────────────────────────────────────────────────────

export interface LogCallInput {
  leadId: string;
  callOutcome: string;
  callDuration?: number;
  notes?: string;
  userId: string;
  userRole: string;
}

export async function logCall(input: LogCallInput) {
  const lead = await assertLeadAccess(input.leadId, input.userId, input.userRole);
  if (!input.callOutcome?.trim()) {
    const err = new Error('callOutcome is required');
    (err as Error & { httpStatus?: number }).httpStatus = 400;
    throw err;
  }

  const record = await prisma.communication.create({
    data: {
      leadId: input.leadId,
      type: CommunicationType.CALL,
      direction: null,
      message: input.notes?.trim() || null,
      callOutcome: input.callOutcome.trim(),
      callDuration: input.callDuration ?? null,
      status: 'COMPLETED',
      createdById: input.userId,
    },
    include: INCLUDE,
  });

  await activity.log({
    userId: input.userId,
    leadId: input.leadId,
    action: 'CALL_LOGGED',
    description: `Logged call with ${lead.fullName} (${input.callOutcome.trim()}${
      input.callDuration ? `, ${Math.round(input.callDuration / 60)}m` : ''
    })`,
    metadata: { callOutcome: input.callOutcome, callDuration: input.callDuration ?? null },
  });

  return record;
}

// ── Listing / scoping ────────────────────────────────────────────────────────

export interface ListCommunicationsOptions {
  leadId?: string;
  type?: CommunicationType;
  userId: string;
  userRole: string;
  page?: number;
  limit?: number;
}

function buildScope(opts: ListCommunicationsOptions): Prisma.CommunicationWhereInput {
  const where: Prisma.CommunicationWhereInput = {};
  if (opts.leadId) where.leadId = opts.leadId;
  if (opts.type) where.type = opts.type;
  if (opts.userRole === 'AGENT') {
    where.lead = { assignedAgentId: opts.userId };
  }
  return where;
}

export async function list(opts: ListCommunicationsOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const where = buildScope(opts);

  const [items, total] = await Promise.all([
    prisma.communication.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.communication.count({ where }),
  ]);

  return { communications: items, total, page, limit, pages: Math.ceil(total / limit) };
}

/**
 * Conversation list — one entry per lead with its most-recent communication.
 * Used to power the chat inbox sidebar.
 */
export async function listConversations(userId: string, userRole: string) {
  // Find leads that have at least one communication; scope by role.
  const leadWhere: Prisma.LeadWhereInput = {
    communications: { some: {} },
  };
  if (userRole === 'AGENT') leadWhere.assignedAgentId = userId;

  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: {
      id: true,
      fullName: true,
      phone: true,
      status: true,
      assignedAgentId: true,
      communications: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, type: true, direction: true, message: true, status: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  return leads.map((l) => ({
    leadId: l.id,
    leadName: l.fullName,
    phone: l.phone,
    status: l.status,
    lastMessage: l.communications[0] ?? null,
  }));
}

// ── Webhook handlers ────────────────────────────────────────────────────────

/**
 * Update an outbound row's status (sent / delivered / read / failed) from a
 * Meta status webhook. No-op when we don't know the message id locally.
 */
export async function updateMessageStatus(
  whatsappMessageId: string,
  status: string,
  errorCode?: number,
  errorDetail?: string,
): Promise<void> {
  await prisma.communication.updateMany({
    where: { whatsappMessageId },
    data: {
      status: status.toUpperCase(),
      ...(errorCode !== undefined ? { errorCode } : {}),
      ...(errorDetail ? { errorDetail } : {}),
    },
  });
}

/**
 * Persist an inbound WhatsApp message from the webhook. Matches the lead by
 * phone (normalised) when possible; otherwise stored against the first lead
 * with that phone or skipped if no match (Meta requires us to return 200 either
 * way to avoid retries).
 */
export interface InboundMessageInput {
  whatsappMessageId: string;
  fromPhone: string;
  text: string | null;
  type: string;
  contactName?: string | null;
}

export async function handleInboundMessage(input: InboundMessageInput): Promise<void> {
  if (!input.fromPhone) return;
  // Idempotency: if this message id is already stored, skip.
  const existing = await prisma.communication.findUnique({
    where: { whatsappMessageId: input.whatsappMessageId },
    select: { id: true },
  });
  if (existing) return;

  // Match a lead whose phone (digits only) ends with the inbound number or
  // vice versa — Meta strips the leading '+' and some leads store it.
  const digits = normalisePhone(input.fromPhone);
  const lead = await prisma.lead.findFirst({
    where: {
      OR: [{ phone: { contains: digits } }, { phone: { endsWith: digits.slice(-10) } }],
    },
    select: { id: true, fullName: true, assignedAgentId: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!lead) {
    console.warn('[whatsapp.webhook] Inbound message with no matching lead phone:', digits);
    return;
  }

  await prisma.communication.create({
    data: {
      leadId: lead.id,
      type: CommunicationType.WHATSAPP,
      direction: CommunicationDirection.INBOUND,
      message: input.text,
      status: 'RECEIVED',
      whatsappMessageId: input.whatsappMessageId,
    },
  });

  if (lead.assignedAgentId) {
    await activity.log({
      userId: lead.assignedAgentId,
      leadId: lead.id,
      action: 'WHATSAPP_RECEIVED',
      description: `Received WhatsApp message from ${lead.fullName}`,
      metadata: { whatsappMessageId: input.whatsappMessageId, preview: input.text?.slice(0, 120) ?? null },
    });
  }
}

// ── Template pass-through ────────────────────────────────────────────────────

export async function listTemplates() {
  try {
    const templates = await whatsapp.listTemplates();
    // Only expose APPROVED templates to the UI.
    return templates.filter((t) => t.status === 'APPROVED');
  } catch (e) {
    if (e instanceof WhatsAppApiError) throw e;
    throw e;
  }
}

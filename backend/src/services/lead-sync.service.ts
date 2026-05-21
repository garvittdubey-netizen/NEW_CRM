/**
 * Cross-module status sync: Deal → Lead.
 *
 * When a deal transitions to a stage that has a meaningful counterpart on
 * the Lead funnel, propagate the change back to the linked lead so the
 * Lead page never drifts from the Deal page. Linkage is:
 *
 *   Deal.clientId → Client.linkedLeadId → Lead
 *
 * Only fires when:
 *   - the deal's status actually changed (caller responsibility);
 *   - the deal status maps to a lead status (table below);
 *   - the deal's client has a `linkedLeadId` AND that lead still exists;
 *   - the lead's current status differs from the target status (no-op guard).
 *
 * Activity trail: writes a `LEAD_STATUS_SYNCED` row on the lead's Activity
 * feed with `metadata = { previousStatus, newStatus, source: 'DEAL', dealId }`.
 * Errors are swallowed — this is a best-effort side-effect and must never
 * roll back the parent deal update.
 */
import { DealStatus, LeadStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import * as activityService from './activity.service';

/**
 * Mapping table. Aligned with the spec:
 *   WON          → WON
 *   LOST         → LOST
 *   NEGOTIATION  → NEGOTIATING        (deal enum is "NEGOTIATION", lead is "NEGOTIATING")
 *   DOCUMENTATION → QUALIFIED         (deeper-stage signal — beyond cold)
 *   PAYMENT_PENDING → QUALIFIED       (same)
 *   NEW          → (not synced)       — avoids clobbering CONTACTED/QUALIFIED
 *
 * `undefined` means "do not touch the lead", which is the safe default.
 */
const DEAL_TO_LEAD: Partial<Record<DealStatus, LeadStatus>> = {
  NEGOTIATION: 'NEGOTIATING',
  DOCUMENTATION: 'QUALIFIED',
  PAYMENT_PENDING: 'QUALIFIED',
  WON: 'WON',
  LOST: 'LOST',
};

export interface SyncInput {
  dealId: string;
  clientId: string;
  newDealStatus: DealStatus | string;
  actorId: string;
}

export interface SyncResult {
  synced: boolean;
  /** Only populated when `synced === true`. */
  leadId?: string;
  previousLeadStatus?: LeadStatus;
  newLeadStatus?: LeadStatus;
}

export async function syncLeadStatusFromDeal(input: SyncInput): Promise<SyncResult> {
  const target = DEAL_TO_LEAD[input.newDealStatus as DealStatus];
  if (!target) return { synced: false };

  try {
    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { linkedLeadId: true },
    });
    if (!client?.linkedLeadId) return { synced: false };

    const lead = await prisma.lead.findUnique({
      where: { id: client.linkedLeadId },
      select: { id: true, status: true, fullName: true },
    });
    if (!lead) return { synced: false };
    if (lead.status === target) {
      return { synced: false, leadId: lead.id };
    }

    const previousLeadStatus = lead.status;
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: target },
    });

    // Best-effort activity log so users browsing the lead immediately see
    // why the status flipped without checking the deal.
    await activityService.log({
      userId: input.actorId,
      leadId: lead.id,
      action: 'LEAD_STATUS_SYNCED',
      description: `Lead status synced from deal: ${previousLeadStatus} → ${target}`,
      metadata: {
        previousStatus: previousLeadStatus,
        newStatus: target,
        source: 'DEAL',
        dealId: input.dealId,
      },
    });

    return {
      synced: true,
      leadId: lead.id,
      previousLeadStatus,
      newLeadStatus: target,
    };
  } catch (e) {
    console.warn('[lead-sync] failed:', e);
    return { synced: false };
  }
}

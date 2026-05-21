import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { Prisma, LeadStatus, LeadSource } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * CSV import/export service for leads + analytics reports.
 *
 * Import contract (rows in the input CSV map 1:1 to leads):
 *   fullName, phone, email, budget, preferredLocation, bhk, propertyType,
 *   status, source, tags, notes
 *
 *   - `fullName` REQUIRED. Empty rows are skipped silently.
 *   - `tags` is semicolon-separated (`hot;investor`).
 *   - `status` defaults to NEW, `source` defaults to MANUAL.
 *   - Invalid enum values cause the row to fail (not the whole file).
 *   - Duplicates are detected by exact phone match OR case-insensitive email
 *     against existing leads; matching rows are reported as `skipped`.
 *   - `assignedAgentId` is NEVER imported from CSV; the admin assigns later.
 */

const SAMPLE_HEADER = [
  'fullName', 'phone', 'email', 'budget', 'preferredLocation',
  'bhk', 'propertyType', 'status', 'source', 'tags', 'notes',
];

const SAMPLE_ROWS: string[][] = [
  ['Priya Sharma', '+919876543210', 'priya@example.com', '8500000', 'Andheri, Mumbai', '2BHK', 'Apartment', 'NEW', 'WEBSITE', 'hot;investor', 'Looking for sea-facing flat'],
  ['Rohan Kapoor', '+919812345678', 'rohan@example.com', '15000000', 'Bandra West, Mumbai', '3BHK', 'Apartment', 'CONTACTED', 'REFERRAL', 'urgent', 'Wants to move within 2 months'],
];

const VALID_STATUSES = new Set<LeadStatus>(['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST']);
const VALID_SOURCES  = new Set<LeadSource>(['FACEBOOK', 'WHATSAPP', 'WEBSITE', 'REFERRAL', 'MANUAL', 'PROPERTY_PORTAL', 'OTHER']);

export interface ImportRowResult {
  row: number;     // 1-indexed row number in the original CSV (excluding header)
  status: 'imported' | 'skipped' | 'failed';
  reason?: string;
  leadId?: string;
}

export interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

/** Returns the sample CSV (header + 2 example rows) as a UTF-8 string. */
export function getSampleCsv(): string {
  return stringify([SAMPLE_HEADER, ...SAMPLE_ROWS], { quoted_string: true });
}

/**
 * Parses & imports a CSV buffer. The buffer is treated as UTF-8.
 * The function NEVER throws on a row-level failure — it records the error
 * in `summary.rows` and continues. It throws only on a total-file error
 * (malformed CSV, missing fullName column, etc.).
 */
export async function importLeadsCsv(buffer: Buffer): Promise<ImportSummary> {
  let rows: Record<string, string>[];
  try {
    rows = parse(buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    }) as Record<string, string>[];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to parse CSV';
    throw new Error(`Invalid CSV: ${msg}`);
  }

  if (rows.length === 0) {
    return { total: 0, imported: 0, skipped: 0, failed: 0, rows: [] };
  }

  // Validate header has fullName at minimum.
  if (!('fullName' in rows[0])) {
    throw new Error('CSV must include a "fullName" column');
  }

  // Pre-load existing phones + lower-cased emails for O(1) duplicate detection.
  const existing = await prisma.lead.findMany({
    select: { phone: true, email: true },
  });
  const existingPhones = new Set(existing.map((l) => l.phone).filter((p): p is string => !!p));
  const existingEmails = new Set(
    existing.map((l) => l.email?.toLowerCase()).filter((e): e is string => !!e),
  );

  const summary: ImportSummary = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    failed: 0,
    rows: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 1;

    try {
      const fullName = (r.fullName ?? '').trim();
      if (!fullName) {
        summary.rows.push({ row: rowNum, status: 'failed', reason: 'fullName is required' });
        summary.failed++;
        continue;
      }

      const phone = (r.phone ?? '').trim() || null;
      const email = (r.email ?? '').trim().toLowerCase() || null;

      // Duplicate detection within DB + within the CSV itself
      if (phone && existingPhones.has(phone)) {
        summary.rows.push({ row: rowNum, status: 'skipped', reason: `Duplicate phone: ${phone}` });
        summary.skipped++;
        continue;
      }
      if (email && existingEmails.has(email)) {
        summary.rows.push({ row: rowNum, status: 'skipped', reason: `Duplicate email: ${email}` });
        summary.skipped++;
        continue;
      }

      // Enum validation
      const statusRaw = (r.status ?? '').trim().toUpperCase() || 'NEW';
      if (!VALID_STATUSES.has(statusRaw as LeadStatus)) {
        summary.rows.push({ row: rowNum, status: 'failed', reason: `Invalid status: ${statusRaw}` });
        summary.failed++;
        continue;
      }
      const sourceRaw = (r.source ?? '').trim().toUpperCase() || 'MANUAL';
      if (!VALID_SOURCES.has(sourceRaw as LeadSource)) {
        summary.rows.push({ row: rowNum, status: 'failed', reason: `Invalid source: ${sourceRaw}` });
        summary.failed++;
        continue;
      }

      // Budget — empty allowed, otherwise must be a positive number
      let budget: Prisma.Decimal | null = null;
      if ((r.budget ?? '').trim() !== '') {
        const n = Number(r.budget);
        if (!Number.isFinite(n) || n < 0) {
          summary.rows.push({ row: rowNum, status: 'failed', reason: `Invalid budget: ${r.budget}` });
          summary.failed++;
          continue;
        }
        budget = new Prisma.Decimal(n);
      }

      const tags = (r.tags ?? '')
        .split(';')
        .map((t) => t.trim())
        .filter(Boolean);

      const lead = await prisma.lead.create({
        data: {
          fullName,
          phone,
          email,
          budget,
          preferredLocation: (r.preferredLocation ?? '').trim() || null,
          bhk: (r.bhk ?? '').trim() || null,
          propertyType: (r.propertyType ?? '').trim() || null,
          status: statusRaw as LeadStatus,
          source: sourceRaw as LeadSource,
          tags,
          notes: (r.notes ?? '').trim() || null,
          assignedAgentId: null,
        },
        select: { id: true },
      });

      // Mark these as seen so a later duplicate within the SAME file is skipped
      if (phone) existingPhones.add(phone);
      if (email) existingEmails.add(email);

      summary.rows.push({ row: rowNum, status: 'imported', leadId: lead.id });
      summary.imported++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      summary.rows.push({ row: rowNum, status: 'failed', reason: msg });
      summary.failed++;
    }
  }

  return summary;
}

/**
 * Exports every lead visible to the caller as a CSV string.
 * RBAC: AGENT callers see only their own assigned leads.
 */
export async function exportLeadsCsv(userId: string, userRole: string): Promise<string> {
  const where: Prisma.LeadWhereInput = {};
  if (userRole === 'AGENT') where.assignedAgentId = userId;

  const leads = await prisma.lead.findMany({
    where,
    include: { assignedAgent: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });

  const header = [
    'id', 'fullName', 'phone', 'email', 'budget', 'preferredLocation',
    'bhk', 'propertyType', 'status', 'source', 'tags', 'notes',
    'assignedAgent', 'assignedAgentEmail', 'createdAt', 'updatedAt',
  ];

  const rows = leads.map((l) => [
    l.id,
    l.fullName,
    l.phone ?? '',
    l.email ?? '',
    l.budget != null ? Number(l.budget).toString() : '',
    l.preferredLocation ?? '',
    l.bhk ?? '',
    l.propertyType ?? '',
    l.status,
    l.source,
    l.tags.join(';'),
    l.notes ?? '',
    l.assignedAgent?.name ?? '',
    l.assignedAgent?.email ?? '',
    l.createdAt.toISOString(),
    l.updatedAt.toISOString(),
  ]);

  return stringify([header, ...rows], { quoted_string: true });
}

/**
 * Generic helper used by every analytics export endpoint. Each section is
 * shaped as { header: string[], rows: (string|number)[][] } and turned into
 * a CSV string with consistent quoting.
 */
export function rowsToCsv(header: string[], rows: (string | number)[][]): string {
  return stringify([header, ...rows], { quoted_string: true });
}

import { Request, Response } from 'express';
import multer from 'multer';
import {
  importLeadsCsv,
  exportLeadsCsv,
  getSampleCsv,
  rowsToCsv,
} from '../services/csv.service';
import * as analytics from '../services/analytics.service';

/** 5 MB cap — enough for ~25K rows, prevents accidental OOM uploads. */
export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

/** Sends a CSV string as an attachment with a UTF-8 BOM (Excel-friendly). */
function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
}

export async function importLeads(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ error: 'CSV file is required (field name: "file")' });
    return;
  }
  try {
    const summary = await importLeadsCsv(req.file.buffer);
    res.status(201).json(summary);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Import failed';
    res.status(400).json({ error: msg });
  }
}

export async function exportLeads(req: Request, res: Response): Promise<void> {
  try {
    const csv = await exportLeadsCsv(req.user!.id, req.user!.role);
    sendCsv(res, `leads-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  } catch (e) {
    console.error('exportLeads:', e);
    res.status(500).json({ error: 'Failed to export leads' });
  }
}

export function sampleTemplate(_req: Request, res: Response): void {
  sendCsv(res, 'leads-sample-template.csv', getSampleCsv());
}

// ── Analytics CSV exports — one endpoint per section ────────────────────────

function parseRange(req: Request) {
  return analytics.resolveRange({
    range: req.query.range as analytics.AnalyticsRange | undefined,
    from: req.query.from as string | undefined,
    to: req.query.to as string | undefined,
  });
}

function scopeOf(req: Request) {
  return { userId: req.user!.id, userRole: req.user!.role };
}

function rangeSuffix(range: analytics.ResolvedRange): string {
  const fromDate = range.from.toISOString().slice(0, 10);
  const toDate = range.to.toISOString().slice(0, 10);
  return `${fromDate}_to_${toDate}`;
}

export async function exportAnalyticsOverview(req: Request, res: Response): Promise<void> {
  try {
    const range = parseRange(req);
    const o = await analytics.getOverview(scopeOf(req), range);
    const csv = rowsToCsv(
      ['metric', 'value'],
      [
        ['rangeFrom',       o.range.from],
        ['rangeTo',         o.range.to],
        ['rangeLabel',      o.range.label],
        ['totalLeads',      o.totalLeads],
        ['wonLeads',        o.wonLeads],
        ['lostLeads',       o.lostLeads],
        ['conversionRate%', o.conversionRate],
      ],
    );
    sendCsv(res, `analytics-overview_${rangeSuffix(range)}.csv`, csv);
  } catch (e) {
    console.error('exportAnalyticsOverview:', e);
    res.status(500).json({ error: 'Failed to export overview' });
  }
}

export async function exportLeadsByStatus(req: Request, res: Response): Promise<void> {
  try {
    const range = parseRange(req);
    const data = await analytics.getLeadsByStatus(scopeOf(req), range);
    const csv = rowsToCsv(['status', 'count'], data.map((d) => [d.status, d.count]));
    sendCsv(res, `analytics-leads-by-status_${rangeSuffix(range)}.csv`, csv);
  } catch (e) {
    console.error('exportLeadsByStatus:', e);
    res.status(500).json({ error: 'Failed to export leads-by-status' });
  }
}

export async function exportLeadsBySource(req: Request, res: Response): Promise<void> {
  try {
    const range = parseRange(req);
    const data = await analytics.getLeadsBySource(scopeOf(req), range);
    const csv = rowsToCsv(['source', 'count'], data.map((d) => [d.source, d.count]));
    sendCsv(res, `analytics-leads-by-source_${rangeSuffix(range)}.csv`, csv);
  } catch (e) {
    console.error('exportLeadsBySource:', e);
    res.status(500).json({ error: 'Failed to export leads-by-source' });
  }
}

export async function exportFollowUpStats(req: Request, res: Response): Promise<void> {
  try {
    const range = parseRange(req);
    const data = await analytics.getFollowUpStats(scopeOf(req), range);
    const rows: (string | number)[][] = data.byStatus.map((b) => [b.status, b.count]);
    rows.push(['TOTAL',           data.total]);
    rows.push(['COMPLETED',       data.completed]);
    rows.push(['COMPLETION_RATE', data.completionRate]);
    const csv = rowsToCsv(['metric', 'value'], rows);
    sendCsv(res, `analytics-followups_${rangeSuffix(range)}.csv`, csv);
  } catch (e) {
    console.error('exportFollowUpStats:', e);
    res.status(500).json({ error: 'Failed to export follow-up stats' });
  }
}

export async function exportAgentPerformance(req: Request, res: Response): Promise<void> {
  try {
    const range = parseRange(req);
    const data = await analytics.getAgentPerformance(scopeOf(req), range);
    const csv = rowsToCsv(
      ['agentId', 'agentName', 'agentEmail', 'assignedLeads', 'contactedLeads', 'wonLeads', 'lostLeads', 'conversionRate%'],
      data.map((r) => [
        r.agentId, r.agentName, r.agentEmail,
        r.assignedLeads, r.contactedLeads, r.wonLeads, r.lostLeads, r.conversionRate,
      ]),
    );
    sendCsv(res, `analytics-agents_${rangeSuffix(range)}.csv`, csv);
  } catch (e) {
    console.error('exportAgentPerformance:', e);
    res.status(500).json({ error: 'Failed to export agent performance' });
  }
}

export async function exportCommunicationStats(req: Request, res: Response): Promise<void> {
  try {
    const range = parseRange(req);
    const c = await analytics.getCommunicationStats(scopeOf(req), range);
    const csv = rowsToCsv(
      ['metric', 'value'],
      [
        ['messagesSent',     c.messagesSent],
        ['messagesReceived', c.messagesReceived],
        ['callsLogged',      c.callsLogged],
        ['total',            c.total],
      ],
    );
    sendCsv(res, `analytics-communications_${rangeSuffix(range)}.csv`, csv);
  } catch (e) {
    console.error('exportCommunicationStats:', e);
    res.status(500).json({ error: 'Failed to export communication stats' });
  }
}

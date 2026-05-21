import { Request, Response } from 'express';
import * as reportService from '../services/report.service';
import { rowsToCsv } from '../services/csv.service';

/**
 * ADMIN-only Reports endpoints. RBAC is enforced at the router via
 * `requireRole('ADMIN')`, so these handlers can assume an authorised admin.
 *
 * Each report has a JSON GET and a CSV GET sibling. The CSV format mirrors
 * the JSON breakdown 1:1 so the user can pivot the spreadsheet without
 * having to remember which columns mean what.
 */

function parseRange(req: Request): reportService.ReportRange | undefined {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  if (!from && !to) return undefined;
  const out: reportService.ReportRange = {};
  if (from) {
    const d = new Date(from);
    if (!isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      out.from = d;
    }
  }
  if (to) {
    const d = new Date(to);
    if (!isNaN(d.getTime())) {
      d.setHours(23, 59, 59, 999);
      out.to = d;
    }
  }
  return out;
}

function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
}

// ── Lead report ─────────────────────────────────────────────────────────────

export async function leadReport(req: Request, res: Response): Promise<void> {
  try {
    res.json(await reportService.getLeadReport(parseRange(req)));
  } catch (e) {
    console.error('leadReport:', e);
    res.status(500).json({ error: 'Failed to load lead report' });
  }
}

export async function exportLeadReport(req: Request, res: Response): Promise<void> {
  try {
    const r = await reportService.getLeadReport(parseRange(req));
    const header = ['section', 'key', 'count'];
    const rows: (string | number)[][] = [
      ['summary', 'totalLeads', r.total],
      ['summary', 'wonLeads', r.won],
      ['summary', 'conversionRate%', r.conversionRate],
      ...r.byStatus.map((s) => ['byStatus', s.status, s.count] as (string | number)[]),
      ...r.bySource.map((s) => ['bySource', s.source, s.count] as (string | number)[]),
    ];
    sendCsv(res, `lead-report-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(header, rows));
  } catch (e) {
    console.error('exportLeadReport:', e);
    res.status(500).json({ error: 'Failed to export lead report' });
  }
}

// ── Property report ─────────────────────────────────────────────────────────

export async function propertyReport(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await reportService.getPropertyReport());
  } catch (e) {
    console.error('propertyReport:', e);
    res.status(500).json({ error: 'Failed to load property report' });
  }
}

export async function exportPropertyReport(_req: Request, res: Response): Promise<void> {
  try {
    const r = await reportService.getPropertyReport();
    const header = ['key', 'count'];
    const rows: (string | number)[][] = [
      ['totalProperties', r.total],
      ['available', r.available],
      ['sold', r.sold],
      ...r.byStatus.map((s) => [s.status, s.count] as (string | number)[]),
    ];
    sendCsv(res, `property-report-${new Date().toISOString().slice(0, 10)}.csv`, rowsToCsv(header, rows));
  } catch (e) {
    console.error('exportPropertyReport:', e);
    res.status(500).json({ error: 'Failed to export property report' });
  }
}

// ── Client report ───────────────────────────────────────────────────────────

export async function clientReport(_req: Request, res: Response): Promise<void> {
  try {
    res.json(await reportService.getClientReport());
  } catch (e) {
    console.error('clientReport:', e);
    res.status(500).json({ error: 'Failed to load client report' });
  }
}

export async function exportClientReport(_req: Request, res: Response): Promise<void> {
  try {
    const r = await reportService.getClientReport();
    sendCsv(
      res,
      `client-report-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(
        ['key', 'count'],
        [
          ['totalClients', r.total],
          ['linked', r.linked],
          ['unlinked', r.unlinked],
        ],
      ),
    );
  } catch (e) {
    console.error('exportClientReport:', e);
    res.status(500).json({ error: 'Failed to export client report' });
  }
}

// ── Deal report ─────────────────────────────────────────────────────────────

export async function dealReport(req: Request, res: Response): Promise<void> {
  try {
    res.json(await reportService.getDealReport(parseRange(req)));
  } catch (e) {
    console.error('dealReport:', e);
    res.status(500).json({ error: 'Failed to load deal report' });
  }
}

export async function exportDealReport(req: Request, res: Response): Promise<void> {
  try {
    const r = await reportService.getDealReport(parseRange(req));
    const rows: (string | number)[][] = [
      ['summary', 'totalDeals', r.total, ''],
      ['summary', 'totalValue', r.totalValue, ''],
      ['summary', 'wonCount', r.wonCount, ''],
      ['summary', 'lostCount', r.lostCount, ''],
      ...r.byStatus.map((s) => ['byStatus', s.status, s.count, s.value] as (string | number)[]),
      ...r.revenueTrend.map((t) => ['revenueTrend', t.month, t.count, t.revenue] as (string | number)[]),
    ];
    sendCsv(
      res,
      `deal-report-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(['section', 'key', 'count', 'value'], rows),
    );
  } catch (e) {
    console.error('exportDealReport:', e);
    res.status(500).json({ error: 'Failed to export deal report' });
  }
}

// ── Agent report ────────────────────────────────────────────────────────────

export async function agentReport(_req: Request, res: Response): Promise<void> {
  try {
    res.json({ data: await reportService.getAgentReport() });
  } catch (e) {
    console.error('agentReport:', e);
    res.status(500).json({ error: 'Failed to load agent report' });
  }
}

export async function exportAgentReport(_req: Request, res: Response): Promise<void> {
  try {
    const rows = await reportService.getAgentReport();
    const header = [
      'agentName',
      'agentEmail',
      'dealsCount',
      'wonDealsCount',
      'leadsCount',
      'wonLeadsCount',
      'leadConversion%',
      'followUpDone',
      'followUpTotal',
      'followUpRate%',
    ];
    sendCsv(
      res,
      `agent-report-${new Date().toISOString().slice(0, 10)}.csv`,
      rowsToCsv(
        header,
        rows.map((r) => [
          r.agentName,
          r.agentEmail,
          r.dealsCount,
          r.wonDealsCount,
          r.leadsCount,
          r.wonLeadsCount,
          r.leadConversion,
          r.followUpDone,
          r.followUpTotal,
          r.followUpRate,
        ]),
      ),
    );
  } catch (e) {
    console.error('exportAgentReport:', e);
    res.status(500).json({ error: 'Failed to export agent report' });
  }
}

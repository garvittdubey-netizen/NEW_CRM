import { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Download,
  Printer,
  FileText,
  Building2,
  Users,
  TrendingUp,
  UserCog,
  Loader2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer } from '@/components/ui/chart';
import api from '@/services/api';
import {
  reportsApi,
  type LeadReport,
  type PropertyReport,
  type ClientReport,
  type DealReport,
  type AgentReportRow,
} from '@/services/reports';

/**
 * ADMIN-only Reports page.
 *
 * Five sections (Leads / Properties / Clients / Deals / Agents) each backed
 * by a dedicated `/api/reports/*` endpoint. Lead + Deal sections honour an
 * optional date-range filter; the rest are absolute snapshots.
 *
 * Exports:
 *   - Per-section "CSV" button hits `/api/reports/<section>/export` and
 *     streams a file via blob download.
 *   - Top-of-page "Print / PDF" button triggers `window.print()`. The
 *     `@media print` rules below hide the navbar + sidebar + filter card
 *     so the printed output is a clean report.
 */

const COLORS = ['#3b82f6', '#f59e0b', '#a855f7', '#fb923c', '#10b981', '#ef4444', '#64748b'];

function formatCurrency(v: number): string {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(2)} L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

function formatMonth(yyyymm: string): string {
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export default function ReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [leadReport, setLeadReport] = useState<LeadReport | null>(null);
  const [propertyReport, setPropertyReport] = useState<PropertyReport | null>(null);
  const [clientReport, setClientReport] = useState<ClientReport | null>(null);
  const [dealReport, setDealReport] = useState<DealReport | null>(null);
  const [agentRows, setAgentRows] = useState<AgentReportRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  // `printing` toggles every <ChartContainer> on this page into a
  // fixed-pixel-size render path so the SVG is fully laid out BEFORE
  // the browser takes its print snapshot. See chart.tsx for the full
  // rationale (Recharts + ResponsiveContainer + ResizeObserver async).
  const [printing, setPrinting] = useState(false);

  const buildDateParams = useCallback((): { from?: string; to?: string } => {
    const params: { from?: string; to?: string } = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return params;
  }, [from, to]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const p = buildDateParams();
    try {
      const [lr, pr, cr, dr, ar] = await Promise.all([
        reportsApi.leads(p),
        reportsApi.properties(),
        reportsApi.clients(),
        reportsApi.deals(p),
        reportsApi.agents(),
      ]);
      setLeadReport(lr);
      setPropertyReport(pr);
      setClientReport(cr);
      setDealReport(dr);
      setAgentRows(ar);
    } catch (e) {
      // Backend should not 500 here; fall back to nulls so the empty UI
      // surfaces instead of a hard crash.
      console.error('reports fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [buildDateParams]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const exportSection = async (
    section: 'leads' | 'properties' | 'clients' | 'deals' | 'agents',
  ) => {
    try {
      const usesRange = section === 'leads' || section === 'deals';
      const res = await api.get(`/reports/${section}/export`, {
        params: usesRange ? buildDateParams() : undefined,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${section}-report-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('export failed', section, e);
      window.alert('Failed to download CSV. Please try again.');
    }
  };

  // Listen for browser-initiated print (Ctrl+P / Cmd+P / OS menu print)
  // so charts also reflow correctly when the user bypasses our button.
  // `afterprint` always resets the flag.
  useEffect(() => {
    const before = () => setPrinting(true);
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const handlePrint = async () => {
    // 1. Flip into print-mode synchronously so React queues a re-render
    //    of every ChartContainer with explicit pixel width/height.
    setPrinting(true);
    // 2. Wait two animation frames + a small buffer so React commits the
    //    new tree and Recharts paints the static-sized SVGs before the
    //    print dialog snapshots the page.
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    // Belt-and-braces: nudge any lingering ResponsiveContainer listeners.
    window.dispatchEvent(new Event('resize'));
    await new Promise<void>((r) => setTimeout(r, 150));
    // 3. Open the print dialog. `afterprint` will reset `printing`.
    window.print();
  };

  const hasFilter = from || to;

  return (
    <div
      className="space-y-6 animate-fade-in print:space-y-3"
      data-testid="reports-page"
      id="reports-printable"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap print:hidden">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Tenant-wide insights across leads, properties, clients, deals and agents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            data-testid="reports-print-button"
          >
            <Printer size={14} className="mr-1.5" /> Print / PDF
          </Button>
        </div>
      </div>

      {/* Date range — applies to Lead + Deal reports */}
      <Card className="print:hidden" data-testid="reports-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <Label htmlFor="reports-from" className="text-xs">
                From
              </Label>
              <Input
                id="reports-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-[160px]"
                data-testid="reports-from-input"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="reports-to" className="text-xs">
                To
              </Label>
              <Input
                id="reports-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-[160px]"
                data-testid="reports-to-input"
              />
            </div>
            <Button
              size="sm"
              onClick={fetchAll}
              disabled={loading}
              data-testid="reports-apply-button"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
            </Button>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('');
                  setTo('');
                  setTimeout(fetchAll, 0);
                }}
                data-testid="reports-clear-button"
              >
                Clear
              </Button>
            )}
            <p className="ml-auto text-[11px] text-muted-foreground hidden sm:block">
              Date range applies to Lead + Deal reports.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Lead report */}
      <LeadReportSection
        report={leadReport}
        loading={loading}
        onExport={() => exportSection('leads')}
        printing={printing}
      />

      {/* Property report */}
      <PropertyReportSection
        report={propertyReport}
        loading={loading}
        onExport={() => exportSection('properties')}
        printing={printing}
      />

      {/* Client report */}
      <ClientReportSection
        report={clientReport}
        loading={loading}
        onExport={() => exportSection('clients')}
      />

      {/* Deal report */}
      <DealReportSection
        report={dealReport}
        loading={loading}
        onExport={() => exportSection('deals')}
        printing={printing}
      />

      {/* Agent report */}
      <AgentReportSection
        rows={agentRows}
        loading={loading}
        onExport={() => exportSection('agents')}
      />

      {/* Print CSS — collapses chrome to just the report contents.
         *
         * The bug we're solving: MainLayout uses `h-screen overflow-hidden`
         * and its <main> uses `overflow-y-auto`, so a naive `window.print()`
         * only captures what's visible in the viewport — everything below
         * the fold is clipped. We solve this in two passes:
         *
         *   1. Unclamp every ancestor of #reports-printable so the document
         *      height grows to fit ALL sections (height:auto + overflow:visible).
         *   2. Add semantic page-break rules so each section stays whole
         *      and the longer ones (Deals + Agents) start on a fresh page.
         *
         * `print-color-adjust: exact` keeps the chart colours and pill
         * accents intact — by default browsers strip backgrounds to save ink. */}
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }

          /* 1. Unclamp the entire layout chain so the printed canvas
                grows to the full document height. */
          html, body, #root,
          [data-testid="main-layout"],
          [data-testid="main-content"],
          [data-testid="main-layout"] > div {
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            display: block !important;
            background: white !important;
          }

          /* 2. Hide the chrome (navbar, sidebars, mobile drawer, filter card,
                print/csv buttons, anything marked print:hidden). */
          [data-testid="navbar"],
          [data-testid="sidebar"],
          [data-testid="mobile-sidebar"],
          [data-testid="mobile-menu-button"],
          [data-testid="reports-filters"],
          .print\\:hidden {
            display: none !important;
          }

          /* 3. Make sure the printable surface itself is unclamped too. */
          #reports-printable {
            padding: 0 !important;
            margin: 0 !important;
            overflow: visible !important;
            background: white !important;
            color: #000 !important;
          }

          /* 4. Page-break rules — keep each section together, and force
                Deals and Agents onto fresh pages because they have wide
                tables / a 12-month chart that don't tolerate being sliced. */
          #reports-printable section {
            break-inside: avoid;
            page-break-inside: avoid;
            margin-bottom: 16px;
          }
          [data-testid="report-deals-section"],
          [data-testid="report-agents-section"] {
            break-before: page;
            page-break-before: always;
          }
          /* Don't let card bodies clip — cards in the live UI may use
             overflow:hidden for rounded corners. */
          #reports-printable .overflow-hidden,
          #reports-printable .overflow-x-auto,
          #reports-printable .overflow-y-auto {
            overflow: visible !important;
          }
          /* Tables — keep header on each page; never break a row. */
          #reports-printable thead { display: table-header-group; }
          #reports-printable tr, #reports-printable img, #reports-printable svg {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* 5. Chart sizing — Recharts ResponsiveContainer measures its
                parent's width on render. In print mode the flex parents
                collapse, so we pin every chart container to a sane print
                width and force the inner SVG to fill it. */
          #reports-printable .recharts-responsive-container {
            width: 100% !important;
            min-width: 280px !important;
          }
          #reports-printable .recharts-wrapper,
          #reports-printable .recharts-surface {
            width: 100% !important;
          }

          /* 6. Honour our chart palette and stat-card backgrounds in print. */
          *, *::before, *::after {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* 7. Page title — render once at the very top so the PDF identifies
                what it is. The h1 already exists in markup but lives inside
                a print:hidden header row; we re-show it via this rule. */
          #reports-printable::before {
            content: "Real Estate CRM — Reports";
            display: block;
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
            padding-bottom: 6px;
            border-bottom: 1px solid #ddd;
          }
        }
      `}</style>
    </div>
  );
}

// ── Section components ─────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  onExport: () => void;
  testId: string;
}

function SectionHeader({ icon: Icon, title, subtitle, onExport, testId }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
          <Icon size={15} />
        </div>
        <div>
          <h2 className="text-lg font-semibold leading-none">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        className="print:hidden"
        data-testid={`${testId}-export-button`}
      >
        <Download size={13} className="mr-1.5" /> CSV
      </Button>
    </div>
  );
}

function StatCard({
  label,
  value,
  testId,
}: {
  label: string;
  value: string | number;
  testId?: string;
}) {
  return (
    <div className="rounded-md border p-3 bg-card" data-testid={testId}>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold mt-1 leading-tight">{value}</p>
    </div>
  );
}

function LeadReportSection({
  report,
  loading,
  onExport,
  printing,
}: {
  report: LeadReport | null;
  loading: boolean;
  onExport: () => void;
  printing: boolean;
}) {
  return (
    <section data-testid="report-leads-section">
      <SectionHeader
        icon={FileText}
        title="Lead Reports"
        subtitle="Total leads, distribution by source and status, and conversion."
        onExport={onExport}
        testId="report-leads"
      />
      <Card>
        <CardContent className="p-5 space-y-4">
          {loading || !report ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total leads" value={report.total} testId="report-leads-total" />
                <StatCard label="Won" value={report.won} testId="report-leads-won" />
                <StatCard
                  label="Conversion"
                  value={`${report.conversionRate}%`}
                  testId="report-leads-conversion"
                />
                <StatCard
                  label="Lost"
                  value={report.byStatus.find((s) => s.status === 'LOST')?.count ?? 0}
                  testId="report-leads-lost"
                />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
                <div data-testid="report-leads-by-status-chart">
                  <p className="text-sm font-medium mb-2">By status</p>
                  <ChartContainer height={220} printMode={printing}>
                    <BarChart data={report.byStatus} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="status" fontSize={11} width={92} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#3b82f6" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </div>
                <div data-testid="report-leads-by-source-chart">
                  <p className="text-sm font-medium mb-2">By source</p>
                  <ChartContainer height={220} printMode={printing}>
                    <BarChart data={report.bySource}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="source" fontSize={10} angle={-20} textAnchor="end" height={56} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#a855f7" radius={4} />
                    </BarChart>
                  </ChartContainer>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function PropertyReportSection({
  report,
  loading,
  onExport,
  printing,
}: {
  report: PropertyReport | null;
  loading: boolean;
  onExport: () => void;
  printing: boolean;
}) {
  return (
    <section data-testid="report-properties-section">
      <SectionHeader
        icon={Building2}
        title="Property Reports"
        subtitle="Inventory size and Available vs Sold split."
        onExport={onExport}
        testId="report-properties"
      />
      <Card>
        <CardContent className="p-5">
          {loading || !report ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-5">
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total" value={report.total} testId="report-properties-total" />
                <StatCard
                  label="Available"
                  value={report.available}
                  testId="report-properties-available"
                />
                <StatCard label="Sold" value={report.sold} testId="report-properties-sold" />
              </div>
              {/* Pie-chart cell — wrapped in its own <div> so the ChartContainer
                  isn't a direct grid child. When `printMode` is on, the
                  container sets an inline `width` on its wrapper; that
                  collided with the parent grid's `align-items: center` /
                  default `justify-items: stretch` resolution and the chart
                  snapshotted at zero height in the PDF. The wrapper <div>
                  takes the grid cell's stretch/centre behaviour, leaving
                  ChartContainer free to size itself exactly like the Lead
                  and Deal sections do (which were always wrapped). */}
              <div data-testid="report-properties-by-status-chart">
                <p className="text-sm font-medium mb-2">By status</p>
                <ChartContainer height={220} printMode={printing}>
                  <PieChart>
                    <Pie
                      data={report.byStatus.filter((b) => b.count > 0)}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={
                        ((p: { status?: string; count?: number }) =>
                          `${p.status}: ${p.count}`) as unknown as undefined
                      }
                    >
                      {report.byStatus.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ClientReportSection({
  report,
  loading,
  onExport,
}: {
  report: ClientReport | null;
  loading: boolean;
  onExport: () => void;
}) {
  return (
    <section data-testid="report-clients-section">
      <SectionHeader
        icon={Users}
        title="Client Reports"
        subtitle="Total clients and Linked vs Unlinked split."
        onExport={onExport}
        testId="report-clients"
      />
      <Card>
        <CardContent className="p-5">
          {loading || !report ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Total clients" value={report.total} testId="report-clients-total" />
              <StatCard label="Linked" value={report.linked} testId="report-clients-linked" />
              <StatCard
                label="Unlinked"
                value={report.unlinked}
                testId="report-clients-unlinked"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function DealReportSection({
  report,
  loading,
  onExport,
  printing,
}: {
  report: DealReport | null;
  loading: boolean;
  onExport: () => void;
  printing: boolean;
}) {
  return (
    <section data-testid="report-deals-section">
      <SectionHeader
        icon={TrendingUp}
        title="Deal Reports"
        subtitle="Total pipeline value, Won/Lost counts, and 12-month revenue trend."
        onExport={onExport}
        testId="report-deals"
      />
      <Card>
        <CardContent className="p-5 space-y-4">
          {loading || !report ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard
                  label="Total value"
                  value={formatCurrency(report.totalValue)}
                  testId="report-deals-total-value"
                />
                <StatCard
                  label="Total deals"
                  value={report.total}
                  testId="report-deals-total-count"
                />
                <StatCard label="Won" value={report.wonCount} testId="report-deals-won" />
                <StatCard label="Lost" value={report.lostCount} testId="report-deals-lost" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div data-testid="report-deals-by-status-table">
                  <p className="text-sm font-medium mb-2">Deals by status</p>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Status</th>
                          <th className="text-right px-3 py-2 font-medium">Count</th>
                          <th className="text-right px-3 py-2 font-medium">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.byStatus.map((s) => (
                          <tr
                            key={s.status}
                            className="border-t"
                            data-testid={`report-deals-status-row-${s.status}`}
                          >
                            <td className="px-3 py-2">{s.status}</td>
                            <td className="px-3 py-2 text-right">{s.count}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatCurrency(s.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div data-testid="report-deals-revenue-trend">
                  <p className="text-sm font-medium mb-2">Revenue trend (last 12 months, Won)</p>
                  {report.revenueTrend.length === 0 ? (
                    <div className="border rounded-md h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                      No revenue in the last 12 months
                    </div>
                  ) : (
                    <ChartContainer height={220} printMode={printing}>
                      <LineChart
                        data={report.revenueTrend.map((p) => ({
                          ...p,
                          label: formatMonth(p.month),
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" fontSize={11} />
                        <YAxis
                          fontSize={11}
                          tickFormatter={(v: number) =>
                            v >= 10000000 ? `${v / 10000000}Cr` : v >= 100000 ? `${v / 100000}L` : `${v}`
                          }
                        />
                        <Tooltip
                          formatter={
                            ((v: number) => formatCurrency(Number(v))) as unknown as undefined
                          }
                          labelFormatter={(l) => `Month: ${l}`}
                        />
                        <Legend />
                        <Line
                          type="monotone"
                          dataKey="revenue"
                          name="Revenue"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ChartContainer>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AgentReportSection({
  rows,
  loading,
  onExport,
}: {
  rows: AgentReportRow[] | null;
  loading: boolean;
  onExport: () => void;
}) {
  return (
    <section data-testid="report-agents-section">
      <SectionHeader
        icon={UserCog}
        title="Agent Reports"
        subtitle="Deals per agent, lead conversion rate, and follow-up completion."
        onExport={onExport}
        testId="report-agents"
      />
      <Card>
        <CardContent className="p-0">
          {loading || !rows ? (
            <div className="p-5">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center px-5">
              <p className="text-sm text-muted-foreground">No agents found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto" data-testid="report-agents-table">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Agent</th>
                    <th className="text-right px-3 py-2 font-medium">Deals</th>
                    <th className="text-right px-3 py-2 font-medium">Won deals</th>
                    <th className="text-right px-3 py-2 font-medium">Leads</th>
                    <th className="text-right px-3 py-2 font-medium">Lead conv.</th>
                    <th className="text-right px-3 py-2 font-medium">Follow-ups</th>
                    <th className="text-right px-3 py-2 font-medium">Follow-up rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.agentId}
                      className="border-t"
                      data-testid={`report-agents-row-${r.agentId}`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.agentName}</div>
                        <div className="text-[11px] text-muted-foreground">{r.agentEmail}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.dealsCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.wonDealsCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.leadsCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.leadConversion}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.followUpDone}/{r.followUpTotal}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.followUpRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

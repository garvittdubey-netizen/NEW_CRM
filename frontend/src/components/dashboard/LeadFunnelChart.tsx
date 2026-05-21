import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  CHART_COLORS,
  tooltipStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from '@/components/ui/chart';
import type { LeadStatusBucket } from '@/types';

interface Props {
  data: LeadStatusBucket[] | null;
  loading: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NEGOTIATING: 'Negotiating',
  WON: 'Won',
  LOST: 'Lost',
};

/**
 * Lead funnel — horizontal bar chart over the qualifying pipeline statuses
 * (LOST is excluded so it doesn't visually distort the funnel). Bars are
 * sorted from widest to narrowest, mirroring how the pipeline actually
 * narrows from NEW → WON.
 */
export function LeadFunnelChart({ data, loading }: Props) {
  const funnelOrder = ['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON'];

  const chartData = (data ?? [])
    .filter((d) => funnelOrder.includes(d.status))
    .sort((a, b) => funnelOrder.indexOf(a.status) - funnelOrder.indexOf(b.status))
    .map((d) => ({
      name: STATUS_LABEL[d.status] ?? d.status,
      count: d.count,
      status: d.status,
    }));

  const hasData = chartData.some((d) => d.count > 0);

  return (
    <Card data-testid="lead-funnel-chart-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Lead Funnel</CardTitle>
        <p className="text-xs text-muted-foreground">New → Contacted → Qualified → Negotiating → Won</p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <div
            className="h-[260px] flex items-center justify-center text-sm text-muted-foreground"
            data-testid="lead-funnel-empty"
          >
            No leads in this range yet.
          </div>
        ) : (
          <ChartContainer data-testid="lead-funnel-chart">
            <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                cursor={{ fill: 'hsl(var(--accent))', opacity: 0.3 }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={entry.status} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

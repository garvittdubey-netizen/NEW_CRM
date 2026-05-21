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
import type { LeadStatusBucket, LeadSourceBucket } from '@/types';

interface Props {
  data: (LeadStatusBucket[] | LeadSourceBucket[]) | null;
  loading: boolean;
  /** Used by the chart title; controls whether we render "status" or "source" data. */
  variant: 'status' | 'source';
}

const LABELS: Record<string, string> = {
  // statuses
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  NEGOTIATING: 'Negotiating',
  WON: 'Won',
  LOST: 'Lost',
  // sources
  FACEBOOK: 'Facebook',
  WHATSAPP: 'WhatsApp',
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  MANUAL: 'Manual',
  PROPERTY_PORTAL: 'Property Portal',
  OTHER: 'Other',
};

/**
 * Vertical bar chart used twice on the dashboard:
 *   - `variant="status"`  → Leads by status (all 6 statuses)
 *   - `variant="source"`  → Leads by source
 *
 * Both responses share the same `{ key, count }` shape so we normalise into
 * a single `{ name, count }` array before rendering.
 */
export function LeadsBreakdownChart({ data, loading, variant }: Props) {
  const title = variant === 'status' ? 'Leads by Status' : 'Leads by Source';
  const testIdRoot = variant === 'status' ? 'leads-by-status' : 'leads-by-source';

  const chartData = (data ?? []).map((row) => {
    const key = 'status' in row ? row.status : row.source;
    return { name: LABELS[key] ?? key, key, count: row.count };
  });

  const hasData = chartData.some((d) => d.count > 0);

  return (
    <Card data-testid={`${testIdRoot}-card`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <div
            className="h-[260px] flex items-center justify-center text-sm text-muted-foreground"
            data-testid={`${testIdRoot}-empty`}
          >
            No data in this range yet.
          </div>
        ) : (
          <ChartContainer data-testid={`${testIdRoot}-chart`}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                interval={0}
                angle={variant === 'source' ? -20 : 0}
                textAnchor={variant === 'source' ? 'end' : 'middle'}
                height={variant === 'source' ? 60 : 30}
              />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                cursor={{ fill: 'hsl(var(--accent))', opacity: 0.3 }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={entry.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

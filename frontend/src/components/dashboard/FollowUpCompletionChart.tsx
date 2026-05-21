import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChartContainer,
  CHART_COLORS,
  tooltipStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from '@/components/ui/chart';
import type { FollowUpAnalytics } from '@/types';

interface Props {
  data: FollowUpAnalytics | null;
  loading: boolean;
}

const LABELS: Record<string, string> = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  MISSED: 'Missed',
};

// Fixed colors per status so completed=green / missed=red stays semantic.
const STATUS_FILL: Record<string, string> = {
  COMPLETED: '#10b981',
  PENDING: '#f59e0b',
  MISSED: '#ef4444',
};

/**
 * Donut chart of follow-up status with the completion rate highlighted in
 * the center. Empty state shows "—" rather than 0% so users don't think
 * the API failed.
 */
export function FollowUpCompletionChart({ data, loading }: Props) {
  const chartData = (data?.byStatus ?? []).map((row) => ({
    name: LABELS[row.status] ?? row.status,
    value: row.count,
    status: row.status,
  }));

  const hasData = (data?.total ?? 0) > 0;

  return (
    <Card data-testid="followup-completion-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Follow-up Completion</CardTitle>
        <p className="text-xs text-muted-foreground">
          {hasData
            ? `${data?.completed ?? 0} of ${data?.total ?? 0} completed`
            : 'No follow-ups in this range yet'}
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : !hasData ? (
          <div
            className="h-[260px] flex items-center justify-center text-sm text-muted-foreground"
            data-testid="followup-completion-empty"
          >
            No follow-ups recorded yet.
          </div>
        ) : (
          <div className="relative" data-testid="followup-completion-chart">
            <ChartContainer height={260}>
              <PieChart>
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                />
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  formatter={(value) => (
                    <span style={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}>{value}</span>
                  )}
                />
                <Pie
                  data={chartData}
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {chartData.map((entry, i) => (
                    <Cell
                      key={entry.status}
                      fill={STATUS_FILL[entry.status] ?? CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            {/* Center label */}
            <div
              className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
              style={{ top: '-20px' }}
              data-testid="followup-completion-rate"
            >
              <div className="text-2xl font-heading font-bold">
                {data?.completionRate ?? 0}%
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Completion
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { Trophy, UserCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { AgentPerformanceRow } from '@/types';

interface Props {
  rows: AgentPerformanceRow[] | null;
  loading: boolean;
  /** AGENT role → renders a single self-performance card with a different heading. */
  selfView: boolean;
}

interface MetricChipProps {
  label: string;
  value: number;
  testId: string;
  accent?: 'default' | 'success' | 'danger';
}

function MetricChip({ label, value, testId, accent = 'default' }: MetricChipProps) {
  const accentClass = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-red-600 dark:text-red-400',
  }[accent];

  return (
    <div className="flex flex-col" data-testid={testId}>
      <span className={`text-lg font-heading font-semibold ${accentClass}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Per-agent KPI cards. Layout adapts to caller's role:
 *   - ADMIN   → grid of every agent (team comparison)
 *   - AGENT   → single full-width card with the caller's own metrics
 */
export function AgentPerformanceCards({ rows, loading, selfView }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[140px] w-full" />
        ))}
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card data-testid="agent-performance-empty">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          No agent data available for this range.
        </CardContent>
      </Card>
    );
  }

  return (
    <div
      className={
        selfView
          ? 'grid grid-cols-1 gap-4'
          : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
      }
      data-testid="agent-performance-grid"
    >
      {rows.map((row) => (
        <Card
          key={row.agentId}
          className="hover:shadow-md transition-shadow duration-200"
          data-testid={`agent-card-${row.agentId}`}
        >
          <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="rounded-full p-1.5 bg-navy-50 dark:bg-navy-700/30 shrink-0">
                <UserCircle2 size={16} className="text-navy-500 dark:text-navy-300" />
              </div>
              <CardTitle className="text-sm truncate" title={row.agentName}>
                {selfView ? 'Your Performance' : row.agentName}
              </CardTitle>
            </div>
            <Badge variant="outline" className="shrink-0" data-testid={`agent-conversion-${row.agentId}`}>
              <Trophy size={11} className="mr-1" />
              {row.conversionRate}%
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              <MetricChip
                label="Assigned"
                value={row.assignedLeads}
                testId={`agent-assigned-${row.agentId}`}
              />
              <MetricChip
                label="Contacted"
                value={row.contactedLeads}
                testId={`agent-contacted-${row.agentId}`}
              />
              <MetricChip
                label="Won"
                value={row.wonLeads}
                testId={`agent-won-${row.agentId}`}
                accent="success"
              />
              <MetricChip
                label="Lost"
                value={row.lostLeads}
                testId={`agent-lost-${row.agentId}`}
                accent="danger"
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

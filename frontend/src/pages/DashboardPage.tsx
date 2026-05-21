import { useState, useEffect, useCallback } from 'react';
import { CalendarCheck2, CalendarClock, AlertOctagon, Users, TrendingUp, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { UpcomingFollowUpsWidget } from '@/components/followups/UpcomingFollowUpsWidget';
import { ActivityWidget } from '@/components/activities/ActivityWidget';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { LeadFunnelChart } from '@/components/dashboard/LeadFunnelChart';
import { LeadsBreakdownChart } from '@/components/dashboard/LeadsBreakdownChart';
import { FollowUpCompletionChart } from '@/components/dashboard/FollowUpCompletionChart';
import { AgentPerformanceCards } from '@/components/dashboard/AgentPerformanceCards';
import { CommunicationStatsCards } from '@/components/dashboard/CommunicationStatsCards';
import { followUpsApi } from '@/services/followups';
import { analyticsApi, rangeToParams } from '@/services/analytics';
import api, { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type {
  FollowUpDashboardStats,
  AnalyticsRange,
  AnalyticsOverview,
  LeadStatusBucket,
  LeadSourceBucket,
  FollowUpAnalytics,
  AgentPerformanceRow,
  CommunicationStats,
} from '@/types';
import { isAdminLevel } from '@/lib/roles';

interface StatCardConfig {
  testIdKey: string;
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  description: string;
  loading: boolean;
  value: string;
}

function StatCard({ card }: { card: StatCardConfig }) {
  const Icon = card.icon;
  return (
    <Card
      className="hover:shadow-md transition-shadow duration-200"
      data-testid={`stat-card-${card.testIdKey}`}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
        <div className={`rounded-md p-2 ${card.iconBg}`}>
          <Icon size={16} className={card.iconColor} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-heading font-bold">
          {card.loading ? <Skeleton className="h-7 w-12" /> : card.value}
        </div>
        <span className="text-xs text-muted-foreground mt-1 block">{card.description}</span>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);

  // Existing follow-up stats (legacy widget cards above the new analytics)
  const [followUpStats, setFollowUpStats] = useState<FollowUpDashboardStats | null>(null);
  const [followUpLoading, setFollowUpLoading] = useState(true);

  // Analytics filter state
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Analytics data
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [byStatus, setByStatus] = useState<LeadStatusBucket[] | null>(null);
  const [bySource, setBySource] = useState<LeadSourceBucket[] | null>(null);
  const [followUpAnalytics, setFollowUpAnalytics] = useState<FollowUpAnalytics | null>(null);
  const [agentRows, setAgentRows] = useState<AgentPerformanceRow[] | null>(null);
  const [commStats, setCommStats] = useState<CommunicationStats | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Initial: pull the legacy follow-up dashboard stats once on mount.
  useEffect(() => {
    followUpsApi
      .stats()
      .then(setFollowUpStats)
      .catch(() => setFollowUpStats(null))
      .finally(() => setFollowUpLoading(false));
  }, []);

  // Re-fetch every analytics endpoint whenever the date range changes.
  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    const params = rangeToParams(range, from, to);
    try {
      const [ov, bs, src, fu, ag, cs] = await Promise.all([
        analyticsApi.overview(params),
        analyticsApi.leadsByStatus(params),
        analyticsApi.leadsBySource(params),
        analyticsApi.followUps(params),
        analyticsApi.agents(params),
        analyticsApi.communications(params),
      ]);
      setOverview(ov);
      setByStatus(bs.data);
      setBySource(src.data);
      setFollowUpAnalytics(fu);
      setAgentRows(ag.data);
      setCommStats(cs);
    } catch (e) {
      console.error('analytics fetch failed', e);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [range, from, to]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleRangeChange = (nextRange: AnalyticsRange, nextFrom: string, nextTo: string) => {
    setRange(nextRange);
    setFrom(nextFrom);
    setTo(nextTo);
  };

  /**
   * Streams a single analytics section as a CSV download. The endpoint
   * mirrors the JSON one (same `range`/`from`/`to` query params + RBAC).
   */
  const downloadAnalyticsCsv = async (section: string, label: string) => {
    try {
      const params = rangeToParams(range, from, to);
      const res = await api.get(`/analytics/export/${section}`, {
        params,
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${label}-${range}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(extractApiError(e, `Failed to export ${label}`));
    }
  };

  const topStatCards: StatCardConfig[] = [
    {
      testIdKey: 'todays-followups',
      title: "Today's Follow-ups",
      icon: CalendarCheck2,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-950/50',
      description: 'Scheduled for today',
      loading: followUpLoading,
      value: followUpStats ? String(followUpStats.today) : '—',
    },
    {
      testIdKey: 'overdue-followups',
      title: 'Overdue',
      icon: AlertOctagon,
      iconColor: 'text-red-600 dark:text-red-400',
      iconBg: 'bg-red-50 dark:bg-red-950/50',
      description: 'Pending past their date',
      loading: followUpLoading,
      value: followUpStats ? String(followUpStats.overdue) : '—',
    },
    {
      testIdKey: 'upcoming-followups',
      title: 'Upcoming',
      icon: CalendarClock,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
      description: 'Pending and on schedule',
      loading: followUpLoading,
      value: followUpStats ? String(followUpStats.upcoming) : '—',
    },
    {
      testIdKey: 'leads',
      title: 'Total Leads',
      icon: Users,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-50 dark:bg-purple-950/50',
      description: 'In selected range',
      loading: analyticsLoading,
      value: overview ? String(overview.totalLeads) : '—',
    },
  ];

  // Conversion rate card (new) — gets its own row since it spans the analytics overview.
  const conversionCard: StatCardConfig = {
    testIdKey: 'conversion-rate',
    title: 'Conversion Rate',
    icon: TrendingUp,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    description: overview ? `${overview.wonLeads} won / ${overview.totalLeads} leads` : 'Won ÷ total leads',
    loading: analyticsLoading,
    value: overview ? `${overview.conversionRate}%` : '—',
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="dashboard-page">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">
            Good morning, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Here's an overview of your real estate portfolio
          </p>
        </div>
        <Badge variant="outline" className="hidden sm:flex" data-testid="user-role-badge">
          {user?.role}
        </Badge>
      </div>

      {/* Stats Grid — legacy follow-up cards + total leads */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="stats-grid">
        {topStatCards.map((card) => (
          <StatCard key={card.testIdKey} card={card} />
        ))}
      </div>

      {/* Analytics filter + section header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
        <div>
          <h2 className="text-lg font-heading font-semibold" data-testid="analytics-heading">
            Analytics & Reporting
          </h2>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? 'Tenant-wide metrics across every agent.' : 'Your personal performance metrics.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeFilter range={range} from={from} to={to} onChange={handleRangeChange} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8" data-testid="export-analytics-button">
                <Download size={13} className="mr-1.5" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => downloadAnalyticsCsv('overview', 'overview')}
                data-testid="export-overview-csv"
              >
                <Download size={13} />
                Overview
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadAnalyticsCsv('leads-by-status', 'leads-by-status')}
                data-testid="export-leads-by-status-csv"
              >
                <Download size={13} />
                Leads by status
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadAnalyticsCsv('leads-by-source', 'leads-by-source')}
                data-testid="export-leads-by-source-csv"
              >
                <Download size={13} />
                Leads by source
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadAnalyticsCsv('followups', 'followups')}
                data-testid="export-followups-csv"
              >
                <Download size={13} />
                Follow-ups
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadAnalyticsCsv('agents', 'agents')}
                data-testid="export-agents-csv"
              >
                <Download size={13} />
                Agent performance
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => downloadAnalyticsCsv('communications', 'communications')}
                data-testid="export-communications-csv"
              >
                <Download size={13} />
                Communications
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Conversion + Communication stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4" data-testid="analytics-stat-row">
        <StatCard card={conversionCard} />
        <div className="lg:col-span-4">
          <CommunicationStatsCards stats={commStats} loading={analyticsLoading} />
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadFunnelChart data={byStatus} loading={analyticsLoading} />
        <LeadsBreakdownChart data={byStatus} loading={analyticsLoading} variant="status" />
        <LeadsBreakdownChart data={bySource} loading={analyticsLoading} variant="source" />
        <FollowUpCompletionChart data={followUpAnalytics} loading={analyticsLoading} />
      </div>

      {/* Agent performance */}
      <div className="space-y-3" data-testid="agent-performance-section">
        <h2 className="text-lg font-heading font-semibold">
          {isAdmin ? 'Agent Performance' : 'Your Performance'}
        </h2>
        <AgentPerformanceCards rows={agentRows} loading={analyticsLoading} selfView={!isAdmin} />
      </div>

      {/* Original content grid (preserve existing widgets) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <UpcomingFollowUpsWidget />
        </div>
        <ActivityWidget />
      </div>
    </div>
  );
}

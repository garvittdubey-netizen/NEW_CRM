import { useCallback, useEffect, useState } from 'react';
import { Activity as ActivityIcon, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ActivityList } from '@/components/activities/ActivityList';
import { activitiesApi } from '@/services/activities';
import type { Activity } from '@/types';

const ACTION_FILTERS = [
  { value: 'ALL', label: 'All actions' },
  { value: 'WHATSAPP_SENT', label: 'WhatsApp · sent' },
  { value: 'WHATSAPP_RECEIVED', label: 'WhatsApp · received' },
  { value: 'CALL_LOGGED', label: 'Calls logged' },
];

/**
 * Real-time team activity feed. Polls every 10 seconds; managers see all
 * activities, agents see what they did + activities on their leads (RBAC
 * enforced server-side).
 */
export default function ActivitiesPage() {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('ALL');

  const fetchData = useCallback(
    (silent = false) => {
      if (!silent) setLoading(true);
      activitiesApi
        .list({
          limit: 100,
          ...(actionFilter !== 'ALL' ? { action: actionFilter } : {}),
        })
        .then((d) => setItems(d.activities))
        .catch(() => setItems([]))
        .finally(() => {
          if (!silent) setLoading(false);
        });
    },
    [actionFilter],
  );

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(true), 10_000);
    return () => clearInterval(id);
  }, [fetchData]);

  return (
    <div className="space-y-5 animate-fade-in" data-testid="activities-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight flex items-center gap-2">
            <ActivityIcon size={22} className="text-primary" />
            Team Activity
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} action{items.length !== 1 ? 's' : ''} · live (polls every 10s)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[200px]" data-testid="activity-action-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="outline"
            onClick={() => fetchData()}
            data-testid="activity-refresh"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center" data-testid="activity-empty">
              No activity matches the current filter yet.
            </p>
          ) : (
            <ActivityList activities={items} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

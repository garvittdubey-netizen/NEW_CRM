import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity as ActivityIcon, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityList } from './ActivityList';
import { activitiesApi } from '@/services/activities';
import type { Activity } from '@/types';

/**
 * Compact "Team Activity" widget for the dashboard. Polls every 10s.
 */
export function ActivityWidget() {
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = (silent = false) => {
    if (!silent) setLoading(true);
    activitiesApi
      .list({ limit: 6 })
      .then((d) => setItems(d.activities))
      .catch(() => setItems([]))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(true), 10_000);
    return () => clearInterval(id);
  }, []);

  return (
    <Card data-testid="activity-widget">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ActivityIcon size={15} className="text-primary" />
          Team Activity
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link to="/activity" data-testid="view-all-activity">
            View all <ArrowRight size={12} className="ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No recent activity.</p>
        ) : (
          <ActivityList activities={items} compact />
        )}
      </CardContent>
    </Card>
  );
}

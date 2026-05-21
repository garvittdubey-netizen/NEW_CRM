import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ReminderBadge, classifyFollowUp } from '@/components/followups/ReminderBadge';
import { followUpsApi } from '@/services/followups';
import type { FollowUp } from '@/types';

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Compact dashboard widget that lists the next ~5 pending follow-ups.
 * Falls back to a friendly empty state when none are scheduled.
 */
export function UpcomingFollowUpsWidget() {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    followUpsApi
      .list({ window: 'upcoming', limit: 5 })
      .then((r) => setItems(r.followUps))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card data-testid="upcoming-followups-widget">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock size={15} className="text-primary" />
          Upcoming Follow-ups
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
          <Link to="/followups" data-testid="view-all-followups">
            View all <ArrowRight size={12} className="ml-1" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No upcoming follow-ups
          </p>
        ) : (
          <ul className="space-y-2" data-testid="upcoming-list">
            {items.map((fu) => {
              const effective = classifyFollowUp(fu.followUpDate, fu.status);
              return (
                <li key={fu.id} className="flex items-center gap-3 text-sm">
                  <ReminderBadge status={effective} />
                  <Link
                    to={`/leads/${fu.leadId}`}
                    className="font-medium truncate hover:text-primary flex-1"
                  >
                    {fu.lead.fullName}
                  </Link>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {fmtTime(fu.followUpDate)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

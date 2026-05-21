import {
  CircleDot,
  TrendingUp,
  DollarSign,
  UserPlus,
  FileText,
  CheckCircle2,
  Activity as ActivityIcon,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DealTimelineItem } from '@/types';

/** Per-event icon + chip colour. Falls back to a neutral pill for unknown
 *  event types so a future event added on the backend never breaks the UI. */
const EVENT_META: Record<string, { icon: React.ElementType; className: string; label: string }> = {
  CREATED: {
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    label: 'Created',
  },
  STATUS_CHANGED: {
    icon: TrendingUp,
    className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
    label: 'Status changed',
  },
  AMOUNT_UPDATED: {
    icon: DollarSign,
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    label: 'Amount updated',
  },
  AGENT_REASSIGNED: {
    icon: UserPlus,
    className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    label: 'Agent reassigned',
  },
  NOTES_UPDATED: {
    icon: FileText,
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
    label: 'Notes updated',
  },
};

const FALLBACK_META = {
  icon: ActivityIcon,
  className: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  label: 'Event',
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface Props {
  items: DealTimelineItem[];
  loading: boolean;
}

/**
 * Read-only Deal activity timeline. Renders the auto-logged lifecycle events
 * (CREATED / STATUS_CHANGED / AMOUNT_UPDATED / AGENT_REASSIGNED /
 * NOTES_UPDATED) in newest-first order with actor attribution.
 */
export function DealTimeline({ items, loading }: Props) {
  return (
    <Card data-testid="deal-timeline">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Activity timeline</h3>
          <span className="text-xs text-muted-foreground" data-testid="deal-timeline-count">
            {loading ? '…' : `${items.length} ${items.length === 1 ? 'event' : 'events'}`}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center" data-testid="deal-timeline-empty">
            <CircleDot
              size={22}
              className="mx-auto text-muted-foreground/60 mb-2"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Events will appear here once the deal is edited.
            </p>
          </div>
        ) : (
          <ol
            className="relative border-l border-border ml-2 space-y-4"
            data-testid="deal-timeline-list"
          >
            {items.map((item) => {
              const meta = EVENT_META[item.eventType] ?? FALLBACK_META;
              const Icon = meta.icon;
              return (
                <li
                  key={item.id}
                  className="pl-6 relative"
                  data-testid={`deal-timeline-item-${item.id}`}
                >
                  <span
                    className={`absolute -left-[13px] top-0 h-6 w-6 rounded-full grid place-items-center ring-4 ring-background ${meta.className}`}
                    aria-hidden="true"
                  >
                    <Icon size={12} />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-tight">
                      <span className="font-medium">{meta.label}</span>
                      {item.notes && (
                        <span className="text-muted-foreground"> · {item.notes}</span>
                      )}
                      {item.actor && (
                        <span className="text-muted-foreground"> · by {item.actor.name}</span>
                      )}
                    </p>
                    <time
                      className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0"
                      dateTime={item.createdAt}
                    >
                      {formatWhen(item.createdAt)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

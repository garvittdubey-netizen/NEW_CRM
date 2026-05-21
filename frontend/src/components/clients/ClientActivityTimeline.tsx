import {
  CircleUserRound,
  MessageSquare,
  PhoneCall,
  CalendarClock,
  Activity as ActivityIcon,
  Link2,
  Unlink,
  UserPlus,
  UserMinus,
  PencilLine,
  FileText,
  Wallet,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ClientTimelineItem, ClientTimelineSource } from '@/types';

const SOURCE_ICON: Record<ClientTimelineSource, React.ElementType> = {
  CLIENT: CircleUserRound,
  COMMUNICATION: MessageSquare,
  FOLLOWUP: CalendarClock,
  ACTIVITY: ActivityIcon,
  DEAL: Wallet,
};

const SOURCE_CLASS: Record<ClientTimelineSource, string> = {
  CLIENT: 'bg-primary/10 text-primary',
  COMMUNICATION: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  FOLLOWUP: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  ACTIVITY: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
  DEAL: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

/** Picks a specific icon for known CLIENT-source actions so the timeline reads naturally. */
function iconFor(item: ClientTimelineItem): React.ElementType {
  if (item.source === 'ACTIVITY' && item.action === 'CLIENT_REVERTED') return RotateCcw;
  if (item.source !== 'CLIENT') return SOURCE_ICON[item.source];
  switch (item.action) {
    case 'CREATED':
      return CircleUserRound;
    case 'UPDATED':
      return PencilLine;
    case 'LINKED_LEAD':
      return Link2;
    case 'UNLINKED_LEAD':
      return Unlink;
    case 'AGENT_ASSIGNED':
      return UserPlus;
    case 'AGENT_UNASSIGNED':
      return UserMinus;
    case 'NOTES_UPDATED':
      return FileText;
    case 'CLIENT_REVERTED':
      return RotateCcw;
    default:
      return CircleUserRound;
  }
}

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
  items: ClientTimelineItem[];
  loading: boolean;
  hasLinkedLead: boolean;
}

/**
 * Merged read-only timeline (Phase 9 spec choice "b"):
 *   - native ClientActivity rows
 *   - PLUS, when the client has a linked lead: communications, follow-ups,
 *     and lead Activity feed entries.
 *
 * Sorted newest-first. Server caps to 200 entries.
 */
export function ClientActivityTimeline({ items, loading, hasLinkedLead }: Props) {
  return (
    <Card data-testid="client-activity-timeline">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Activity timeline</h3>
          <span className="text-xs text-muted-foreground" data-testid="client-timeline-count">
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
          <div className="py-8 text-center" data-testid="client-timeline-empty">
            <p className="text-sm text-muted-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              {hasLinkedLead
                ? 'Lead activity will appear here once it happens.'
                : 'Link a lead or update this client to start the trail.'}
            </p>
          </div>
        ) : (
          <ol
            className="relative border-l border-border ml-2 space-y-4"
            data-testid="client-timeline-list"
          >
            {items.map((item) => {
              const Icon = iconFor(item);
              return (
                <li
                  key={item.id}
                  className="pl-6 relative"
                  data-testid={`client-timeline-item-${item.id}`}
                >
                  <span
                    className={`absolute -left-[13px] top-0 h-6 w-6 rounded-full grid place-items-center ring-4 ring-background ${
                      SOURCE_CLASS[item.source]
                    }`}
                    aria-hidden="true"
                  >
                    <Icon size={12} />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-tight">
                      {item.description}
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
                  <p className="text-[11px] text-muted-foreground mt-0.5 capitalize">
                    {item.source.toLowerCase()}
                    {item.source === 'COMMUNICATION' && item.action === 'CALL' && ' · call'}
                    {item.source === 'COMMUNICATION' && item.action === 'WHATSAPP' && ' · whatsapp'}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/** Tiny helper so a consumer can re-export the icon component if they need it. */
export { PhoneCall };

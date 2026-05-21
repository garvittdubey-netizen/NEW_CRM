import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarClock,
  TrendingUp,
  UserPlus,
  CheckCheck,
  Activity as ActivityIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import {
  notificationsApi,
  getLastRead,
  setLastRead,
  type NotificationItem,
  type NotificationKind,
} from '@/services/notifications';

/**
 * Lightweight in-app notifications panel anchored to the navbar bell.
 *
 * - No WebSocket, no background jobs — we just `GET /api/notifications`
 *   on mount + every 60s while mounted.
 * - "Unread" is a pure frontend concept: each user has a `notif:lastRead`
 *   ISO timestamp in localStorage; any item with `createdAt` strictly newer
 *   than that timestamp counts as unread.
 * - "Mark all as read" stamps `lastRead` with the timestamp of the newest
 *   item visible right now — newer items that arrive later will appear as
 *   unread again on the next poll, which is the behaviour the user expects.
 */

const KIND_ICON: Record<NotificationKind, React.ElementType> = {
  FOLLOWUP: CalendarClock,
  DEAL_ACTIVITY: TrendingUp,
  LEAD_ASSIGNMENT: UserPlus,
};

const KIND_CLASS: Record<NotificationKind, string> = {
  FOLLOWUP: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  DEAL_ACTIVITY: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  LEAD_ASSIGNMENT: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
};

function relTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export default function NotificationPanel() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastReadIso, setLastReadIso] = useState<string | null>(
    user ? getLastRead(user.id) : null,
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await notificationsApi.list());
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchItems();
    const t = setInterval(fetchItems, 60_000); // 60s poll while mounted
    return () => clearInterval(t);
  }, [fetchItems, user]);

  // Recompute unread state from `lastReadIso` so swapping users on the same
  // tab doesn't carry over the previous user's marker.
  useEffect(() => {
    if (user) setLastReadIso(getLastRead(user.id));
  }, [user]);

  const unreadCount = useMemo(() => {
    if (!lastReadIso) return items.length; // everything new on first visit
    return items.filter((i) => i.createdAt > lastReadIso).length;
  }, [items, lastReadIso]);

  const handleItemClick = (item: NotificationItem) => {
    setOpen(false);
    navigate(item.href);
  };

  const markAllRead = () => {
    if (!user || items.length === 0) return;
    // Stamp lastRead with the newest visible createdAt so anything older is
    // immediately considered read, while newer items arriving later still
    // surface as unread.
    const newest = items[0].createdAt;
    setLastRead(user.id, newest);
    setLastReadIso(newest);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-muted-foreground hover:text-foreground"
          data-testid="notifications-button"
          aria-label={`Notifications (${unreadCount} unread)`}
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center leading-none"
              data-testid="notifications-unread-badge"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-[360px] p-0"
        data-testid="notifications-panel"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-[11px] text-muted-foreground" data-testid="notifications-summary">
              {loading
                ? 'Loading…'
                : items.length === 0
                  ? 'You are all caught up'
                  : `${items.length} recent · ${unreadCount} unread`}
            </p>
          </div>
          {items.length > 0 && unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={markAllRead}
              data-testid="notifications-mark-all-read"
            >
              <CheckCheck size={12} className="mr-1" /> Mark read
            </Button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div
              className="px-4 py-10 text-center"
              data-testid="notifications-empty"
            >
              <div className="h-10 w-10 rounded-full bg-muted mx-auto grid place-items-center mb-2">
                <ActivityIcon size={16} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Nothing new yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                You will see follow-ups, deal updates and lead assignments here.
              </p>
            </div>
          ) : (
            <ul className="divide-y" data-testid="notifications-list">
              {items.map((item) => {
                const isUnread = !lastReadIso || item.createdAt > lastReadIso;
                const Icon = KIND_ICON[item.kind];
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className={`w-full text-left flex items-start gap-3 px-3 py-2.5 hover:bg-accent transition-colors ${
                        isUnread ? 'bg-primary/5' : ''
                      }`}
                      data-testid={`notification-item-${item.id}`}
                    >
                      <span
                        className={`mt-0.5 h-7 w-7 shrink-0 rounded-full grid place-items-center ${KIND_CLASS[item.kind]}`}
                        aria-hidden="true"
                      >
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight truncate">
                            {item.title}
                          </p>
                          {isUnread && (
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0"
                              aria-label="Unread"
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {item.description}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {relTime(item.createdAt)}
                          {item.actor && <span> · by {item.actor.name}</span>}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

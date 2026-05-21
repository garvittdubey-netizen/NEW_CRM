import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquareText, Search, Inbox, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChatPanel } from '@/components/communications/ChatPanel';
import { NewConversationModal } from '@/components/communications/NewConversationModal';
import { communicationsApi } from '@/services/communications';
import { leadsApi } from '@/services/leads';
import { useAuth } from '@/hooks/useAuth';
import type { ConversationSummary } from '@/types';

const LAST_READ_KEY = (userId: string, leadId: string) =>
  `comm:lastRead:${userId}:${leadId}`;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/**
 * Compute whether a conversation has an unread inbound message by comparing
 * the lastMessage timestamp against a per-user, per-lead "last read at" stamp
 * persisted in localStorage. We deliberately do this client-side to avoid
 * touching the backend API surface.
 */
function isUnread(c: ConversationSummary, userId: string | undefined): boolean {
  if (!userId || !c.lastMessage) return false;
  if (c.lastMessage.direction !== 'INBOUND') return false;
  const lastReadRaw = localStorage.getItem(LAST_READ_KEY(userId, c.leadId));
  if (!lastReadRaw) return true;
  return new Date(c.lastMessage.createdAt).getTime() > new Date(lastReadRaw).getTime();
}

export default function CommunicationsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const queryLeadId = params.get('leadId');

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newConvOpen, setNewConvOpen] = useState(false);
  /** Synthetic stubs for leads opened via "Message" button that have no comms yet. */
  const [stubs, setStubs] = useState<Record<string, ConversationSummary>>({});
  /** Bump to force unread recompute when localStorage changes after a select. */
  const [readBump, setReadBump] = useState(0);

  const fetchConversations = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const items = await communicationsApi.conversations();
      setConversations(items);
    } catch {
      setConversations([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    const id = setInterval(() => fetchConversations(true), 15_000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  // When a leadId arrives via URL (e.g. from Leads page WhatsApp button),
  // ensure it's selectable: if it's not in the inbox yet, fetch the lead
  // and add a synthetic stub so the right pane can open immediately.
  useEffect(() => {
    if (!queryLeadId) return;
    const present =
      conversations.some((c) => c.leadId === queryLeadId) || stubs[queryLeadId];
    setSelected(queryLeadId);
    if (present) return;
    let cancelled = false;
    leadsApi
      .get(queryLeadId)
      .then((lead) => {
        if (cancelled) return;
        setStubs((s) => ({
          ...s,
          [lead.id]: {
            leadId: lead.id,
            leadName: lead.fullName,
            phone: lead.phone,
            status: lead.status,
            lastMessage: null,
          },
        }));
      })
      .catch(() => {
        /* lead missing or RBAC blocked — silently no-op */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryLeadId, conversations.length]);

  // Default selection when nothing in URL.
  useEffect(() => {
    if (queryLeadId || selected || conversations.length === 0) return;
    setSelected(conversations[0].leadId);
  }, [queryLeadId, selected, conversations]);

  // Merge live conversations with synthetic stubs (stubs only show until the
  // first message is sent — once the backend returns them, they take over).
  const merged = useMemo<ConversationSummary[]>(() => {
    const live = conversations;
    const liveIds = new Set(live.map((c) => c.leadId));
    const extraStubs = Object.values(stubs).filter((s) => !liveIds.has(s.leadId));
    return [...extraStubs, ...live];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, stubs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(
      (c) =>
        c.leadName.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q),
    );
  }, [merged, search]);

  const active = useMemo(
    () => merged.find((c) => c.leadId === selected) ?? null,
    [merged, selected],
  );

  // Mark the active conversation as read whenever it changes
  useEffect(() => {
    if (!active || !user) return;
    localStorage.setItem(LAST_READ_KEY(user.id, active.leadId), new Date().toISOString());
    setReadBump((n) => n + 1);
  }, [active, user]);

  const unreadCount = useMemo(() => {
    void readBump;
    return merged.filter((c) => isUnread(c, user?.id)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merged, user?.id, readBump]);

  const handleSelect = (leadId: string) => {
    setSelected(leadId);
    // Keep the URL clean — replace, don't push.
    const next = new URLSearchParams(params);
    next.set('leadId', leadId);
    setParams(next, { replace: true });
  };

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col animate-fade-in" data-testid="communications-page">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight flex items-center gap-2">
            <MessageSquareText size={22} className="text-primary" />
            Communications
            {unreadCount > 0 && (
              <Badge
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid="total-unread-badge"
              >
                {unreadCount} new
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Live WhatsApp chats and call history, in one place.
          </p>
        </div>
        <Button onClick={() => setNewConvOpen(true)} data-testid="new-conversation-button">
          <Plus size={14} className="mr-1.5" />
          New conversation
        </Button>
      </div>

      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0 h-full grid grid-cols-1 md:grid-cols-[320px_1fr]">
          {/* Inbox */}
          <div className="border-r bg-muted/10 flex flex-col" data-testid="conversation-inbox">
            <div className="p-3 border-b">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name or phone"
                  className="pl-8 h-9"
                  data-testid="conversation-search"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center" data-testid="conversation-empty">
                  <Inbox size={28} className="mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No conversations yet. Use “New conversation” or open one from the Leads page.
                  </p>
                </div>
              ) : (
                <ul>
                  {filtered.map((c) => (
                    <ConversationRow
                      key={c.leadId}
                      conv={c}
                      active={selected === c.leadId}
                      unread={isUnread(c, user?.id)}
                      onClick={() => handleSelect(c.leadId)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Chat */}
          <div>
            {active ? (
              <ChatPanel
                key={active.leadId}
                conversation={active}
                onAfterAction={() => {
                  fetchConversations(true);
                  if (user) {
                    localStorage.setItem(
                      LAST_READ_KEY(user.id, active.leadId),
                      new Date().toISOString(),
                    );
                  }
                }}
              />
            ) : (
              <div
                className="h-full flex items-center justify-center text-muted-foreground text-sm"
                data-testid="conversation-placeholder"
              >
                {loading ? 'Loading…' : 'Select a conversation to view messages.'}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <NewConversationModal open={newConvOpen} onClose={() => setNewConvOpen(false)} />
    </div>
  );
}

function ConversationRow({
  conv,
  active,
  unread,
  onClick,
}: {
  conv: ConversationSummary;
  active: boolean;
  unread: boolean;
  onClick: () => void;
}) {
  const preview = conv.lastMessage?.message
    ? conv.lastMessage.message
    : conv.lastMessage?.type === 'CALL'
      ? `Call · ${conv.lastMessage.status}`
      : 'No messages yet — start the conversation';
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left p-3 border-b flex gap-3 transition-colors ${
          active ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-muted/40'
        }`}
        data-testid={`conversation-item-${conv.leadId}`}
      >
        <div className="relative shrink-0">
          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold">
            {conv.leadName.charAt(0).toUpperCase()}
          </div>
          {unread && (
            <span
              className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-card"
              data-testid={`conversation-unread-${conv.leadId}`}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`text-sm truncate ${unread ? 'font-semibold' : 'font-medium'}`}>
              {conv.leadName}
            </span>
            {conv.lastMessage && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                {timeAgo(conv.lastMessage.createdAt)}
              </span>
            )}
          </div>
          <p className={`text-xs truncate mt-0.5 ${unread ? 'text-foreground' : 'text-muted-foreground'}`}>
            {preview}
          </p>
        </div>
      </button>
    </li>
  );
}

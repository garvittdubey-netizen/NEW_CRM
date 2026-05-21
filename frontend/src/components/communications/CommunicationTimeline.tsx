import { useEffect, useState } from 'react';
import { MessageSquareText, PhoneCall, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MessageStatus } from './MessageStatus';
import { CallLogModal } from './CallLogModal';
import { communicationsApi } from '@/services/communications';
import type { Communication, Lead } from '@/types';

interface Props {
  lead: Pick<Lead, 'id' | 'fullName' | 'phone'>;
  /** Whether the current user can interact (admin OR the assigned agent). */
  canManage: boolean;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Read-only timeline that lives inside a lead's detail page. Lists every
 * WhatsApp message and call log for the lead, newest first.
 *
 * Polls every 10s so inbound WhatsApp replies surface without a refresh.
 */
export function CommunicationTimeline({ lead, canManage }: Props) {
  const [items, setItems] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [callOpen, setCallOpen] = useState(false);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await communicationsApi.list({ leadId: lead.id, limit: 100 });
      setItems(data.communications);
    } catch {
      // silent — the chat page is the source of truth
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(true), 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  return (
    <Card data-testid="communication-timeline">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <MessageSquareText size={13} />
          Communication Timeline
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => fetchData()}
            title="Refresh"
            data-testid="comm-refresh"
          >
            <RefreshCw size={12} />
          </Button>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCallOpen(true)}
              className="h-7 text-xs"
              data-testid="comm-log-call"
            >
              <PhoneCall size={12} className="mr-1" />
              Log call
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="comm-empty">
            No communications logged yet.
          </p>
        ) : (
          <ol className="relative space-y-3 pl-5 border-l border-border" data-testid="comm-items">
            {items.map((c) => (
              <li key={c.id} className="relative" data-testid={`comm-item-${c.id}`}>
                <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                <CommItem c={c} />
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <CallLogModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        lead={lead}
        onSuccess={() => fetchData(true)}
      />
    </Card>
  );
}

function CommItem({ c }: { c: Communication }) {
  if (c.type === 'CALL') {
    return (
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px]">CALL</Badge>
          <span className="text-sm font-medium">{c.callOutcome?.replace(/_/g, ' ')}</span>
          {c.callDuration ? (
            <span className="text-xs text-muted-foreground">{Math.round(c.callDuration / 60)}m</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fmt(c.createdAt)} · {c.createdBy?.name ?? 'system'}
        </p>
        {c.message && <p className="text-sm mt-1 whitespace-pre-wrap">{c.message}</p>}
      </div>
    );
  }

  const isOutbound = c.direction === 'OUTBOUND';
  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">WhatsApp · {isOutbound ? 'OUT' : 'IN'}</Badge>
        {c.templateName && (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            template · {c.templateName}
          </span>
        )}
        <MessageStatus status={c.status} direction={c.direction} />
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {fmt(c.createdAt)} · {c.createdBy?.name ?? (isOutbound ? 'system' : 'lead')}
      </p>
      {c.message && <p className="text-sm mt-1 whitespace-pre-wrap">{c.message}</p>}
      {c.status.toUpperCase() === 'FAILED' && c.errorDetail && (
        <p className="text-xs text-destructive mt-1">{c.errorDetail}</p>
      )}
    </div>
  );
}

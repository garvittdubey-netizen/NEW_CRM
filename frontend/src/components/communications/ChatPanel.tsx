import { useEffect, useRef, useState } from 'react';
import { Send, FileText, PhoneCall, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { MessageStatus } from './MessageStatus';
import { TemplatePicker } from './TemplatePicker';
import { CallLogModal } from './CallLogModal';
import { communicationsApi } from '@/services/communications';
import { extractApiError } from '@/services/api';
import type { Communication, ConversationSummary } from '@/types';

/**
 * Predefined message snippets shown as chips above the composer. Clicking a
 * chip appends the snippet to the current draft (or replaces it when empty),
 * so agents can still edit before hitting send.
 */
const QUICK_REPLIES = [
  'Hello, thanks for contacting us.',
  'Sending property details shortly.',
  'Are you available for a site visit?',
  'Can we schedule a call?',
  'Please share your requirements.',
] as const;

interface Props {
  /** Selected conversation summary (already loaded by the parent). */
  conversation: ConversationSummary;
  /** Refresh callback so the parent inbox can update last-message preview. */
  onAfterAction?: () => void;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Two-panel chat: history (scrollable, polled every 10s) on top, composer +
 * action buttons (template picker, call log) at the bottom.
 *
 * For non-template messages we POST directly to /api/communications/whatsapp/send.
 * For template messages we open the picker first, collect parameters, and
 * include them in the same POST.
 */
export function ChatPanel({ conversation, onAfterAction }: Props) {
  const [messages, setMessages] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await communicationsApi.list({ leadId: conversation.leadId, limit: 200 });
      // Backend returns newest-first; reverse to chronological for chat.
      setMessages([...data.communications].reverse());
    } catch (e) {
      if (!silent) setError(extractApiError(e, 'Failed to load conversation.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // initial load + poll every 10s
  useEffect(() => {
    fetchMessages();
    const id = setInterval(() => fetchMessages(true), 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.leadId]);

  // auto-scroll to latest
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages.length]);

  const handleSendText = async () => {
    const message = draft.trim();
    if (!message || sending) return;
    setError('');
    setSending(true);
    try {
      await communicationsApi.sendWhatsApp({ leadId: conversation.leadId, message });
      setDraft('');
      await fetchMessages(true);
      onAfterAction?.();
    } catch (e) {
      setError(extractApiError(e, 'Failed to send message.'));
    } finally {
      setSending(false);
    }
  };

  const handleSendTemplate = async (
    templateName: string,
    templateLang: string,
    templateParams: string[],
  ) => {
    setError('');
    setSending(true);
    try {
      await communicationsApi.sendWhatsApp({
        leadId: conversation.leadId,
        templateName,
        templateLang,
        templateParams,
      });
      await fetchMessages(true);
      onAfterAction?.();
    } catch (e) {
      setError(extractApiError(e, 'Failed to send template message.'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full" data-testid="chat-panel">
      {/* Header */}
      <div className="px-5 py-3 border-b flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center text-primary font-semibold">
          {conversation.leadName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate" data-testid="chat-lead-name">{conversation.leadName}</p>
          <p className="text-xs text-muted-foreground truncate">{conversation.phone || 'No phone on file'}</p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase">{conversation.status}</Badge>
      </div>

      {/* Messages */}
      <div ref={scrollerRef} className="flex-1 overflow-y-auto p-5 space-y-2 bg-muted/20" data-testid="chat-messages">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-1/2" />
            <Skeleton className="h-10 w-2/3 ml-auto" />
            <Skeleton className="h-10 w-1/3" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10" data-testid="chat-empty">
            No messages yet. Send a template message to start the conversation.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} m={m} />)
        )}
      </div>

      {/* Composer + actions */}
      <div className="border-t p-3 space-y-2">
        {/* Quick replies — single-click insert. Append when draft is non-empty,
            otherwise replace. Agents can still edit before sending. */}
        <div className="flex flex-wrap gap-1.5" data-testid="quick-replies">
          {QUICK_REPLIES.map((text, idx) => (
            <button
              type="button"
              key={text}
              onClick={() =>
                setDraft((cur) => (cur.trim() ? `${cur.trim()} ${text}` : text))
              }
              disabled={!conversation.phone || sending}
              className="text-[11px] px-2.5 py-1 rounded-full border bg-card hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:border-emerald-900 dark:hover:text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              data-testid={`quick-reply-${idx}`}
              title="Insert into message"
            >
              {text}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md" data-testid="chat-error">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span className="break-all">{error}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={conversation.phone ? 'Type a WhatsApp reply…' : 'Lead has no phone on file'}
            disabled={!conversation.phone || sending}
            rows={2}
            className="resize-none"
            data-testid="chat-composer"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendText();
              }
            }}
          />
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              onClick={handleSendText}
              disabled={!draft.trim() || !conversation.phone || sending}
              data-testid="chat-send-button"
              className="h-9 w-9 p-0"
              title="Send message"
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setTemplateOpen(true)}
            disabled={!conversation.phone || sending}
            data-testid="chat-template-button"
          >
            <FileText size={13} className="mr-1.5" />
            Use template
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setCallOpen(true)}
            data-testid="chat-log-call-button"
          >
            <PhoneCall size={13} className="mr-1.5" />
            Log a call
          </Button>
          <span className="ml-auto text-[10px] text-muted-foreground">Polling · 10s</span>
        </div>
      </div>

      <TemplatePicker
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onSelect={handleSendTemplate}
      />
      <CallLogModal
        open={callOpen}
        onClose={() => setCallOpen(false)}
        lead={{ id: conversation.leadId, fullName: conversation.leadName, phone: conversation.phone }}
        onSuccess={() => {
          fetchMessages(true);
          onAfterAction?.();
        }}
      />
    </div>
  );
}

function MessageBubble({ m }: { m: Communication }) {
  if (m.type === 'CALL') {
    return (
      <div className="flex justify-center" data-testid={`chat-msg-${m.id}`}>
        <div className="rounded-full border bg-card px-3 py-1.5 text-[11px] text-muted-foreground inline-flex items-center gap-2">
          <PhoneCall size={11} />
          Call · {m.callOutcome?.replace(/_/g, ' ')}
          {m.callDuration ? ` · ${Math.round(m.callDuration / 60)}m` : ''}
          {m.message && <span className="text-foreground/80 max-w-[260px] truncate">— {m.message}</span>}
          <span className="text-muted-foreground/70">· {formatTime(m.createdAt)}</span>
        </div>
      </div>
    );
  }

  const isOutbound = m.direction === 'OUTBOUND';
  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`} data-testid={`chat-msg-${m.id}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
          isOutbound
            ? 'bg-emerald-600 text-white rounded-br-sm'
            : 'bg-card border rounded-bl-sm'
        }`}
      >
        {m.templateName && (
          <div className={`flex items-center gap-1 mb-1 text-[10px] uppercase tracking-wide ${isOutbound ? 'text-emerald-100' : 'text-muted-foreground'}`}>
            <FileText size={10} />
            Template · {m.templateName}
          </div>
        )}
        {m.message && <p className="whitespace-pre-wrap break-words">{m.message}</p>}
        {!m.message && m.templateParams && (
          <p className="text-xs italic opacity-80">
            Params: {(Array.isArray(m.templateParams) ? m.templateParams : []).join(', ') || '—'}
          </p>
        )}
        <div className={`flex items-center gap-1 mt-1 text-[10px] ${isOutbound ? 'text-emerald-100' : 'text-muted-foreground'}`}>
          <span>{formatTime(m.createdAt)}</span>
          <MessageStatus status={m.status} direction={m.direction} className={isOutbound && m.status.toUpperCase() === 'READ' ? 'text-sky-200' : ''} />
        </div>
        {m.status.toUpperCase() === 'FAILED' && m.errorDetail && (
          <p className="text-[10px] mt-1 opacity-90">{m.errorDetail}</p>
        )}
      </div>
    </div>
  );
}

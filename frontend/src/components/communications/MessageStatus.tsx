import { Check, CheckCheck, Clock3, AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Renders the appropriate WhatsApp status tick icon for an outbound message.
 * Mirrors WhatsApp's own UI semantics:
 *   SENT/PENDING  → single tick
 *   DELIVERED     → double tick
 *   READ          → double tick (blue)
 *   FAILED        → red triangle + label
 *   RECEIVED      → inbox icon (inbound)
 */
export function MessageStatus({
  status,
  direction,
  className,
}: {
  status: string;
  direction: 'INBOUND' | 'OUTBOUND' | null;
  className?: string;
}) {
  if (direction === 'INBOUND')
    return <Inbox size={11} className={cn('text-muted-foreground', className)} aria-label="received" />;

  const s = status.toUpperCase();
  if (s === 'FAILED')
    return (
      <span
        className={cn('inline-flex items-center gap-1 text-[10px] font-medium text-destructive', className)}
        data-testid="msg-status-failed"
      >
        <AlertTriangle size={11} />
        Failed
      </span>
    );
  if (s === 'READ')
    return <CheckCheck size={13} className={cn('text-blue-500', className)} data-testid="msg-status-read" />;
  if (s === 'DELIVERED')
    return <CheckCheck size={13} className={cn('text-muted-foreground', className)} data-testid="msg-status-delivered" />;
  if (s === 'SENT')
    return <Check size={13} className={cn('text-muted-foreground', className)} data-testid="msg-status-sent" />;
  return <Clock3 size={11} className={cn('text-muted-foreground', className)} data-testid="msg-status-pending" />;
}

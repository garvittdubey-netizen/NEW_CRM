import {
  MessageSquare,
  PhoneCall,
  UserPlus,
  CalendarPlus,
  CheckCircle2,
  Inbox,
  Trash2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { Activity } from '@/types';

interface IconConfig {
  icon: React.ElementType;
  cls: string;
}

/**
 * Maps an activity action name to an icon + colour. Anything we don't know
 * about gets the neutral "sparkles" icon so unknown future actions still render.
 */
export function actionIcon(action: string): IconConfig {
  switch (action) {
    case 'WHATSAPP_SENT':
      return { icon: MessageSquare, cls: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40' };
    case 'WHATSAPP_RECEIVED':
      return { icon: Inbox, cls: 'text-sky-600 bg-sky-100 dark:bg-sky-950/40' };
    case 'CALL_LOGGED':
      return { icon: PhoneCall, cls: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-950/40' };
    case 'LEAD_CREATED':
      return { icon: UserPlus, cls: 'text-violet-600 bg-violet-100 dark:bg-violet-950/40' };
    case 'FOLLOWUP_CREATED':
      return { icon: CalendarPlus, cls: 'text-amber-600 bg-amber-100 dark:bg-amber-950/40' };
    case 'FOLLOWUP_COMPLETED':
      return { icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40' };
    case 'LEAD_DELETED':
    case 'FOLLOWUP_DELETED':
      return { icon: Trash2, cls: 'text-destructive bg-destructive/10' };
    case 'LEAD_UPDATED':
    case 'FOLLOWUP_UPDATED':
      return { icon: RefreshCw, cls: 'text-blue-600 bg-blue-100 dark:bg-blue-950/40' };
    default:
      return { icon: Sparkles, cls: 'text-muted-foreground bg-muted' };
  }
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function activityTestId(a: Activity): string {
  return `activity-${a.id}`;
}

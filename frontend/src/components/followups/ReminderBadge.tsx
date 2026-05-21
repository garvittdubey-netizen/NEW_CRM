import { cn } from '@/lib/utils';
import type { FollowUpStatus } from '@/types';

const STYLES: Record<FollowUpStatus | 'OVERDUE' | 'TODAY', string> = {
  PENDING: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  COMPLETED:
    'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  MISSED:
    'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900/60 dark:text-zinc-300 dark:border-zinc-800',
  OVERDUE:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900',
  TODAY:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
};

const LABELS: Record<FollowUpStatus | 'OVERDUE' | 'TODAY', string> = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  MISSED: 'Missed',
  OVERDUE: 'Overdue',
  TODAY: 'Today',
};

interface Props {
  /**
   * The "effective" badge label. Pass the raw FollowUp.status by default,
   * or override with OVERDUE/TODAY when the parent has already computed
   * the time-based bucket for the row.
   */
  status: FollowUpStatus | 'OVERDUE' | 'TODAY';
  className?: string;
}

/**
 * Visual reminder badge used on follow-up rows, the upcoming widget, and
 * the lead timeline. Picks a colour from the design system based on the
 * effective status (with extra TODAY and OVERDUE buckets the parent may set).
 */
export function ReminderBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase tracking-wide',
        STYLES[status],
        className,
      )}
      data-testid={`reminder-badge-${status.toLowerCase()}`}
    >
      {LABELS[status]}
    </span>
  );
}

/**
 * Utility: classify a follow-up by date relative to "now".
 * - PENDING + past date => OVERDUE
 * - PENDING + today    => TODAY
 * - otherwise          => the underlying status verbatim
 */
export function classifyFollowUp(
  followUpDate: string | Date,
  status: FollowUpStatus,
  now: Date = new Date(),
): FollowUpStatus | 'OVERDUE' | 'TODAY' {
  if (status !== 'PENDING') return status;
  const date = new Date(followUpDate);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  if (date < startOfToday) return 'OVERDUE';
  if (date >= startOfToday && date <= endOfToday) return 'TODAY';
  return 'PENDING';
}

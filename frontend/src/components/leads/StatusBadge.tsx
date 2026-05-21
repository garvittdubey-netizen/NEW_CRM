import type { LeadStatus } from '@/types';

interface StatusConfig {
  label: string;
  className: string;
  dotColor: string;
}

const STATUS_CONFIG: Record<LeadStatus, StatusConfig> = {
  NEW: {
    label: 'New',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    dotColor: 'bg-blue-500',
  },
  CONTACTED: {
    label: 'Contacted',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    dotColor: 'bg-amber-500',
  },
  QUALIFIED: {
    label: 'Qualified',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
    dotColor: 'bg-violet-500',
  },
  NEGOTIATING: {
    label: 'Negotiating',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    dotColor: 'bg-orange-500',
  },
  WON: {
    label: 'Won',
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    dotColor: 'bg-green-500',
  },
  LOST: {
    label: 'Lost',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400',
    dotColor: 'bg-slate-400',
  },
};

interface StatusBadgeProps {
  status: LeadStatus;
  showDot?: boolean;
}

export function StatusBadge({ status, showDot = false }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.NEW;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
      data-testid={`status-badge-${status.toLowerCase()}`}
    >
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor}`} />}
      {config.label}
    </span>
  );
}

export { STATUS_CONFIG };

import type { DealStatus } from '@/types';

interface DealStatusConfig {
  label: string;
  className: string;
  dot: string;
}

const DEAL_STATUS_CONFIG: Record<DealStatus, DealStatusConfig> = {
  NEW: {
    label: 'New',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  NEGOTIATION: {
    label: 'Negotiation',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  DOCUMENTATION: {
    label: 'Documentation',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  PAYMENT_PENDING: {
    label: 'Payment Pending',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    dot: 'bg-orange-500',
  },
  WON: {
    label: 'Won',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  LOST: {
    label: 'Lost',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
};

export function DealStatusBadge({
  status,
  showDot = false,
}: {
  status: DealStatus;
  showDot?: boolean;
}) {
  const config = DEAL_STATUS_CONFIG[status] ?? DEAL_STATUS_CONFIG.NEW;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
      data-testid={`deal-status-badge-${status.toLowerCase()}`}
    >
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />}
      {config.label}
    </span>
  );
}

export { DEAL_STATUS_CONFIG };

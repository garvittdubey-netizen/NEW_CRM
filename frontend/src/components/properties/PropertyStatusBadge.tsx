import type { PropertyStatus } from '@/types';

interface StatusConfig {
  label: string;
  className: string;
  dotColor: string;
}

const PROPERTY_STATUS_CONFIG: Record<PropertyStatus, StatusConfig> = {
  AVAILABLE: {
    label: 'Available',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    dotColor: 'bg-emerald-500',
  },
  RESERVED: {
    label: 'Reserved',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    dotColor: 'bg-amber-500',
  },
  SOLD: {
    label: 'Sold',
    className: 'bg-slate-200 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
    dotColor: 'bg-slate-500',
  },
};

export function PropertyStatusBadge({
  status,
  showDot = false,
}: {
  status: PropertyStatus;
  showDot?: boolean;
}) {
  const config = PROPERTY_STATUS_CONFIG[status] ?? PROPERTY_STATUS_CONFIG.AVAILABLE;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.className}`}
      data-testid={`property-status-badge-${status.toLowerCase()}`}
    >
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor}`} />}
      {config.label}
    </span>
  );
}

export { PROPERTY_STATUS_CONFIG };

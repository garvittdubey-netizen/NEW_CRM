import { Building2, UserCircle, CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DealStatusBadge } from './DealStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import type { Deal } from '@/types';
import { isAdminLevel } from '@/lib/roles';

function formatAmount(value: number | null): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

interface Props {
  deal: Deal;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
}

/** Dense list-row variant of the deal card. */
export function DealListRow({ deal, onEdit, onDelete }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminLevel(user?.role);
  const canManage = isAdmin || deal.assignedAgentId === user?.id;

  // Clicking anywhere except an action button opens the detail page. We
  // detect a bubbled-up click from a button via `closest('button')` so the
  // inline Edit / Delete continue to work without `stopPropagation` on every
  // onClick handler.
  const handleRowClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    navigate(`/deals/${deal.id}`);
  };

  return (
    <div
      onClick={handleRowClick}
      className="flex items-center gap-4 p-3 border-b last:border-0 hover:bg-muted/40 transition-colors cursor-pointer"
      data-testid={`deal-row-${deal.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-semibold leading-tight truncate">{deal.title}</h3>
          <DealStatusBadge status={deal.status} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {deal.client && (
            <span className="flex items-center gap-1">
              <UserCircle size={11} /> {deal.client.fullName}
            </span>
          )}
          {deal.property && (
            <span className="flex items-center gap-1">
              <Building2 size={11} /> {deal.property.title} · {deal.property.city}
            </span>
          )}
          {deal.expectedClosingDate && (
            <span className="flex items-center gap-1">
              <CalendarDays size={11} /> {formatDate(deal.expectedClosingDate)}
            </span>
          )}
        </div>
      </div>

      <span className="text-xs text-muted-foreground hidden md:flex items-center gap-1">
        <UserCircle size={11} />
        {deal.assignedAgent?.name ?? 'Unassigned'}
      </span>

      <p className="text-base font-semibold text-primary whitespace-nowrap">
        {formatAmount(deal.amount)}
      </p>

      {canManage && (
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(deal)}
            data-testid={`edit-deal-row-${deal.id}`}
            aria-label="Edit deal"
          >
            <Pencil size={12} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => onDelete(deal)}
            data-testid={`delete-deal-row-${deal.id}`}
            aria-label="Delete deal"
          >
            <Trash2 size={12} />
          </Button>
        </div>
      )}
    </div>
  );
}

import { Building2, UserCircle, CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DealStatusBadge } from './DealStatusBadge';
import { useAuth } from '@/hooks/useAuth';
import { buildCloudinaryUrl } from '@/lib/property-format';
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
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface Props {
  deal: Deal;
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
}

/**
 * Grid-view card showing client, property, amount, status, agent.
 * Edit/Delete actions are inline (RBAC-gated) because Phase-1 has no detail page.
 */
export function DealCard({ deal, onEdit, onDelete }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = isAdminLevel(user?.role);
  const canManage = isAdmin || deal.assignedAgentId === user?.id;

  const cover = deal.property?.images?.[0];

  // Buttons inside the card stop bubbling here — we just ignore clicks that
  // originated on any nested <button>. Keeps DealsPage's inline Edit/Delete
  // working without rewriting their handlers.
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    navigate(`/deals/${deal.id}`);
  };

  return (
    <Card
      onClick={handleCardClick}
      className="overflow-hidden transition-all hover:shadow-md hover:border-primary/40 cursor-pointer"
      data-testid={`deal-card-${deal.id}`}
    >
      {/* Cover strip (property photo) */}
      <div className="relative h-28 bg-muted overflow-hidden">
        {cover ? (
          <img
            src={buildCloudinaryUrl(cover, { width: 480, crop: 'fill' })}
            alt={deal.property?.title ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground">
            <Building2 size={22} />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <DealStatusBadge status={deal.status} showDot />
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-semibold leading-tight line-clamp-1" title={deal.title}>
            {deal.title}
          </h3>
          <p className="text-2xl font-bold text-primary mt-1">{formatAmount(deal.amount)}</p>
        </div>

        <div className="space-y-1.5 text-xs">
          {deal.client && (
            <p className="flex items-center gap-1.5 text-muted-foreground" data-testid="deal-card-client">
              <UserCircle size={12} className="text-primary" />
              <span className="font-medium text-foreground truncate">{deal.client.fullName}</span>
              {deal.client.phone && <span className="text-muted-foreground">· {deal.client.phone}</span>}
            </p>
          )}
          {deal.property && (
            <p className="flex items-center gap-1.5 text-muted-foreground" data-testid="deal-card-property">
              <Building2 size={12} className="text-primary" />
              <span className="font-medium text-foreground truncate">{deal.property.title}</span>
              <span className="text-muted-foreground truncate">· {deal.property.city}</span>
            </p>
          )}
          {deal.expectedClosingDate && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays size={12} /> Closing {formatDate(deal.expectedClosingDate)}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <UserCircle size={11} />
            {deal.assignedAgent?.name ?? 'Unassigned'}
          </span>
          {canManage && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(deal)}
                data-testid={`edit-deal-${deal.id}`}
                aria-label="Edit deal"
              >
                <Pencil size={12} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDelete(deal)}
                data-testid={`delete-deal-${deal.id}`}
                aria-label="Delete deal"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

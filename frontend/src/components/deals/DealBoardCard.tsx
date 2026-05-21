import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Building2, UserCircle, CalendarDays, GripVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { buildCloudinaryUrl } from '@/lib/property-format';
import type { Deal } from '@/types';

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
  });
}

interface Props {
  deal: Deal;
  onOpen: (id: string) => void;
  /** True when this is the ghost rendered inside <DragOverlay>. */
  overlay?: boolean;
}

/**
 * Single deal card on the Kanban board. Mirrors the Lead `LeadCard` pattern:
 *   - The grip icon in the header is the ONLY drag handle.
 *   - Tapping the rest of the card navigates to /deals/:id.
 *   - In `overlay` mode (DragOverlay ghost) we skip the draggable wiring.
 */
export function DealBoardCard({ deal, onOpen, overlay = false }: Props) {
  const draggable = useDraggable({ id: deal.id, disabled: overlay });
  const { setNodeRef, listeners, attributes, transform, isDragging } = draggable;

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) return;
    onOpen(deal.id);
  };

  const cover = deal.property?.images?.[0];

  return (
    <Card
      ref={overlay ? undefined : setNodeRef}
      onClick={overlay ? undefined : handleCardClick}
      data-testid={`deal-board-card-${deal.id}`}
      style={
        overlay
          ? undefined
          : {
              transform: CSS.Translate.toString(transform),
              opacity: isDragging ? 0.3 : 1,
            }
      }
      className={`
        bg-card border p-3 cursor-pointer hover:shadow-md transition-shadow duration-150
        ${overlay ? 'shadow-2xl ring-2 ring-primary/30 cursor-grabbing rotate-1' : ''}
      `}
    >
      {/* Header — grip + title */}
      <div className="flex items-start gap-2 mb-2">
        <button
          {...(overlay ? {} : listeners)}
          {...(overlay ? {} : attributes)}
          data-drag-handle
          className="mt-0.5 -ml-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to move"
          data-testid={`deal-board-card-handle-${deal.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={13} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight truncate" title={deal.title}>
            {deal.title}
          </p>
          <p className="text-base font-bold text-primary mt-0.5">{formatAmount(deal.amount)}</p>
        </div>
        {cover && (
          <img
            src={buildCloudinaryUrl(cover, { width: 80, crop: 'fill' })}
            alt=""
            className="h-9 w-9 rounded object-cover shrink-0"
            loading="lazy"
          />
        )}
      </div>

      {/* Body — client + property */}
      <div className="space-y-1 text-[11px] text-muted-foreground">
        {deal.client && (
          <p className="flex items-center gap-1.5 truncate">
            <UserCircle size={11} className="shrink-0" />
            <span className="truncate text-foreground">{deal.client.fullName}</span>
          </p>
        )}
        {deal.property && (
          <p className="flex items-center gap-1.5 truncate">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{deal.property.title}</span>
          </p>
        )}
      </div>

      {/* Footer — agent + closing date */}
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t">
        <div
          className="flex items-center gap-1.5 min-w-0"
          title={deal.assignedAgent?.name}
          data-testid={`deal-board-card-agent-${deal.id}`}
        >
          <div className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-semibold shrink-0">
            {(deal.assignedAgent?.name ?? '?')
              .split(' ')
              .map((s) => s[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
          <span className="text-[10px] truncate">
            {deal.assignedAgent?.name.split(' ')[0] ?? 'Unassigned'}
          </span>
        </div>
        {deal.expectedClosingDate && (
          <span className="text-[10px] flex items-center gap-1 shrink-0">
            <CalendarDays size={10} /> {formatDate(deal.expectedClosingDate)}
          </span>
        )}
      </div>
    </Card>
  );
}

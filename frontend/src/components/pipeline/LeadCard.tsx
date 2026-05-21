import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Phone, GripVertical } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ReminderBadge, classifyFollowUp } from '@/components/followups/ReminderBadge';
import type { Lead, FollowUp } from '@/types';

interface Props {
  lead: Lead;
  /** Pre-filtered "next pending" follow-up for THIS lead, if any. */
  followUp?: FollowUp;
  onOpen: (id: string) => void;
  /** Whether this is the ghost drag overlay (no draggable wiring) */
  overlay?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  FACEBOOK: 'Facebook',
  WHATSAPP: 'WhatsApp',
  WEBSITE: 'Website',
  REFERRAL: 'Referral',
  MANUAL: 'Manual',
  PROPERTY_PORTAL: 'Portal',
  OTHER: 'Other',
};

/**
 * A single lead card on the pipeline board.
 *
 * The whole card is the drag handle EXCEPT for the click area, which routes
 * to /leads/:id. To keep that disambiguation crisp we put `listeners` on a
 * small grip icon in the header; tapping anywhere else just opens the lead.
 *
 * Pass `overlay` when rendering inside <DragOverlay> — we then skip the
 * draggable bindings entirely so the ghost doesn't fight the active card.
 */
export function LeadCard({ lead, followUp, onOpen, overlay = false }: Props) {
  const draggable = useDraggable({ id: lead.id, disabled: overlay });
  const { setNodeRef, listeners, attributes, transform, isDragging } = draggable;

  // Stop the click handler when the drag handle is grabbed so we don't
  // accidentally navigate away mid-drag.
  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-drag-handle]')) return;
    onOpen(lead.id);
  };

  const initials = lead.fullName
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const effectiveFollowUp = followUp
    ? classifyFollowUp(followUp.followUpDate, followUp.status)
    : null;

  return (
    <Card
      ref={overlay ? undefined : setNodeRef}
      onClick={overlay ? undefined : handleCardClick}
      data-testid={`pipeline-card-${lead.id}`}
      style={overlay ? undefined : {
        transform: CSS.Translate.toString(transform),
        // Hide the source card while DragOverlay shows the ghost so we don't
        // see two copies — a classic dnd-kit pattern.
        opacity: isDragging ? 0.3 : 1,
      }}
      className={`
        bg-card border p-3 cursor-pointer hover:shadow-md transition-shadow duration-150
        ${overlay ? 'shadow-2xl ring-2 ring-primary/30 cursor-grabbing rotate-1' : ''}
      `}
    >
      {/* Header: grip handle + name + source */}
      <div className="flex items-start gap-2 mb-2">
        <button
          {...(overlay ? {} : listeners)}
          {...(overlay ? {} : attributes)}
          data-drag-handle
          className="mt-0.5 -ml-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to move"
          data-testid={`pipeline-card-handle-${lead.id}`}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={13} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm leading-tight truncate" title={lead.fullName}>
            {lead.fullName}
          </p>
          <Badge variant="outline" className="text-[10px] mt-1 font-normal">
            {SOURCE_LABELS[lead.source] ?? lead.source}
          </Badge>
        </div>
      </div>

      {/* Phone */}
      {lead.phone && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Phone size={11} className="shrink-0" />
          <span className="truncate">{lead.phone}</span>
        </div>
      )}

      {/* Footer: agent + follow-up badge */}
      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t">
        {lead.assignedAgent ? (
          <div
            className="flex items-center gap-1.5 min-w-0"
            title={lead.assignedAgent.name}
            data-testid={`pipeline-card-agent-${lead.id}`}
          >
            <div className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[9px] font-semibold shrink-0">
              {lead.assignedAgent.name
                .split(' ')
                .map((s) => s[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            <span className="text-[11px] text-muted-foreground truncate">
              {lead.assignedAgent.name.split(' ')[0]}
            </span>
          </div>
        ) : (
          <span
            className="text-[10px] text-muted-foreground italic"
            data-testid={`pipeline-card-unassigned-${lead.id}`}
            title={initials}
          >
            Unassigned
          </span>
        )}

        {effectiveFollowUp && (
          <ReminderBadge
            status={effectiveFollowUp}
            className="text-[9px] px-1.5"
          />
        )}
      </div>
    </Card>
  );
}

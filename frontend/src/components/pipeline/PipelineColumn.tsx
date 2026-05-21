import { useDroppable } from '@dnd-kit/core';
import { LeadCard } from './LeadCard';
import type { Lead, FollowUp, LeadStatus } from '@/types';

interface Props {
  status: LeadStatus;
  label: string;
  /** Tailwind classes used to colour the column header strip. */
  accent: string;
  leads: Lead[];
  /** Map of leadId → next pending follow-up, when there is one. */
  nextFollowUps: Map<string, FollowUp>;
  onOpenLead: (id: string) => void;
  /** True while a card is currently being dragged in the board. */
  isAnyDragging: boolean;
}

/**
 * A vertical Kanban column. Acts as a single drop target — `useDroppable`
 * exposes `isOver` which we use to paint the subtle "drop here" highlight.
 *
 * Columns ALWAYS render at a minimum width so the board scrolls horizontally
 * on mobile instead of squashing each column into illegibility.
 */
export function PipelineColumn({
  status,
  label,
  accent,
  leads,
  nextFollowUps,
  onOpenLead,
  isAnyDragging,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className="flex flex-col bg-muted/40 rounded-lg border w-[280px] sm:w-[300px] shrink-0 max-h-full"
      data-testid={`pipeline-column-${status}`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b rounded-t-lg ${accent}`}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">{label}</span>
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-card/80 text-foreground/80"
            data-testid={`pipeline-count-${status}`}
          >
            {leads.length}
          </span>
        </div>
      </div>

      {/* Body — drop zone */}
      <div
        ref={setNodeRef}
        className={`
          flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px] transition-colors duration-150
          ${isOver ? 'bg-primary/5 ring-2 ring-primary/30 ring-inset' : ''}
          ${isAnyDragging && !isOver ? 'bg-muted/20' : ''}
        `}
        data-testid={`pipeline-dropzone-${status}`}
      >
        {leads.length === 0 ? (
          <div
            className="flex items-center justify-center h-20 text-xs text-muted-foreground italic"
            data-testid={`pipeline-empty-${status}`}
          >
            {isAnyDragging ? 'Drop here' : 'No leads'}
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              followUp={nextFollowUps.get(lead.id)}
              onOpen={onOpenLead}
            />
          ))
        )}
      </div>
    </div>
  );
}

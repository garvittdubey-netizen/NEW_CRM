import { useDroppable } from '@dnd-kit/core';
import { DealBoardCard } from './DealBoardCard';
import type { Deal, DealStatus } from '@/types';

interface Props {
  status: DealStatus;
  label: string;
  /** Tailwind classes used to colour the column header strip. */
  accent: string;
  deals: Deal[];
  onOpenDeal: (id: string) => void;
  /** True while a card is being dragged anywhere on the board. */
  isAnyDragging: boolean;
}

/**
 * A vertical Kanban column for the Deals board. Single drop target via
 * `useDroppable` — `isOver` drives the drop highlight. Mirrors the Lead
 * `PipelineColumn` so the visual behaviour stays consistent between the
 * two boards.
 */
export function DealBoardColumn({
  status,
  label,
  accent,
  deals,
  onOpenDeal,
  isAnyDragging,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      className="flex flex-col bg-muted/40 rounded-lg border w-[280px] sm:w-[300px] shrink-0 max-h-full"
      data-testid={`deal-board-column-${status}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2.5 border-b rounded-t-lg ${accent}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">{label}</span>
          <span
            className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-card/80 text-foreground/80"
            data-testid={`deal-board-count-${status}`}
          >
            {deals.length}
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
        data-testid={`deal-board-dropzone-${status}`}
      >
        {deals.length === 0 ? (
          <div
            className="flex items-center justify-center h-20 text-xs text-muted-foreground italic"
            data-testid={`deal-board-empty-${status}`}
          >
            {isAnyDragging ? 'Drop here' : 'No deals'}
          </div>
        ) : (
          deals.map((d) => <DealBoardCard key={d.id} deal={d} onOpen={onOpenDeal} />)
        )}
      </div>
    </div>
  );
}

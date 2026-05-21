import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Search, X, ArrowLeft, List } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DealBoardCard } from '@/components/deals/DealBoardCard';
import { DealBoardColumn } from '@/components/deals/DealBoardColumn';
import { dealsApi } from '@/services/deals';
import { agentsApi, type AgentOption } from '@/services/leads';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Deal, DealStatus } from '@/types';
import { isAdminLevel } from '@/lib/roles';

/**
 * Kanban-style Deal Board (Phase-2). Visual / interaction parity with the
 * Lead `PipelinePage` — same drag-and-drop library (`@dnd-kit`), same drop
 * highlight, same DragOverlay ghost, same URL-backed filter strategy. The
 * only swaps are the data source (`/api/deals`) and the column set, which
 * uses the 6-value `DealStatus` enum.
 *
 * Drag → drop:
 *   1. Optimistic local update (status swap).
 *   2. `dealsApi.update({status})` fires.
 *   3. On success, reconcile with server (assignedAgent / updatedAt may
 *      shift, plus the backend auto-logs a STATUS_CHANGED event into the
 *      deal_activities table).
 *   4. On failure (403 for an agent dropping a deal they don't own, or a
 *      network error), revert and alert.
 */

const COLUMNS: { status: DealStatus; label: string; accent: string }[] = [
  { status: 'NEW',             label: 'New',             accent: 'bg-sky-50     dark:bg-sky-950/30' },
  { status: 'NEGOTIATION',     label: 'Negotiation',     accent: 'bg-amber-50   dark:bg-amber-950/30' },
  { status: 'DOCUMENTATION',   label: 'Documentation',   accent: 'bg-violet-50  dark:bg-violet-950/30' },
  { status: 'PAYMENT_PENDING', label: 'Payment Pending', accent: 'bg-orange-50  dark:bg-orange-950/30' },
  { status: 'WON',             label: 'Won',             accent: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { status: 'LOST',            label: 'Lost',            accent: 'bg-rose-50    dark:bg-rose-950/30' },
];

export default function DealBoardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);

  // URL-backed filter state — browser history is the source of truth so
  // shareable links and back/forward navigation work without ceremony.
  const search = searchParams.get('search') ?? '';
  const agent = searchParams.get('agent') ?? 'ALL';

  const [deals, setDeals] = useState<Deal[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDeal, setActiveDeal] = useState<Deal | null>(null);

  const updateFilter = (key: 'search' | 'agent', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'ALL') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams({}, { replace: true });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [dealsRes, agentsRes] = await Promise.all([
        dealsApi.list({ limit: 500 }),
        isAdmin ? agentsApi.list().catch(() => [] as AgentOption[]) : Promise.resolve([]),
      ]);
      setDeals(dealsRes.deals);
      setAgents(agentsRes);
    } catch (e) {
      window.alert(`Failed to load deal board: ${extractApiError(e, 'Please try again')}`);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const filteredDeals = useMemo(() => {
    const term = search.trim().toLowerCase();
    return deals.filter((d) => {
      if (agent !== 'ALL' && d.assignedAgentId !== agent) return false;
      if (term) {
        const hay = `${d.title} ${d.client?.fullName ?? ''} ${d.client?.phone ?? ''} ${
          d.property?.title ?? ''
        } ${d.property?.city ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [deals, search, agent]);

  /** Grouped by status, in column order. */
  const dealsByStatus = useMemo(() => {
    const groups = new Map<DealStatus, Deal[]>();
    for (const col of COLUMNS) groups.set(col.status, []);
    for (const d of filteredDeals) {
      const bucket = groups.get(d.status);
      if (bucket) bucket.push(d);
    }
    return groups;
  }, [filteredDeals]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const d = deals.find((x) => x.id === event.active.id);
    if (d) setActiveDeal(d);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);
    if (!over) return;

    const dealId = active.id as string;
    const nextStatus = over.id as DealStatus;
    const d = deals.find((x) => x.id === dealId);
    if (!d || d.status === nextStatus) return;

    // Optimistic update first; rollback if the server rejects.
    const prevStatus = d.status;
    setDeals((prev) =>
      prev.map((x) => (x.id === dealId ? { ...x, status: nextStatus } : x)),
    );

    try {
      const updated = await dealsApi.update(dealId, { status: nextStatus });
      setDeals((prev) => prev.map((x) => (x.id === dealId ? updated : x)));
    } catch (e) {
      setDeals((prev) =>
        prev.map((x) => (x.id === dealId ? { ...x, status: prevStatus } : x)),
      );
      window.alert(
        `Failed to move deal: ${extractApiError(e, 'Permission denied or network error')}`,
      );
    }
  };

  const hasActiveFilter = !!search || agent !== 'ALL';

  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in" data-testid="deal-board-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="deal-board-back-to-list"
          >
            <Link to="/deals">
              <ArrowLeft size={14} className="mr-1.5" /> List view
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-semibold tracking-tight">Deal Board</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading
                ? 'Loading…'
                : `${filteredDeals.length} of ${deals.length} deal${deals.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card data-testid="deal-board-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <Input
                className="pl-9"
                placeholder="Search title, client, property…"
                value={search}
                onChange={(e) => updateFilter('search', e.target.value)}
                data-testid="deal-board-search-input"
              />
            </div>

            {isAdmin && (
              <Select value={agent} onValueChange={(v) => updateFilter('agent', v)}>
                <SelectTrigger className="w-[180px]" data-testid="deal-board-agent-filter">
                  <SelectValue placeholder="Agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All agents</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="deal-board-clear-filters"
              >
                <X size={14} className="mr-1" /> Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Board */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-2" data-testid="deal-board-loading">
          {COLUMNS.map((c) => (
            <div key={c.status} className="w-[280px] sm:w-[300px] shrink-0 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : deals.length === 0 ? (
        <Card data-testid="deal-board-empty-state">
          <CardContent className="py-16 text-center space-y-2">
            <List size={28} className="mx-auto text-muted-foreground" />
            <p className="font-medium">No deals yet</p>
            <p className="text-sm text-muted-foreground">
              Add a deal from the list view to see them on the board.
            </p>
            <Button variant="outline" size="sm" asChild className="mt-3">
              <Link to="/deals">Go to list view</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div
            className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden pb-2 -mx-2 px-2 min-h-[400px]"
            data-testid="deal-board"
          >
            {COLUMNS.map((col) => (
              <DealBoardColumn
                key={col.status}
                status={col.status}
                label={col.label}
                accent={col.accent}
                deals={dealsByStatus.get(col.status) ?? []}
                onOpenDeal={(id) => navigate(`/deals/${id}`)}
                isAnyDragging={!!activeDeal}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeDeal ? (
              <DealBoardCard deal={activeDeal} onOpen={() => undefined} overlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

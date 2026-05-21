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
import { Search, X, Loader2 } from 'lucide-react';
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
import { LeadCard } from '@/components/pipeline/LeadCard';
import { PipelineColumn } from '@/components/pipeline/PipelineColumn';
import { leadsApi, agentsApi, type AgentOption } from '@/services/leads';
import { followUpsApi } from '@/services/followups';
import { extractApiError } from '@/services/api';
import type { Lead, FollowUp, LeadStatus, LeadSource } from '@/types';

/**
 * Kanban-style Lead Pipeline.
 *
 * Data flow:
 *   1. Mount: fetch ALL leads (limit=500) + all PENDING follow-ups in parallel.
 *      We deliberately fetch leads in one shot rather than per-column because
 *      drag-and-drop needs the full set in-memory anyway, and the existing
 *      `/api/leads` endpoint is already RBAC-scoped (AGENT → own).
 *   2. Filter client-side by search + agent + source. Status is implicit
 *      since each column owns its status.
 *   3. On drop: optimistic update → leadsApi.update() → revert on failure.
 *
 * URL state: `?search=&agent=&source=` is the single source of truth for
 * filters (shareable links + browser back/forward both work).
 */

const COLUMNS: { status: LeadStatus; label: string; accent: string }[] = [
  { status: 'NEW',         label: 'New',          accent: 'bg-blue-50    dark:bg-blue-950/30' },
  { status: 'CONTACTED',   label: 'Contacted',    accent: 'bg-amber-50   dark:bg-amber-950/30' },
  { status: 'QUALIFIED',   label: 'Qualified',    accent: 'bg-violet-50  dark:bg-violet-950/30' },
  { status: 'NEGOTIATING', label: 'Negotiating',  accent: 'bg-orange-50  dark:bg-orange-950/30' },
  { status: 'WON',         label: 'Won',          accent: 'bg-emerald-50 dark:bg-emerald-950/30' },
  { status: 'LOST',        label: 'Lost',         accent: 'bg-slate-100  dark:bg-slate-900/40' },
];

const SOURCE_OPTIONS: { value: LeadSource | 'ALL'; label: string }[] = [
  { value: 'ALL',             label: 'All sources' },
  { value: 'FACEBOOK',        label: 'Facebook' },
  { value: 'WHATSAPP',        label: 'WhatsApp' },
  { value: 'WEBSITE',         label: 'Website' },
  { value: 'REFERRAL',        label: 'Referral' },
  { value: 'MANUAL',          label: 'Manual' },
  { value: 'PROPERTY_PORTAL', label: 'Property Portal' },
  { value: 'OTHER',           label: 'Other' },
];

export default function PipelinePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-backed filter state — re-derived from the query string so the
  // browser history is the single source of truth.
  const search = searchParams.get('search') ?? '';
  const agent  = searchParams.get('agent')  ?? 'ALL';
  const source = (searchParams.get('source') as LeadSource | 'ALL' | null) ?? 'ALL';

  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  const updateFilter = (key: 'search' | 'agent' | 'source', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'ALL') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => setSearchParams({}, { replace: true });

  // ── Data fetch ────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [leadsRes, agentsRes, fusRes] = await Promise.all([
        leadsApi.list({ limit: 500 }),
        agentsApi.list().catch(() => [] as AgentOption[]),
        followUpsApi.list({ status: 'PENDING', limit: 500 }).catch(() => ({ followUps: [] as FollowUp[] })),
      ]);
      setLeads(leadsRes.leads);
      setAgents(agentsRes);
      setFollowUps(fusRes.followUps);
    } catch (e) {
      window.alert(`Failed to load pipeline: ${extractApiError(e, 'Please try again')}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived state ─────────────────────────────────────────────────────────

  /** leadId → soonest pending follow-up for that lead. */
  const nextFollowUps = useMemo(() => {
    const map = new Map<string, FollowUp>();
    // Pre-sort by date so the FIRST insertion per leadId is the soonest one.
    const sorted = [...followUps].sort(
      (a, b) => new Date(a.followUpDate).getTime() - new Date(b.followUpDate).getTime(),
    );
    for (const fu of sorted) {
      if (!map.has(fu.leadId)) map.set(fu.leadId, fu);
    }
    return map;
  }, [followUps]);

  const filteredLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (agent !== 'ALL' && l.assignedAgentId !== agent) return false;
      if (source !== 'ALL' && l.source !== source) return false;
      if (term) {
        const hay = `${l.fullName} ${l.phone ?? ''} ${l.email ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [leads, search, agent, source]);

  /** Grouped by status, in column order. */
  const leadsByStatus = useMemo(() => {
    const groups = new Map<LeadStatus, Lead[]>();
    for (const col of COLUMNS) groups.set(col.status, []);
    for (const l of filteredLeads) {
      const bucket = groups.get(l.status);
      if (bucket) bucket.push(l);
    }
    return groups;
  }, [filteredLeads]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const lead = leads.find((l) => l.id === event.active.id);
    if (lead) setActiveLead(lead);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveLead(null);
    if (!over) return;

    const leadId = active.id as string;
    const nextStatus = over.id as LeadStatus;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === nextStatus) return;

    // Optimistic update — swap status locally first.
    const prevStatus = lead.status;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: nextStatus } : l)));

    try {
      const updated = await leadsApi.update(leadId, { status: nextStatus });
      // Reconcile with server payload (assignedAgent / updatedAt may have shifted).
      setLeads((prev) => prev.map((l) => (l.id === leadId ? updated : l)));
    } catch (e) {
      // Rollback on failure.
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: prevStatus } : l)));
      window.alert(`Failed to move lead: ${extractApiError(e, 'Permission denied or network error')}`);
    }
  };

  const hasActiveFilter = !!search || agent !== 'ALL' || source !== 'ALL';

  return (
    <div className="flex flex-col h-full space-y-4 animate-fade-in" data-testid="pipeline-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading
              ? 'Loading…'
              : `${filteredLeads.length} of ${leads.length} lead${leads.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card data-testid="pipeline-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search name, phone, email…"
                value={search}
                onChange={(e) => updateFilter('search', e.target.value)}
                data-testid="pipeline-search-input"
              />
            </div>

            <Select value={agent} onValueChange={(v) => updateFilter('agent', v)}>
              <SelectTrigger className="w-[180px]" data-testid="pipeline-agent-filter">
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

            <Select value={source} onValueChange={(v) => updateFilter('source', v)}>
              <SelectTrigger className="w-[160px]" data-testid="pipeline-source-filter">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                data-testid="pipeline-clear-filters"
              >
                <X size={14} className="mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Board */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-2" data-testid="pipeline-loading">
          {COLUMNS.map((c) => (
            <div key={c.status} className="w-[280px] sm:w-[300px] shrink-0 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      ) : leads.length === 0 ? (
        <Card data-testid="pipeline-empty-state">
          <CardContent className="py-16 text-center space-y-2">
            <Loader2 size={28} className="mx-auto text-muted-foreground" />
            <p className="font-medium">No leads yet</p>
            <p className="text-sm text-muted-foreground">
              Add a lead from the Leads page to see them appear here.
            </p>
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
            data-testid="pipeline-board"
          >
            {COLUMNS.map((col) => (
              <PipelineColumn
                key={col.status}
                status={col.status}
                label={col.label}
                accent={col.accent}
                leads={leadsByStatus.get(col.status) ?? []}
                nextFollowUps={nextFollowUps}
                onOpenLead={(id) => navigate(`/leads/${id}`)}
                isAnyDragging={!!activeLead}
              />
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeLead ? (
              <LeadCard
                lead={activeLead}
                followUp={nextFollowUps.get(activeLead.id)}
                onOpen={() => undefined}
                overlay
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}

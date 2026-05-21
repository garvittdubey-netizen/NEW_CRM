import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Kanban,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DealCard } from '@/components/deals/DealCard';
import { DealListRow } from '@/components/deals/DealListRow';
import { DealFormModal } from '@/components/deals/DealFormModal';
import { dealsApi, type DealListParams } from '@/services/deals';
import { agentsApi, type AgentOption } from '@/services/leads';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Deal, DealsResponse, DealStatus } from '@/types';
import { isAdminLevel } from '@/lib/roles';

type ViewMode = 'grid' | 'list';

const PAGE_LIMIT = 12;

const STATUS_OPTIONS: Array<{ value: 'ALL' | DealStatus; label: string }> = [
  { value: 'ALL', label: 'All status' },
  { value: 'NEW', label: 'New' },
  { value: 'NEGOTIATION', label: 'Negotiation' },
  { value: 'DOCUMENTATION', label: 'Documentation' },
  { value: 'PAYMENT_PENDING', label: 'Payment Pending' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

export default function DealsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | DealStatus>('ALL');
  const [assignedAgentId, setAssignedAgentId] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('deals:view') as ViewMode) || 'grid',
  );

  const [data, setData] = useState<DealsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentOption[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  useEffect(() => {
    localStorage.setItem('deals:view', view);
  }, [view]);

  useEffect(() => {
    if (!isAdmin) return;
    agentsApi.list().then(setAgents).catch(() => setAgents([]));
  }, [isAdmin]);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    const params: DealListParams = {
      page,
      limit: PAGE_LIMIT,
      search: search || undefined,
      status: status !== 'ALL' ? status : undefined,
      assignedAgentId: isAdmin && assignedAgentId !== 'ALL' ? assignedAgentId : undefined,
    };
    try {
      const result = await dealsApi.list(params);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, assignedAgentId, isAdmin]);

  useEffect(() => {
    const delay = search ? 400 : 0;
    const t = setTimeout(fetchDeals, delay);
    return () => clearTimeout(t);
  }, [fetchDeals]);

  useEffect(() => {
    setPage(1);
  }, [search, status, assignedAgentId]);

  const openCreate = () => {
    setEditingDeal(null);
    setModalOpen(true);
  };
  const openEdit = (d: Deal) => {
    setEditingDeal(d);
    setModalOpen(true);
  };

  const handleDelete = async (d: Deal) => {
    if (!window.confirm(`Delete deal "${d.title}"? This cannot be undone.`)) return;
    try {
      await dealsApi.delete(d.id);
      fetchDeals();
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to delete deal.'));
    }
  };

  const hasFilters = !!search || status !== 'ALL' || assignedAgentId !== 'ALL';

  return (
    <div className="space-y-5 animate-fade-in" data-testid="deals-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Deals</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${data.total} ${data.total === 1 ? 'deal' : 'deals'}` : 'Track every transaction'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-card p-0.5" data-testid="deals-view-toggle">
            <button
              onClick={() => setView('grid')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="deals-view-grid"
              aria-label="Grid view"
            >
              <LayoutGrid size={13} /> Grid
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="deals-view-list"
              aria-label="List view"
            >
              <List size={13} /> List
            </button>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/deals/board')}
            data-testid="open-deal-board-button"
          >
            <Kanban size={16} className="mr-1.5" /> Board
          </Button>
          <Button onClick={openCreate} data-testid="add-deal-button">
            <Plus size={16} className="mr-1.5" /> Add Deal
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card data-testid="deals-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search title, notes, client, property..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="deals-search-input"
              />
            </div>

            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-[170px]" data-testid="deals-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isAdmin && (
              <Select value={assignedAgentId} onValueChange={setAssignedAgentId}>
                <SelectTrigger className="w-[180px]" data-testid="deals-agent-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Agents</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setStatus('ALL');
                  setAssignedAgentId('ALL');
                }}
                data-testid="deals-clear-filters"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        view === 'grid' ? <GridSkeleton /> : <ListSkeleton />
      ) : !data?.deals.length ? (
        <EmptyState onAdd={openCreate} hasFilters={hasFilters} />
      ) : view === 'grid' ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
          data-testid="deals-grid"
        >
          {data.deals.map((d) => (
            <DealCard key={d.id} deal={d} onEdit={openEdit} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <Card data-testid="deals-list">
          <CardContent className="p-0">
            {data.deals.map((d) => (
              <DealListRow key={d.id} deal={d} onEdit={openEdit} onDelete={handleDelete} />
            ))}
          </CardContent>
        </Card>
      )}

      {data && data.pages > 1 && <Pagination data={data} page={page} onPage={setPage} />}

      <DealFormModal
        open={modalOpen}
        deal={editingDeal}
        onClose={() => setModalOpen(false)}
        onSuccess={fetchDeals}
      />
    </div>
  );
}

function Pagination({
  data,
  page,
  onPage,
}: {
  data: DealsResponse;
  page: number;
  onPage: (p: number) => void;
}) {
  const start = (data.page - 1) * data.limit + 1;
  const end = Math.min(data.page * data.limit, data.total);
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="deals-pagination">
      <span>
        {start}–{end} of {data.total}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          data-testid="deals-pagination-prev"
        >
          <ChevronLeft size={14} />
        </Button>
        <span className="px-3 py-1.5 text-xs font-medium">
          {page} / {data.pages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= data.pages}
          data-testid="deals-pagination-next"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-lg" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-md" />
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState({ onAdd, hasFilters }: { onAdd: () => void; hasFilters: boolean }) {
  return (
    <Card data-testid="deals-empty">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <TrendingUp size={22} className="text-muted-foreground" />
        </div>
        <p className="font-medium mb-1">
          {hasFilters ? 'No deals match your filters' : 'No deals yet'}
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          {hasFilters
            ? 'Try clearing some filters to widen the search'
            : 'Add your first deal to start tracking transactions'}
        </p>
        {!hasFilters && (
          <Button size="sm" onClick={onAdd}>
            <Plus size={14} className="mr-1.5" /> Add Deal
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

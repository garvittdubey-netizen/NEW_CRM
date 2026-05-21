import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Users as UsersIcon,
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
import { ClientCard } from '@/components/clients/ClientCard';
import { ClientListRow } from '@/components/clients/ClientListRow';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { clientsApi, type ClientListParams } from '@/services/clients';
import { agentsApi, type AgentOption } from '@/services/leads';
import { useAuth } from '@/hooks/useAuth';
import type { ClientsResponse } from '@/types';
import { isAdminLevel } from '@/lib/roles';

type ViewMode = 'grid' | 'list';

const PAGE_LIMIT = 12;

export default function ClientsPage() {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);

  const [search, setSearch] = useState('');
  const [assignedAgentId, setAssignedAgentId] = useState<string>('ALL');
  const [linkedFilter, setLinkedFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('clients:view') as ViewMode) || 'grid',
  );

  const [data, setData] = useState<ClientsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('clients:view', view);
  }, [view]);

  // Agent filter dropdown is admin-only (an AGENT only sees their own clients
  // already because of server-side RBAC scoping).
  useEffect(() => {
    if (!isAdmin) return;
    agentsApi.list().then(setAgents).catch(() => setAgents([]));
  }, [isAdmin]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    const params: ClientListParams = {
      page,
      limit: PAGE_LIMIT,
      search: search || undefined,
      assignedAgentId: isAdmin && assignedAgentId !== 'ALL' ? assignedAgentId : undefined,
      linkedLeadId:
        linkedFilter === 'LINKED' ? undefined : linkedFilter === 'UNLINKED' ? 'NONE' : undefined,
    };
    try {
      const result = await clientsApi.list(params);
      // If the user picked "LINKED", filter client-side since we don't have a
      // boolean linked filter in the API (we only support "no link / specific lead").
      if (linkedFilter === 'LINKED') {
        result.clients = result.clients.filter((c) => c.linkedLeadId !== null);
        result.total = result.clients.length;
      }
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, assignedAgentId, linkedFilter, isAdmin]);

  useEffect(() => {
    const delay = search ? 400 : 0;
    const t = setTimeout(fetchClients, delay);
    return () => clearTimeout(t);
  }, [fetchClients]);

  useEffect(() => {
    setPage(1);
  }, [search, assignedAgentId, linkedFilter]);

  const hasFilters =
    !!search || assignedAgentId !== 'ALL' || linkedFilter !== 'ALL';

  return (
    <div className="space-y-5 animate-fade-in" data-testid="clients-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${data.total} ${data.total === 1 ? 'client' : 'clients'}` : 'Manage your clientele'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-card p-0.5" data-testid="clients-view-toggle">
            <button
              onClick={() => setView('grid')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="clients-view-grid"
              aria-label="Grid view"
            >
              <LayoutGrid size={13} /> Grid
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="clients-view-list"
              aria-label="List view"
            >
              <List size={13} /> List
            </button>
          </div>
          <Button onClick={() => setAddOpen(true)} data-testid="add-client-button">
            <Plus size={16} className="mr-1.5" /> Add Client
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card data-testid="clients-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search name, phone, email, location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="clients-search-input"
              />
            </div>

            {isAdmin && (
              <Select value={assignedAgentId} onValueChange={setAssignedAgentId}>
                <SelectTrigger className="w-[180px]" data-testid="clients-agent-filter">
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

            <Select value={linkedFilter} onValueChange={setLinkedFilter}>
              <SelectTrigger className="w-[160px]" data-testid="clients-linked-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Any link state</SelectItem>
                <SelectItem value="LINKED">With linked lead</SelectItem>
                <SelectItem value="UNLINKED">Without linked lead</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setAssignedAgentId('ALL');
                  setLinkedFilter('ALL');
                }}
                data-testid="clients-clear-filters"
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
      ) : !data?.clients.length ? (
        <EmptyState onAdd={() => setAddOpen(true)} hasFilters={hasFilters} />
      ) : view === 'grid' ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          data-testid="clients-grid"
        >
          {data.clients.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      ) : (
        <Card data-testid="clients-list">
          <CardContent className="p-0">
            {data.clients.map((c) => (
              <ClientListRow key={c.id} client={c} />
            ))}
          </CardContent>
        </Card>
      )}

      {data && data.pages > 1 && <Pagination data={data} page={page} onPage={setPage} />}

      <ClientFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchClients}
      />
    </div>
  );
}

function Pagination({
  data,
  page,
  onPage,
}: {
  data: ClientsResponse;
  page: number;
  onPage: (p: number) => void;
}) {
  const start = (data.page - 1) * data.limit + 1;
  const end = Math.min(data.page * data.limit, data.total);
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="clients-pagination">
      <span>
        {start}–{end} of {data.total}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          data-testid="clients-pagination-prev"
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
          data-testid="clients-pagination-next"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-lg" />
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
    <Card data-testid="clients-empty">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <UsersIcon size={22} className="text-muted-foreground" />
        </div>
        <p className="font-medium mb-1">
          {hasFilters ? 'No clients match your filters' : 'No clients yet'}
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          {hasFilters
            ? 'Try clearing some filters to widen the search'
            : 'Add your first client to start tracking relationships'}
        </p>
        {!hasFilters && (
          <Button size="sm" onClick={onAdd}>
            <Plus size={14} className="mr-1.5" /> Add Client
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

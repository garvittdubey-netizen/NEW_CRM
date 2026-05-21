import { useState, useEffect, useCallback } from 'react';
import { Plus, LayoutGrid, List, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { PropertyListRow } from '@/components/properties/PropertyListRow';
import { PropertyFormModal } from '@/components/properties/PropertyFormModal';
import {
  PropertyFiltersPanel,
  EMPTY_FILTERS,
  type PropertyFilters,
} from '@/components/properties/PropertyFiltersPanel';
import { propertiesApi, type PropertyListParams } from '@/services/properties';
import type { PropertiesResponse } from '@/types';

type ViewMode = 'grid' | 'list';

const PAGE_LIMIT = 12;

export default function PropertiesPage() {
  const [filters, setFilters] = useState<PropertyFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem('properties:view') as ViewMode) || 'grid',
  );

  const [data, setData] = useState<PropertiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('properties:view', view);
  }, [view]);

  const fetchProperties = useCallback(async () => {
    setLoading(true);
    const params: PropertyListParams = {
      page,
      limit: PAGE_LIMIT,
      search: filters.search || undefined,
      propertyType: filters.propertyType !== 'ALL' ? filters.propertyType : undefined,
      city: filters.city || undefined,
      status: filters.status !== 'ALL' ? filters.status : undefined,
      minPrice: filters.minPrice ? Number(filters.minPrice) : undefined,
      maxPrice: filters.maxPrice ? Number(filters.maxPrice) : undefined,
    };
    try {
      const result = await propertiesApi.list(params);
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  // Debounce: 400ms for text inputs, immediate for selects.
  useEffect(() => {
    const delay = filters.search || filters.city || filters.minPrice || filters.maxPrice ? 400 : 0;
    const t = setTimeout(fetchProperties, delay);
    return () => clearTimeout(t);
  }, [fetchProperties]);

  // Reset to first page when filters change.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  return (
    <div className="space-y-5 animate-fade-in" data-testid="properties-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${data.total} ${data.total === 1 ? 'listing' : 'listings'}` : 'Manage your inventory'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border bg-card p-0.5" data-testid="properties-view-toggle">
            <button
              onClick={() => setView('grid')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="view-grid-button"
              aria-label="Grid view"
            >
              <LayoutGrid size={13} /> Grid
            </button>
            <button
              onClick={() => setView('list')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              data-testid="view-list-button"
              aria-label="List view"
            >
              <List size={13} /> List
            </button>
          </div>
          <Button onClick={() => setAddOpen(true)} data-testid="add-property-button">
            <Plus size={16} className="mr-1.5" /> Add Property
          </Button>
        </div>
      </div>

      {/* Two-column layout: filters sidebar + results */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <PropertyFiltersPanel
            filters={filters}
            onChange={setFilters}
            onClear={() => setFilters(EMPTY_FILTERS)}
          />
        </aside>

        <div className="min-w-0 space-y-4">
          {loading ? (
            view === 'grid' ? <GridSkeleton /> : <ListSkeleton />
          ) : !data?.properties.length ? (
            <EmptyState onAdd={() => setAddOpen(true)} hasFilters={hasFilters(filters)} />
          ) : view === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="properties-grid">
              {data.properties.map((p) => (
                <PropertyCard key={p.id} property={p} />
              ))}
            </div>
          ) : (
            <Card data-testid="properties-list">
              <CardContent className="p-0">
                {data.properties.map((p) => (
                  <PropertyListRow key={p.id} property={p} />
                ))}
              </CardContent>
            </Card>
          )}

          {data && data.pages > 1 && (
            <Pagination data={data} page={page} onPage={setPage} />
          )}
        </div>
      </div>

      <PropertyFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchProperties}
      />
    </div>
  );
}

function hasFilters(f: PropertyFilters): boolean {
  return !!(
    f.search ||
    f.city ||
    f.minPrice ||
    f.maxPrice ||
    f.propertyType !== 'ALL' ||
    f.status !== 'ALL'
  );
}

function Pagination({
  data,
  page,
  onPage,
}: {
  data: PropertiesResponse;
  page: number;
  onPage: (p: number) => void;
}) {
  const start = (data.page - 1) * data.limit + 1;
  const end = Math.min(data.page * data.limit, data.total);
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground" data-testid="properties-pagination">
      <span>
        {start}–{end} of {data.total}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          data-testid="properties-pagination-prev"
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
          data-testid="properties-pagination-next"
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
        <Skeleton key={i} className="h-72 w-full rounded-lg" />
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-md" />
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState({ onAdd, hasFilters }: { onAdd: () => void; hasFilters: boolean }) {
  return (
    <Card data-testid="properties-empty">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Building2 size={22} className="text-muted-foreground" />
        </div>
        <p className="font-medium mb-1">
          {hasFilters ? 'No properties match your filters' : 'No properties yet'}
        </p>
        <p className="text-sm text-muted-foreground mb-4">
          {hasFilters
            ? 'Try clearing some filters to widen the search'
            : 'Add your first property listing to get started'}
        </p>
        {!hasFilters && (
          <Button size="sm" onClick={onAdd}>
            <Plus size={14} className="mr-1.5" />
            Add Property
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Eye, Pencil, Trash2, UserCircle, ChevronLeft, ChevronRight, MessageSquare, Upload, Download } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/leads/StatusBadge';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import { ImportLeadsModal } from '@/components/leads/ImportLeadsModal';
import { leadsApi } from '@/services/leads';
import api, { extractApiError } from '@/services/api';
import type { Lead, LeadsResponse } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { isAdminLevel } from '@/lib/roles';

function formatBudget(budget: number | null): string {
  if (!budget) return '—';
  if (budget >= 10000000) return `₹${(budget / 10000000).toFixed(1)}Cr`;
  if (budget >= 100000) return `₹${(budget / 100000).toFixed(1)}L`;
  return `₹${budget.toLocaleString('en-IN')}`;
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [propertyType, setPropertyType] = useState('ALL');
  const [page, setPage] = useState(1);
  const LIMIT = 20;

  const [data, setData] = useState<LeadsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const isAdmin = isAdminLevel(user?.role);

  const handleExport = async () => {
    try {
      const res = await api.get('/leads/export', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to export leads'));
    }
  };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const result = await leadsApi.list({
        page,
        limit: LIMIT,
        search: search || undefined,
        status: status !== 'ALL' ? status : undefined,
        propertyType: propertyType !== 'ALL' ? propertyType : undefined,
      });
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, propertyType]);

  // Debounce search, immediate for other filter changes
  useEffect(() => {
    const delay = search ? 400 : 0;
    const t = setTimeout(fetchLeads, delay);
    return () => clearTimeout(t);
  }, [fetchLeads]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [search, status, propertyType]);

  const handleDelete = async (lead: Lead) => {
    if (!window.confirm(`Delete lead "${lead.fullName}"? This cannot be undone.`)) return;
    try {
      await leadsApi.delete(lead.id);
      fetchLeads();
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to delete lead.'));
    }
  };

  return (
    <div className="space-y-5 animate-fade-in" data-testid="leads-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {data ? `${data.total} lead${data.total !== 1 ? 's' : ''}` : 'Manage your leads'}
          </p>
        </div>
        <div className="flex items-center gap-2" data-testid="leads-header-actions">
          <Button
            variant="outline"
            onClick={handleExport}
            data-testid="export-leads-button"
          >
            <Download size={15} className="mr-1.5" />
            Export
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              onClick={() => setImportOpen(true)}
              data-testid="import-leads-button"
            >
              <Upload size={15} className="mr-1.5" />
              Import
            </Button>
          )}
          <Button onClick={() => setAddOpen(true)} data-testid="add-lead-button">
            <Plus size={16} className="mr-1.5" />
            Add Lead
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card data-testid="leads-filters">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search name, phone, email, location..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="leads-search-input"
              />
            </div>

            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]" data-testid="leads-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="NEW">New</SelectItem>
                <SelectItem value="CONTACTED">Contacted</SelectItem>
                <SelectItem value="QUALIFIED">Qualified</SelectItem>
                <SelectItem value="NEGOTIATING">Negotiating</SelectItem>
                <SelectItem value="WON">Won</SelectItem>
                <SelectItem value="LOST">Lost</SelectItem>
              </SelectContent>
            </Select>

            <Select value={propertyType} onValueChange={setPropertyType}>
              <SelectTrigger className="w-[150px]" data-testid="leads-property-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types</SelectItem>
                <SelectItem value="Apartment">Apartment</SelectItem>
                <SelectItem value="Villa">Villa</SelectItem>
                <SelectItem value="Plot">Plot</SelectItem>
                <SelectItem value="Commercial">Commercial</SelectItem>
              </SelectContent>
            </Select>

            {(search || status !== 'ALL' || propertyType !== 'ALL') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(''); setStatus('ALL'); setPropertyType('ALL'); }}
                data-testid="clear-filters-button"
              >
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card data-testid="leads-table-card">
        <CardContent className="p-0">
          {loading ? (
            <LeadTableSkeleton />
          ) : !data?.leads.length ? (
            <LeadEmptyState
              hasFilters={!!(search || status !== 'ALL' || propertyType !== 'ALL')}
              onAdd={() => setAddOpen(true)}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="leads-table">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      {['Lead', 'Contact', 'Status', 'Property', 'Budget', 'Agent', 'Added', ''].map((h) => (
                        <th
                          key={h}
                          className={`text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap ${
                            h === 'Budget' || h === 'Agent' ? 'hidden lg:table-cell' : ''
                          } ${h === 'Added' ? 'hidden xl:table-cell' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.leads.map((lead) => (
                      <LeadTableRow
                        key={lead.id}
                        lead={lead}
                        isAdmin={isAdmin}
                        onView={() => navigate(`/leads/${lead.id}`)}
                        onEdit={() => setEditLead(lead)}
                        onDelete={() => handleDelete(lead)}
                        onMessage={() => navigate(`/communications?leadId=${lead.id}`)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {data.pages > 1 && (
                <LeadPagination data={data} page={page} onPage={setPage} />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Modal */}
      <LeadFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchLeads}
      />

      {/* Edit Modal */}
      <LeadFormModal
        open={!!editLead}
        lead={editLead}
        onClose={() => setEditLead(null)}
        onSuccess={() => { fetchLeads(); setEditLead(null); }}
      />

      {/* Import CSV Modal */}
      <ImportLeadsModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={fetchLeads}
      />
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LeadTableRow({
  lead,
  isAdmin,
  onView,
  onEdit,
  onDelete,
  onMessage,
}: {
  lead: Lead;
  isAdmin: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMessage: () => void;
}) {
  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/30 transition-colors group"
      data-testid={`lead-row-${lead.id}`}
    >
      {/* Name */}
      <td className="px-4 py-3">
        <button
          onClick={onView}
          className="flex items-center gap-2.5 text-left hover:text-primary transition-colors"
        >
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
            {lead.fullName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium leading-tight">{lead.fullName}</p>
            {lead.preferredLocation && (
              <p className="text-xs text-muted-foreground">{lead.preferredLocation}</p>
            )}
          </div>
        </button>
      </td>

      {/* Contact */}
      <td className="px-4 py-3">
        <p className="text-muted-foreground">{lead.phone || '—'}</p>
        {lead.email && <p className="text-xs text-muted-foreground">{lead.email}</p>}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={lead.status} />
        {lead.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {lead.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 bg-muted rounded-full text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {lead.tags.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{lead.tags.length - 2}</span>
            )}
          </div>
        )}
      </td>

      {/* Property */}
      <td className="px-4 py-3">
        <p>{lead.propertyType || '—'}</p>
        {lead.bhk && <p className="text-xs text-muted-foreground">{lead.bhk}</p>}
      </td>

      {/* Budget */}
      <td className="px-4 py-3 hidden lg:table-cell font-medium">
        {formatBudget(lead.budget)}
      </td>

      {/* Agent */}
      <td className="px-4 py-3 hidden lg:table-cell">
        {lead.assignedAgent ? (
          <div className="flex items-center gap-1.5">
            <UserCircle size={14} className="text-muted-foreground" />
            <span className="text-sm">{lead.assignedAgent.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">Unassigned</span>
        )}
      </td>

      {/* Date */}
      <td className="px-4 py-3 text-muted-foreground hidden xl:table-cell">
        {new Date(lead.createdAt).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
        })}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-30"
            onClick={onMessage}
            disabled={!lead.phone}
            data-testid={`message-lead-${lead.id}`}
            title={lead.phone ? 'Open WhatsApp chat' : 'No phone on file'}
          >
            <MessageSquare size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onView} data-testid={`view-lead-${lead.id}`}>
            <Eye size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} data-testid={`edit-lead-${lead.id}`}>
            <Pencil size={13} />
          </Button>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:text-destructive"
              onClick={onDelete}
              data-testid={`delete-lead-${lead.id}`}
            >
              <Trash2 size={13} />
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function LeadPagination({
  data,
  page,
  onPage,
}: {
  data: LeadsResponse;
  page: number;
  onPage: (p: number) => void;
}) {
  const start = (data.page - 1) * data.limit + 1;
  const end = Math.min(data.page * data.limit, data.total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground" data-testid="leads-pagination">
      <span>
        {start}–{end} of {data.total}
      </span>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          data-testid="pagination-prev"
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
          data-testid="pagination-next"
        >
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function LeadTableSkeleton() {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  );
}

function LeadEmptyState({ hasFilters, onAdd }: { hasFilters: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4" data-testid="leads-empty">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <UserCircle size={22} className="text-muted-foreground" />
      </div>
      <p className="font-medium mb-1">{hasFilters ? 'No leads match your filters' : 'No leads yet'}</p>
      <p className="text-sm text-muted-foreground mb-4">
        {hasFilters
          ? 'Try adjusting your search or filters'
          : 'Add your first lead to get started'}
      </p>
      {!hasFilters && (
        <Button size="sm" onClick={onAdd}>
          <Plus size={14} className="mr-1.5" />
          Add Lead
        </Button>
      )}
    </div>
  );
}

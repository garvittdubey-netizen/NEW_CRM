import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MapPin,
  Link2,
  UserCircle,
  Wallet,
  MessageSquare,
  PlusCircle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/leads/StatusBadge';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { ClientActivityTimeline } from '@/components/clients/ClientActivityTimeline';
import { ReactivateLeadModal } from '@/components/clients/ReactivateLeadModal';
import { DealFormModal } from '@/components/deals/DealFormModal';
import { clientsApi } from '@/services/clients';
import { dealsApi } from '@/services/deals';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Client, ClientTimelineItem, Deal } from '@/types';
import { isAdminLevel } from '@/lib/roles';

function formatBudget(value: number | null): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

export default function ClientDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Banner shown right after a lead → client conversion. The
  // `?converted=1` flag is set by LeadDetailPage's onSuccess redirect.
  const justConverted = searchParams.get('converted') === '1';

  const [client, setClient] = useState<Client | null>(null);
  const [timeline, setTimeline] = useState<ClientTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [reactivatedBanner, setReactivatedBanner] = useState<null | {
    mode: 'RESTORED' | 'CREATED';
    leadId: string;
  }>(null);
  // Existing deals for this client. Surface (a) the count next to the CTA
  // and (b) a compact list in the right sidebar so the page is the source
  // of truth for the client→deal relationship.
  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);
  const [error, setError] = useState('');

  const isAdmin = isAdminLevel(user?.role);
  const canManage = isAdmin || (client?.assignedAgentId && client.assignedAgentId === user?.id);

  const fetchClient = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setClient(await clientsApi.get(id));
    } catch (e) {
      setError(extractApiError(e, 'Client not found'));
      setClient(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      setTimeline(await clientsApi.timeline(id));
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [id]);

  const fetchDeals = useCallback(async () => {
    setDealsLoading(true);
    try {
      const r = await dealsApi.list({ clientId: id, limit: 25 });
      setDeals(r.deals);
    } catch {
      setDeals([]);
    } finally {
      setDealsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchClient();
    fetchTimeline();
    fetchDeals();
  }, [fetchClient, fetchTimeline, fetchDeals]);

  const handleDelete = async () => {
    if (!client) return;
    if (!window.confirm(`Delete client "${client.fullName}"? This cannot be undone.`)) return;
    try {
      await clientsApi.delete(client.id);
      navigate('/clients');
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to delete client.'));
    }
  };

  if (loading) return <DetailSkeleton />;

  if (error || !client) {
    return (
      <div className="space-y-4" data-testid="client-detail-error">
        <Button variant="ghost" size="sm" onClick={() => navigate('/clients')}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to clients
        </Button>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">{error || 'Client not found.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" data-testid="client-detail-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/clients')}
          data-testid="back-to-clients-button"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Back
        </Button>
        {canManage && (
          <div className="flex gap-2 flex-wrap">
            {/* Client → Deal conversion. Visible to ADMIN + assigned agent.
                The DealFormModal opens with client + agent pre-locked, so
                the user only chooses property + amount + closing date. */}
            <Button
              size="sm"
              onClick={() => setDealOpen(true)}
              data-testid="create-deal-button"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <PlusCircle size={13} className="mr-1.5" />
              Create Deal
              {deals.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">
                  {deals.length}
                </span>
              )}
            </Button>
            {client.phone && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  client.linkedLeadId
                    ? navigate(`/communications?leadId=${client.linkedLeadId}`)
                    : window.alert('Link a lead first to start a conversation.')
                }
                data-testid="client-message-button"
              >
                <MessageSquare size={13} className="mr-1.5" /> Message
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReactivateOpen(true)}
              data-testid="reactivate-lead-button"
              className="text-primary hover:text-primary"
              title="Reactivate this client back into active lead nurturing"
            >
              <RotateCcw size={13} className="mr-1.5" /> Reactivate Lead
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              data-testid="edit-client-button"
            >
              <Pencil size={13} className="mr-1.5" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
              data-testid="delete-client-button"
            >
              <Trash2 size={13} className="mr-1.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Conversion success banner — dismissable, surfaces once per redirect */}
      {justConverted && (
        <div
          className="flex items-start gap-3 p-3.5 rounded-md border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-sm"
          data-testid="conversion-success-banner"
        >
          <CheckCircle2
            size={16}
            className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5"
          />
          <div className="flex-1">
            <p className="font-medium text-emerald-800 dark:text-emerald-200">
              Lead converted to client successfully.
            </p>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
              The unified timeline below shows every interaction from the original lead onwards.
              Ready to move ahead? Click <span className="font-medium">Create Deal</span> to lock
              in the property and amount.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              searchParams.delete('converted');
              setSearchParams(searchParams, { replace: true });
            }}
            className="text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 text-xs"
            data-testid="dismiss-conversion-banner"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Reactivation success banner — shows mode + link to the (re-opened
          or freshly created) lead. Mirrors the conversion banner pattern. */}
      {reactivatedBanner && (
        <div
          className="flex items-start gap-3 p-3.5 rounded-md border border-primary/30 bg-primary/5 text-sm"
          data-testid="reactivation-success-banner"
        >
          <RotateCcw
            size={16}
            className="text-primary shrink-0 mt-0.5"
          />
          <div className="flex-1">
            <p className="font-medium text-foreground">
              {reactivatedBanner.mode === 'RESTORED'
                ? 'Linked lead reopened — back in active nurturing.'
                : 'New lead created from client data — ready for follow-up.'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              <Link
                to={`/leads/${reactivatedBanner.leadId}`}
                className="text-primary font-medium hover:underline"
                data-testid="reactivation-open-lead-link"
              >
                Open the lead →
              </Link>
              {'  '}or continue here to keep editing the client.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReactivatedBanner(null)}
            className="text-primary hover:text-foreground text-xs"
            data-testid="dismiss-reactivation-banner"
          >
            Dismiss
          </button>
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* Left column: profile + timeline */}
        <div className="space-y-5 min-w-0">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center text-2xl font-semibold">
                  {client.fullName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h1
                    className="text-2xl font-heading font-semibold tracking-tight"
                    data-testid="client-detail-name"
                  >
                    {client.fullName}
                  </h1>
                  {client.preferredLocation && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                      <MapPin size={12} /> {client.preferredLocation}
                    </p>
                  )}
                </div>
                <span
                  className="text-2xl font-bold text-primary whitespace-nowrap"
                  data-testid="client-detail-budget"
                >
                  {formatBudget(client.budget)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
                <Field icon={<Phone size={13} />} label="Phone" value={client.phone || '—'} />
                <Field icon={<Mail size={13} />} label="Email" value={client.email || '—'} />
                <Field
                  icon={<Wallet size={13} />}
                  label="Budget"
                  value={formatBudget(client.budget)}
                />
                <Field
                  icon={<UserCircle size={13} />}
                  label="Agent"
                  value={client.assignedAgent?.name ?? <span className="italic">Unassigned</span>}
                />
                <Field
                  icon={<Link2 size={13} />}
                  label="Linked Lead"
                  value={
                    client.linkedLead ? (
                      <Link
                        to={`/leads/${client.linkedLead.id}`}
                        className="text-primary hover:underline inline-flex items-center gap-1.5"
                        data-testid="client-linked-lead-link"
                      >
                        {client.linkedLead.fullName}
                        <StatusBadge status={client.linkedLead.status} />
                      </Link>
                    ) : (
                      <span className="italic">Not linked</span>
                    )
                  }
                />
                <Field
                  icon={<MapPin size={13} />}
                  label="Created"
                  value={new Date(client.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                />
              </div>

              {client.notes && (
                <div className="pt-3 border-t">
                  <h3 className="font-semibold text-sm mb-2">Notes</h3>
                  <p
                    className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
                    data-testid="client-detail-notes"
                  >
                    {client.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <ClientActivityTimeline
            items={timeline}
            loading={timelineLoading}
            hasLinkedLead={!!client.linkedLeadId}
          />
        </div>

        {/* Right column: meta + actions */}
        <aside className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm">Quick info</h3>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Updated:</span>{' '}
                {new Date(client.updatedAt).toLocaleString('en-IN')}
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                <span className="font-medium text-foreground font-sans">ID:</span> {client.id}
              </p>
            </CardContent>
          </Card>

          {client.linkedLead && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-1.5">
                  <Link2 size={13} /> Linked Lead
                </h3>
                <p className="text-sm">{client.linkedLead.fullName}</p>
                <StatusBadge status={client.linkedLead.status} />
                {client.linkedLead.phone && (
                  <p className="text-xs text-muted-foreground">{client.linkedLead.phone}</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => navigate(`/leads/${client.linkedLead!.id}`)}
                  data-testid="open-linked-lead-button"
                >
                  Open lead
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Deals attached to this client — count + compact list. Source of
              truth for the client→deal relationship. Clicking a row opens
              the deal detail page. */}
          <Card data-testid="client-deals-card">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Wallet size={13} /> Deals
                </span>
                <span
                  className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full"
                  data-testid="client-deals-count"
                >
                  {dealsLoading ? '…' : deals.length}
                </span>
              </h3>
              {dealsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : deals.length === 0 ? (
                <p
                  className="text-xs text-muted-foreground italic"
                  data-testid="client-deals-empty"
                >
                  No deals yet. Click "Create Deal" to start one.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {deals.slice(0, 5).map((d) => (
                    <li key={d.id}>
                      <Link
                        to={`/deals/${d.id}`}
                        data-testid={`client-deal-row-${d.id}`}
                        className="flex items-center justify-between gap-2 rounded border p-2 hover:border-primary/40 hover:bg-accent/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{d.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {d.property?.title ?? '—'}
                          </p>
                        </div>
                        <span className="text-[10px] font-medium text-primary whitespace-nowrap">
                          {d.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {deals.length > 5 && (
                    <li className="text-[10px] text-muted-foreground text-center pt-1">
                      +{deals.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <ClientFormModal
        open={editOpen}
        client={client}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          fetchClient();
          fetchTimeline();
          setEditOpen(false);
        }}
      />

      {/* Client → Deal conversion modal. Client is locked from the page
          context so users only pick property / amount / closing date. */}
      <DealFormModal
        open={dealOpen}
        title={`Create deal for ${client.fullName}`}
        prefill={{
          clientId: client.id,
          assignedAgentId: client.assignedAgentId ?? null,
          title: `${client.fullName} — `,
        }}
        lockClient={{ id: client.id, fullName: client.fullName }}
        onClose={() => setDealOpen(false)}
        onSuccess={(saved) => {
          setDealOpen(false);
          fetchDeals();
          fetchTimeline();
          navigate(`/deals/${saved.id}`);
        }}
      />

      {/* Reactivate-lead modal. Captures a structured reason, then calls
          POST /api/clients/:id/reactivate. The backend either flips the
          linked lead's status back to NEW (RESTORED) or synthesises a new
          lead from client data (CREATED). The success banner deep-links to
          the lead so the user can resume nurturing immediately. */}
      <ReactivateLeadModal
        open={reactivateOpen}
        client={client}
        onClose={() => setReactivateOpen(false)}
        onSuccess={(result) => {
          setReactivateOpen(false);
          setReactivatedBanner(result);
          fetchClient();
          fetchTimeline();
        }}
      />
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide">
        {icon} {label}
      </p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <div className="space-y-4">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
        <Skeleton className="h-44 w-full" />
      </div>
    </div>
  );
}

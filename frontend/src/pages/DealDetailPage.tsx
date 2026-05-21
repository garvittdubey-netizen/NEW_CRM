import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  UserCircle,
  Mail,
  Phone,
  CalendarDays,
  Wallet,
  MapPin,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DealStatusBadge } from '@/components/deals/DealStatusBadge';
import { DealFormModal } from '@/components/deals/DealFormModal';
import { DealTimeline } from '@/components/deals/DealTimeline';
import { dealsApi } from '@/services/deals';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { buildCloudinaryUrl } from '@/lib/property-format';
import type { Deal, DealTimelineItem } from '@/types';
import { isAdminLevel } from '@/lib/roles';

function formatAmount(value: number | null): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Deal Detail page (Phase-2).
 *
 * Layout mirrors the Client / Property detail pages: a 2-column grid on
 * desktop, the timeline + headline on the left, property/client/agent cards
 * stacked on the right. Edit/Delete RBAC follows the same rule as the list
 * page — ADMIN any, AGENT only own.
 */
export default function DealDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [timeline, setTimeline] = useState<DealTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = isAdminLevel(user?.role);
  const canManage = isAdmin || (deal && deal.assignedAgentId === user?.id);

  const fetchDeal = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDeal(await dealsApi.get(id));
    } catch (e) {
      setError(extractApiError(e, 'Deal not found'));
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      setTimeline(await dealsApi.timeline(id));
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDeal();
    fetchTimeline();
  }, [fetchDeal, fetchTimeline]);

  const handleDelete = async () => {
    if (!deal) return;
    if (!window.confirm(`Delete deal "${deal.title}"? This cannot be undone.`)) return;
    try {
      await dealsApi.delete(deal.id);
      navigate('/deals');
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to delete deal.'));
    }
  };

  if (loading) return <DetailSkeleton />;

  if (error || !deal) {
    return (
      <div className="space-y-4" data-testid="deal-detail-error">
        <Button variant="ghost" size="sm" onClick={() => navigate('/deals')}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to deals
        </Button>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">{error || 'Deal not found.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Pre-filter the timeline once to derive a STATUS_CHANGED-only "Status
  // history" trail for the sidebar card. Newest first, capped to the last 5
  // entries so the sidebar never grows unbounded.
  const statusHistory = timeline
    .filter((t) => t.eventType === 'STATUS_CHANGED' || t.eventType === 'CREATED')
    .slice(0, 5);

  const propertyCover = deal.property?.images?.[0];

  return (
    <div className="space-y-5 animate-fade-in" data-testid="deal-detail-page">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/deals')}
          data-testid="back-to-deals-button"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Back
        </Button>
        {canManage && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              data-testid="edit-deal-button"
            >
              <Pencil size={13} className="mr-1.5" /> Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              className="text-destructive hover:text-destructive"
              data-testid="delete-deal-button"
            >
              <Trash2 size={13} className="mr-1.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* Left: headline card + timeline */}
        <div className="space-y-5 min-w-0">
          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h1
                    className="text-2xl font-heading font-semibold tracking-tight"
                    data-testid="deal-detail-title"
                  >
                    {deal.title}
                  </h1>
                  <div className="mt-1 flex items-center gap-2">
                    <DealStatusBadge status={deal.status} showDot />
                    <span
                      className="text-xs text-muted-foreground"
                      data-testid="deal-detail-id"
                    >
                      ID: {deal.id}
                    </span>
                  </div>
                </div>
                <p
                  className="text-3xl font-bold text-primary"
                  data-testid="deal-detail-amount"
                >
                  {formatAmount(deal.amount)}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t">
                <StatTile
                  icon={<CalendarDays size={14} />}
                  label="Expected closing"
                  value={formatDate(deal.expectedClosingDate)}
                />
                <StatTile
                  icon={<UserCircle size={14} />}
                  label="Assigned agent"
                  value={deal.assignedAgent?.name ?? 'Unassigned'}
                  testId="deal-detail-agent"
                />
                <StatTile
                  icon={<CalendarDays size={14} />}
                  label="Created"
                  value={formatDate(deal.createdAt)}
                />
              </div>

              {deal.notes && (
                <div className="pt-3 border-t">
                  <h3 className="font-semibold text-sm mb-2">Notes</h3>
                  <p
                    className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
                    data-testid="deal-detail-notes"
                  >
                    {deal.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <DealTimeline items={timeline} loading={timelineLoading} />
        </div>

        {/* Right: property + client + agent + status history */}
        <aside className="space-y-4">
          {/* Property card */}
          <Card data-testid="deal-property-card">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Building2 size={13} /> Property
              </h3>
              {deal.property ? (
                <>
                  {propertyCover && (
                    <img
                      src={buildCloudinaryUrl(propertyCover, { width: 360, crop: 'fill' })}
                      alt={deal.property.title}
                      className="w-full h-32 rounded object-cover"
                      loading="lazy"
                    />
                  )}
                  <p className="text-sm font-medium">{deal.property.title}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin size={11} /> {deal.property.city}
                  </p>
                  {deal.property.price != null && (
                    <p className="text-xs text-muted-foreground">
                      Listed at {formatAmount(deal.property.price)}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-1"
                    asChild
                    data-testid="open-deal-property-button"
                  >
                    <Link to={`/properties/${deal.property.id}`}>Open property</Link>
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">Property unavailable</p>
              )}
            </CardContent>
          </Card>

          {/* Client card */}
          <Card data-testid="deal-client-card">
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <UserCircle size={13} /> Client
              </h3>
              {deal.client ? (
                <>
                  <p className="text-sm font-medium">{deal.client.fullName}</p>
                  {deal.client.phone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Phone size={11} /> {deal.client.phone}
                    </p>
                  )}
                  {deal.client.email && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 break-all">
                      <Mail size={11} /> {deal.client.email}
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    asChild
                    data-testid="open-deal-client-button"
                  >
                    <Link to={`/clients/${deal.client.id}`}>Open client</Link>
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">Client unavailable</p>
              )}
            </CardContent>
          </Card>

          {/* Assigned agent + status history */}
          <Card data-testid="deal-meta-card">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-1.5">
                <Wallet size={13} /> Deal info
              </h3>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Assigned to:</span>{' '}
                {deal.assignedAgent?.name ?? 'Unassigned'}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Updated:</span>{' '}
                {new Date(deal.updatedAt).toLocaleString('en-IN')}
              </p>

              {statusHistory.length > 0 && (
                <div className="pt-2 border-t" data-testid="deal-status-history">
                  <p className="text-xs font-medium mb-2">Recent status history</p>
                  <ul className="space-y-1.5">
                    {statusHistory.map((s) => (
                      <li
                        key={s.id}
                        className="text-[11px] text-muted-foreground flex items-start gap-2"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                        <span className="leading-snug">
                          {s.notes || s.eventType}
                          <span className="block text-[10px] opacity-70">
                            {new Date(s.createdAt).toLocaleString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <DealFormModal
        open={editOpen}
        deal={deal}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          fetchDeal();
          fetchTimeline();
          setEditOpen(false);
        }}
      />
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="rounded-md border p-3 space-y-0.5" data-testid={testId}>
      <p className="text-[10px] text-muted-foreground flex items-center gap-1 uppercase tracking-wide">
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
        <div className="space-y-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}

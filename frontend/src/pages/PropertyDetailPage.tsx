import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  CalendarDays,
  UserCircle,
  Send,
  Wallet,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PropertyStatusBadge } from '@/components/properties/PropertyStatusBadge';
import { PropertyImageGallery } from '@/components/properties/PropertyImageGallery';
import { PropertyFormModal } from '@/components/properties/PropertyFormModal';
import { MatchingLeadsSidebar } from '@/components/properties/MatchingLeadsSidebar';
import { SharePropertyWhatsAppModal } from '@/components/properties/SharePropertyWhatsAppModal';
import { propertiesApi } from '@/services/properties';
import { dealsApi } from '@/services/deals';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice, formatArea } from '@/lib/property-format';
import type { Property, MatchingLead, Deal } from '@/types';
import { isAdminLevel } from '@/lib/roles';

export default function PropertyDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [property, setProperty] = useState<Property | null>(null);
  const [matchingLeads, setMatchingLeads] = useState<MatchingLead[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(true);
  // Deals attached to this property. Surfaces a small "linked deals" card
  // in the right rail — closes the loop on the property→deal relationship.
  const [linkedDeals, setLinkedDeals] = useState<Deal[]>([]);
  const [linkedDealsLoading, setLinkedDealsLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [error, setError] = useState('');

  const isAdmin = isAdminLevel(user?.role);
  const canManage = isAdmin || (property?.ownerAgentId && property.ownerAgentId === user?.id);

  const fetchProperty = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await propertiesApi.get(id);
      setProperty(data);
    } catch (e) {
      setError(extractApiError(e, 'Property not found'));
      setProperty(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMatchingLeads = useCallback(async () => {
    setMatchingLoading(true);
    try {
      const leads = await propertiesApi.matchingLeads(id);
      setMatchingLeads(leads);
    } catch {
      setMatchingLeads([]);
    } finally {
      setMatchingLoading(false);
    }
  }, [id]);

  // Fetch the deals attached to this property. Errors here never block the
  // page render — the linked-deals card simply hides itself if the call
  // fails. AGENT users see only deals assigned to them (backend RBAC).
  const fetchLinkedDeals = useCallback(async () => {
    setLinkedDealsLoading(true);
    try {
      const r = await dealsApi.list({ propertyId: id, limit: 25 });
      setLinkedDeals(r.deals);
    } catch {
      setLinkedDeals([]);
    } finally {
      setLinkedDealsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProperty();
    fetchMatchingLeads();
    fetchLinkedDeals();
  }, [fetchProperty, fetchMatchingLeads, fetchLinkedDeals]);

  const handleDelete = async () => {
    if (!property) return;
    if (!window.confirm(`Delete property "${property.title}"? This cannot be undone.`)) return;
    try {
      await propertiesApi.delete(property.id);
      navigate('/properties');
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to delete property.'));
    }
  };

  if (loading) return <DetailSkeleton />;

  if (error || !property) {
    return (
      <div className="space-y-4" data-testid="property-detail-error">
        <Button variant="ghost" size="sm" onClick={() => navigate('/properties')}>
          <ArrowLeft size={14} className="mr-1.5" /> Back to properties
        </Button>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground">{error || 'Property not found.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" data-testid="property-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/properties')}
          data-testid="back-to-properties-button"
        >
          <ArrowLeft size={14} className="mr-1.5" /> Back
        </Button>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            className="text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            data-testid="share-via-whatsapp-button"
          >
            <Send size={13} className="mr-1.5" /> Share via WhatsApp
          </Button>
          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                data-testid="edit-property-button"
              >
                <Pencil size={13} className="mr-1.5" /> Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="text-destructive hover:text-destructive"
                data-testid="delete-property-button"
              >
                <Trash2 size={13} className="mr-1.5" /> Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5 min-w-0">
          <PropertyImageGallery images={property.images} alt={property.title} />

          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <h1 className="text-2xl font-heading font-semibold tracking-tight">
                    {property.title}
                  </h1>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin size={12} />
                    {property.location}, {property.city}
                  </p>
                </div>
                <PropertyStatusBadge status={property.status} showDot />
              </div>

              <div className="flex items-baseline gap-2 pt-2">
                <span
                  className="text-3xl font-bold text-primary"
                  data-testid="property-detail-price"
                >
                  {formatPrice(property.price)}
                </span>
                <span className="text-sm text-muted-foreground">
                  · {formatArea(property.area, property.areaUnit)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <Stat icon={<Bed size={14} />} label="Bedrooms" value={property.bedrooms ?? '—'} />
                <Stat icon={<Bath size={14} />} label="Bathrooms" value={property.bathrooms ?? '—'} />
                <Stat
                  icon={<Maximize2 size={14} />}
                  label="Area"
                  value={formatArea(property.area, property.areaUnit)}
                />
                <Stat
                  icon={<CalendarDays size={14} />}
                  label="Listed"
                  value={new Date(property.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                />
              </div>

              <div className="pt-2 border-t flex flex-wrap items-center gap-4 text-sm">
                <span
                  className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  data-testid="property-detail-type"
                >
                  {property.propertyType}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground" data-testid="property-detail-owner">
                  <UserCircle size={13} />
                  {property.ownerAgent ? (
                    <>
                      Listed by{' '}
                      <span className="text-foreground font-medium">
                        {property.ownerAgent.name}
                      </span>
                    </>
                  ) : (
                    <span className="italic">Unassigned</span>
                  )}
                </span>
              </div>

              {property.description && (
                <div className="pt-3 border-t">
                  <h3 className="font-semibold text-sm mb-2">Description</h3>
                  <p
                    className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
                    data-testid="property-detail-description"
                  >
                    {property.description}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <MatchingLeadsSidebar leads={matchingLeads} loading={matchingLoading} />

          {/* Linked deals — closes the property↔deal loop. The card hides
              its content while loading but stays visible so its position
              in the sidebar is predictable. */}
          <Card data-testid="property-linked-deals-card">
            <CardContent className="p-4 space-y-3">
              <h3 className="font-semibold text-sm flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Wallet size={13} /> Linked Deals
                </span>
                <span
                  className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full"
                  data-testid="property-linked-deals-count"
                >
                  {linkedDealsLoading ? '…' : linkedDeals.length}
                </span>
              </h3>
              {linkedDealsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : linkedDeals.length === 0 ? (
                <p
                  className="text-xs text-muted-foreground italic"
                  data-testid="property-linked-deals-empty"
                >
                  No deals attached to this property yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {linkedDeals.slice(0, 5).map((d) => (
                    <li key={d.id}>
                      <Link
                        to={`/deals/${d.id}`}
                        data-testid={`property-deal-row-${d.id}`}
                        className="flex items-center justify-between gap-2 rounded border p-2 hover:border-primary/40 hover:bg-accent/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{d.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {d.client?.fullName ?? '—'}
                          </p>
                        </div>
                        <span className="text-[10px] font-medium text-primary whitespace-nowrap">
                          {d.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {linkedDeals.length > 5 && (
                    <li className="text-[10px] text-muted-foreground text-center pt-1">
                      +{linkedDeals.length - 5} more
                    </li>
                  )}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 text-xs text-muted-foreground space-y-1">
              <p>
                <span className="font-medium text-foreground">Updated:</span>{' '}
                {new Date(property.updatedAt).toLocaleString('en-IN')}
              </p>
              <p>
                <span className="font-medium text-foreground">ID:</span>{' '}
                <Link to="#" className="font-mono text-[10px]">
                  {property.id}
                </Link>
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <PropertyFormModal
        open={editOpen}
        property={property}
        onClose={() => setEditOpen(false)}
        onSuccess={() => {
          fetchProperty();
          fetchMatchingLeads();
          setEditOpen(false);
        }}
      />
      <SharePropertyWhatsAppModal
        open={shareOpen}
        property={property}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-md border p-2.5">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="font-semibold mt-1 text-sm truncate">{value}</p>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-4">
          <Skeleton className="aspect-[16/10] w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

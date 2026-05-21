import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Phone,
  Mail,
  MapPin,
  Building2,
  LayoutGrid,
  DollarSign,
  UserCircle,
  Calendar,
  MessageSquare,
  PhoneCall,
  UserPlus,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/leads/StatusBadge';
import { LeadFormModal } from '@/components/leads/LeadFormModal';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { leadsApi } from '@/services/leads';
import { clientsApi } from '@/services/clients';
import { extractApiError } from '@/services/api';
import { LeadTimeline } from '@/components/followups/LeadTimeline';
import { CommunicationTimeline } from '@/components/communications/CommunicationTimeline';
import { CallLogModal } from '@/components/communications/CallLogModal';
import type { Lead, Client } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { isAdminLevel } from '@/lib/roles';

function formatBudget(budget: number | null): string {
  if (!budget) return '—';
  if (budget >= 10000000) return `₹${(budget / 10000000).toFixed(2)}Cr`;
  if (budget >= 100000) return `₹${(budget / 100000).toFixed(2)}L`;
  return `₹${budget.toLocaleString('en-IN')}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [callLogOpen, setCallLogOpen] = useState(false);
  // Lead → Client conversion state. `existingClient` is the already-converted
  // client (if any) discovered via /api/clients?linkedLeadId=:id. We use this
  // to (a) disable the Convert button when a conversion has already happened,
  // and (b) give the user a one-click path to the resulting client page.
  const [convertOpen, setConvertOpen] = useState(false);
  const [existingClient, setExistingClient] = useState<Client | null>(null);
  const [conversionLoading, setConversionLoading] = useState(true);
  // Notes-edit error string. Was previously read but never declared which
  // produced a `setNotesError is not defined` runtime error in handleSaveNotes.
  const [notesError, setNotesError] = useState('');

  // Notes state
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  const fetchLead = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await leadsApi.get(id);
      setLead(data);
      setNotesValue(data.notes ?? '');
    } catch {
      navigate('/leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLead();
  }, [id]);

  // Check whether this lead has already been converted to a client.
  // Used to prevent duplicate conversions and surface a "Open client →"
  // shortcut on the header.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setConversionLoading(true);
    clientsApi
      .list({ linkedLeadId: id, limit: 1 })
      .then((r) => {
        if (!cancelled) setExistingClient(r.clients[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setExistingClient(null);
      })
      .finally(() => {
        if (!cancelled) setConversionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleSaveNotes = async () => {
    if (!lead) return;
    setSavingNotes(true);
    setNotesError('');
    try {
      const updated = await leadsApi.update(lead.id, { notes: notesValue });
      setLead(updated);
      setEditingNotes(false);
    } catch (e) {
      setNotesError(extractApiError(e, 'Failed to save notes.'));
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    if (!lead || !window.confirm(`Delete lead "${lead.fullName}"?`)) return;
    try {
      await leadsApi.delete(lead.id);
      navigate('/leads');
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to delete lead.'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 max-w-5xl mx-auto" data-testid="lead-detail-loading">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  if (!lead) return null;

  // Ownership rule mirrored from backend: ADMIN edits anything,
  // AGENT only edits leads currently assigned to them.
  const canEdit = isAdminLevel(user?.role) || lead.assignedAgentId === user?.id;

  return (
    <div className="space-y-5 max-w-5xl mx-auto animate-fade-in" data-testid="lead-detail-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/leads')}
            data-testid="back-to-leads"
            className="text-muted-foreground"
          >
            <ArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="text-2xl font-heading font-semibold">{lead.fullName}</h1>
            <p className="text-sm text-muted-foreground">Added {fmtDate(lead.createdAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={lead.status} showDot />
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/communications?leadId=${lead.id}`)}
            disabled={!lead.phone}
            data-testid="lead-message-button"
            title={lead.phone ? 'Open WhatsApp chat' : 'No phone on file'}
            className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <MessageSquare size={13} className="mr-1.5" />
            Message
          </Button>
          {/* Lead → Client conversion. Visible to ADMIN + the assigned agent
              (same canEdit rule used for Edit/Notes). When a client already
              exists for this lead, the button morphs into a deep-link to
              that client to prevent duplicate conversions. */}
          {canEdit && !conversionLoading && (
            existingClient ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/clients/${existingClient.id}`)}
                data-testid="open-converted-client-button"
                className="text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                title="This lead has already been converted to a client"
              >
                <CheckCircle2 size={13} className="mr-1.5" />
                Open client
                <ArrowRight size={12} className="ml-1" />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConvertOpen(true)}
                data-testid="convert-to-client-button"
                className="border-primary/30 text-primary hover:bg-primary/5"
              >
                <UserPlus size={13} className="mr-1.5" />
                Convert to Client
              </Button>
            )
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCallLogOpen(true)}
              data-testid="lead-call-button"
            >
              <PhoneCall size={13} className="mr-1.5" />
              Log call
            </Button>
          )}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
              data-testid="edit-lead-button"
            >
              <Pencil size={13} className="mr-1.5" />
              Edit
            </Button>
          )}
          {isAdminLevel(user?.role) && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              data-testid="delete-lead-button"
            >
              <Trash2 size={13} className="mr-1.5" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Contact Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow icon={Phone} label="Phone" value={lead.phone} />
              <InfoRow icon={Mail} label="Email" value={lead.email} />
              <InfoRow icon={MapPin} label="Preferred Location" value={lead.preferredLocation} />
            </CardContent>
          </Card>

          {/* Property Preferences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Property Preferences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <InfoField icon={Building2} label="Type" value={lead.propertyType} />
                <InfoField icon={LayoutGrid} label="BHK" value={lead.bhk} />
                <InfoField icon={DollarSign} label="Budget" value={formatBudget(lead.budget)} />
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card data-testid="notes-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Notes
              </CardTitle>
              {!editingNotes && canEdit && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingNotes(true)}
                  data-testid="edit-notes-button"
                  className="h-7 text-xs"
                >
                  <Pencil size={12} className="mr-1" />
                  Edit
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingNotes ? (
                <div className="space-y-3" data-testid="notes-edit-mode">
                  <Textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={5}
                    placeholder="Add notes about this lead..."
                    autoFocus
                    data-testid="notes-textarea"
                  />
                  {notesError && (
                    <p
                      className="text-xs text-destructive"
                      data-testid="notes-error"
                    >
                      {notesError}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveNotes}
                      disabled={savingNotes}
                      data-testid="save-notes-button"
                    >
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingNotes(false);
                        setNotesValue(lead.notes ?? '');
                        setNotesError('');
                      }}
                      data-testid="cancel-notes-button"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <p
                  className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed"
                  data-testid="notes-display"
                >
                  {lead.notes || 'No notes added yet. Click Edit to add notes.'}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Follow-up Timeline */}
          <LeadTimeline lead={{ id: lead.id, fullName: lead.fullName }} canManage={canEdit} />

          {/* Communication Timeline (WhatsApp + Calls) */}
          <CommunicationTimeline
            lead={{ id: lead.id, fullName: lead.fullName, phone: lead.phone }}
            canManage={canEdit}
          />
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Lead Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Lead Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Status</p>
                <StatusBadge status={lead.status} showDot />
              </div>

              <Separator />

              <div>
                <p className="text-xs text-muted-foreground mb-1">Assigned Agent</p>
                {lead.assignedAgent ? (
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                      {lead.assignedAgent.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{lead.assignedAgent.name}</p>
                      <p className="text-xs text-muted-foreground">{lead.assignedAgent.email}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <UserCircle size={16} />
                    <span className="text-sm">Unassigned</span>
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p className="text-sm">{fmtDate(lead.createdAt)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Last Updated</p>
                    <p className="text-sm">{fmtDate(lead.updatedAt)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card data-testid="tags-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Tags
              </CardTitle>
            </CardHeader>
            <CardContent>
              {lead.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {lead.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary"
                      data-testid={`tag-${tag}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No tags added.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <LeadFormModal
        open={editOpen}
        lead={lead}
        onClose={() => setEditOpen(false)}
        onSuccess={() => { fetchLead(); setEditOpen(false); }}
      />

      <CallLogModal
        open={callLogOpen}
        onClose={() => setCallLogOpen(false)}
        lead={{ id: lead.id, fullName: lead.fullName, phone: lead.phone }}
        onSuccess={() => setCallLogOpen(false)}
      />

      {/* Lead → Client conversion modal. Pre-fills every transferable field
          from the lead so the user only has to confirm. The created client
          carries linkedLeadId for the unified timeline + duplicate-guard. */}
      <ClientFormModal
        open={convertOpen}
        title={`Convert lead "${lead.fullName}" to client`}
        prefill={{
          fullName: lead.fullName,
          phone: lead.phone ?? '',
          email: lead.email ?? '',
          notes: lead.notes ?? '',
          budget: lead.budget ?? undefined,
          preferredLocation: lead.preferredLocation ?? '',
          linkedLeadId: lead.id,
          assignedAgentId: lead.assignedAgentId,
        }}
        onClose={() => setConvertOpen(false)}
        onSuccess={(created) => {
          setExistingClient(created);
          setConvertOpen(false);
          navigate(`/clients/${created.id}?converted=1`);
        }}
      />
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={15} className="text-muted-foreground shrink-0" />
      <span className="text-sm text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value || '—'}</span>
    </div>
  );
}

function InfoField({ icon: Icon, label, value }: {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={13} className="text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}

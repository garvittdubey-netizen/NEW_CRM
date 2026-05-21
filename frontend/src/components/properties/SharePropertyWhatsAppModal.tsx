/**
 * Share-via-WhatsApp modal for the Property detail page.
 *
 * Lets the agent broadcast a property card to one or more leads through the
 * existing `/api/communications/whatsapp/send` endpoint — no new transport,
 * no new persistence path. Each successful send creates a `Communication`
 * row (direction=OUTBOUND, type=WHATSAPP) automatically, so the message
 * shows up in the lead's communication history and the inbox sidebar.
 *
 * Two recipient modes:
 *   - "matching"  — leads pre-suggested by the existing
 *                   GET /api/properties/:id/matching-leads endpoint (already
 *                   scored against preferredLocation, propertyType, budget).
 *   - "all"       — debounced search via /api/leads?search=  — useful when the
 *                   agent already has a specific buyer in mind that didn't
 *                   match the auto-filters.
 *
 * Leads without a phone number are surfaced but disabled, mirroring the
 * existing WhatsApp UX everywhere else in the app.
 *
 * The message body is a fully editable textarea, pre-filled with a
 * deterministic property summary including:
 *   - title, location, price, BHK (from bedrooms), area, description,
 *     image URL (Cloudinary cdn-optimised), public detail link.
 * Plain text only (the existing WhatsApp service does NOT do media uploads),
 * so the image is sent as a URL — WhatsApp clients render the OpenGraph
 * preview inline.
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Send, Search, Sparkles, CheckCircle2, AlertCircle, Loader2, Phone, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { extractApiError } from '@/services/api';
import { communicationsApi } from '@/services/communications';
import { leadsApi } from '@/services/leads';
import { propertiesApi } from '@/services/properties';
import { formatPrice, formatArea, buildCloudinaryUrl } from '@/lib/property-format';
import type { Property, Lead, MatchingLead } from '@/types';

interface Props {
  open: boolean;
  property: Property;
  onClose: () => void;
}

type Mode = 'matching' | 'all';
type SendStatus = 'idle' | 'sending' | 'ok' | 'failed';

interface RecipientStatus {
  leadId: string;
  status: SendStatus;
  error?: string;
}

/** Lightweight lead view shared by both modes. MatchingLead is a superset of
 *  Lead so we down-project; raw Lead from /api/leads is up-projected. */
interface RecipientCandidate {
  id: string;
  fullName: string;
  phone: string | null;
  preferredLocation: string | null;
}

function leadToCandidate(l: Lead): RecipientCandidate {
  return {
    id: l.id,
    fullName: l.fullName,
    phone: l.phone,
    preferredLocation: l.preferredLocation,
  };
}
function matchingToCandidate(m: MatchingLead): RecipientCandidate {
  return {
    id: m.id,
    fullName: m.fullName,
    phone: m.phone,
    preferredLocation: m.preferredLocation,
  };
}

function detailUrl(propertyId: string): string {
  // Reserved for internal CRM usage only. The customer-facing WhatsApp
  // message intentionally does NOT include this link — CRM URLs are private.
  // Kept exported via the unused-export shim below so future internal-only
  // CRM features (e.g. agent forwarding) can reuse the same builder.
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/properties/${propertyId}`;
  }
  return `/properties/${propertyId}`;
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _internalCrmDetailUrl = detailUrl;

/**
 * Build the customer-facing property summary that gets sent to the lead.
 *
 * Strictly removed (vs. earlier iteration):
 *   - raw Cloudinary image URLs (the image is now sent as a real attachment
 *     via the new `imageUrl` field — see `sendWhatsApp` in the backend)
 *   - internal CRM property links (private to the workspace)
 *
 * The block ends with a soft call-to-action so the lead has an obvious next
 * step — replying inside the 24h customer-service window also opens up
 * free-form follow-up messaging from our side.
 */
function buildMessage(property: Property): string {
  const lines: string[] = [];
  lines.push(`🏠 *${property.title}*`);
  lines.push('');
  lines.push(`📍 ${property.location}, ${property.city}`);
  lines.push(`💰 ${formatPrice(property.price)}`);
  if (property.bedrooms) lines.push(`🛏 ${property.bedrooms} BHK`);
  lines.push(`📐 ${formatArea(property.area, property.areaUnit)}`);
  if (property.propertyType) lines.push(`🏡 ${property.propertyType}`);
  if (property.description) {
    const trimmed = property.description.replace(/\s+/g, ' ').trim();
    const preview = trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
    lines.push('');
    lines.push(`📝 ${preview}`);
  }
  lines.push('');
  lines.push(`✨ Interested? Reply to this message and our team will schedule your site visit.`);
  return lines.join('\n');
}

/** Resolves the first property image to a cdn-optimised URL suitable for
 *  Meta's image-by-URL upload. Returns null if the property has no images. */
function resolvePropertyImageUrl(property: Property): string | null {
  if (!property.images?.length) return null;
  return buildCloudinaryUrl(property.images[0], { width: 1000 });
}

export function SharePropertyWhatsAppModal({ open, property, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('matching');
  const [matching, setMatching] = useState<RecipientCandidate[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<RecipientCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Record<string, RecipientCandidate>>({});
  const [message, setMessage] = useState('');
  const [statuses, setStatuses] = useState<Record<string, RecipientStatus>>({});
  const [sending, setSending] = useState(false);
  // Resolved once per property and reused for every recipient — bypasses
  // ResponsiveContainer-style re-measurement during the send loop.
  const propertyImageUrl = useMemo(() => resolvePropertyImageUrl(property), [property]);
  const [includeImage, setIncludeImage] = useState(true);

  // Reset everything every time the modal opens with a (potentially) new
  // property so stale selections / send statuses never leak.
  useEffect(() => {
    if (!open) return;
    setMode('matching');
    setSelected({});
    setStatuses({});
    setSearch('');
    setSearchResults([]);
    setMessage(buildMessage(property));
    setIncludeImage(true);
    // Fetch matching leads — re-uses the existing endpoint, no new backend.
    setMatchingLoading(true);
    propertiesApi
      .matchingLeads(property.id)
      .then((leads) => setMatching(leads.map(matchingToCandidate)))
      .catch(() => setMatching([]))
      .finally(() => setMatchingLoading(false));
  }, [open, property]);

  // Debounced lead search for the "All leads" tab. Re-uses /api/leads?search=,
  // so RBAC is inherited (agents only see their own assigned leads).
  useEffect(() => {
    if (!open || mode !== 'all') return;
    const term = search.trim();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await leadsApi.list({ search: term || undefined, limit: 25 });
        setSearchResults(res.leads.map(leadToCandidate));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [open, mode, search]);

  const visibleList = mode === 'matching' ? matching : searchResults;
  const isLoadingList = mode === 'matching' ? matchingLoading : searching;
  const selectedIds = useMemo(() => Object.keys(selected), [selected]);
  const selectableCount = visibleList.filter((c) => !!c.phone).length;
  const allVisibleSelected =
    selectableCount > 0 &&
    visibleList.filter((c) => !!c.phone).every((c) => selected[c.id]);

  const toggle = (c: RecipientCandidate) => {
    if (!c.phone) return;
    setSelected((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id];
      else next[c.id] = c;
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      // Deselect only the visible list (keep selections from the other tab intact)
      setSelected((prev) => {
        const next = { ...prev };
        for (const c of visibleList) delete next[c.id];
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = { ...prev };
        for (const c of visibleList) {
          if (c.phone) next[c.id] = c;
        }
        return next;
      });
    }
  };

  const removeSelected = (id: string) => {
    setSelected((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const canSend = selectedIds.length > 0 && message.trim().length > 0 && !sending;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    // Reset previous statuses for the lined-up recipients.
    setStatuses(
      Object.fromEntries(selectedIds.map((id) => [id, { leadId: id, status: 'sending' as SendStatus }])),
    );
    const trimmed = message.trim();
    const imageToSend = includeImage && propertyImageUrl ? propertyImageUrl : undefined;
    // Send sequentially so we don't overrun Meta's per-second rate limit and
    // so each row updates visibly as it completes. The backend handles the
    // "image first, then text" sequencing in one round-trip per recipient.
    for (const id of selectedIds) {
      try {
        await communicationsApi.sendWhatsApp({
          leadId: id,
          message: trimmed,
          imageUrl: imageToSend,
        });
        setStatuses((s) => ({ ...s, [id]: { leadId: id, status: 'ok' } }));
      } catch (e) {
        setStatuses((s) => ({
          ...s,
          [id]: {
            leadId: id,
            status: 'failed',
            error: extractApiError(e, 'Send failed'),
          },
        }));
      }
    }
    setSending(false);
  }, [canSend, message, selectedIds, includeImage, propertyImageUrl]);

  const okCount = Object.values(statuses).filter((s) => s.status === 'ok').length;
  const failedCount = Object.values(statuses).filter((s) => s.status === 'failed').length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0"
        data-testid="share-property-modal"
      >
        <DialogHeader className="p-5 pb-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Send size={16} className="text-emerald-600" />
            Share via WhatsApp
          </DialogTitle>
          <DialogDescription className="text-xs">
            Send "{property.title}" to one or more leads. Every send goes through the existing
            WhatsApp integration and is logged in the lead's communication history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.1fr] gap-0 flex-1 overflow-hidden">
          {/* Left column — recipient picker */}
          <div className="border-r flex flex-col overflow-hidden">
            {/* Mode toggle */}
            <div
              className="flex items-center gap-1 p-3 border-b shrink-0"
              data-testid="share-mode-toggle"
            >
              <button
                type="button"
                onClick={() => setMode('matching')}
                data-testid="share-mode-matching"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  mode === 'matching'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Sparkles size={12} /> Matching leads
                {matching.length > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px]',
                      mode === 'matching' ? 'bg-white/20' : 'bg-muted',
                    )}
                  >
                    {matching.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setMode('all')}
                data-testid="share-mode-all"
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  mode === 'all'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <Search size={12} /> All leads
              </button>
            </div>

            {/* Search input — only in "all" mode */}
            {mode === 'all' && (
              <div className="p-3 border-b shrink-0">
                <div className="relative">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by name, phone or email…"
                    className="pl-8 h-9 text-sm"
                    data-testid="share-search-input"
                  />
                </div>
              </div>
            )}

            {/* Select-all bar */}
            <div className="px-3 py-2 border-b shrink-0 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {selectableCount > 0
                  ? `${selectableCount} contactable · ${selectedIds.length} selected`
                  : 'No contactable leads'}
              </span>
              {selectableCount > 0 && (
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className="text-primary hover:underline"
                  data-testid="share-toggle-all"
                >
                  {allVisibleSelected ? 'Clear visible' : 'Select all visible'}
                </button>
              )}
            </div>

            {/* List */}
            <div
              className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[300px]"
              data-testid="share-recipient-list"
            >
              {isLoadingList ? (
                <p className="text-xs text-muted-foreground text-center py-8 flex items-center justify-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Loading…
                </p>
              ) : visibleList.length === 0 ? (
                <p
                  className="text-xs text-muted-foreground text-center py-8"
                  data-testid="share-empty-list"
                >
                  {mode === 'matching'
                    ? 'No matching leads. Try the "All leads" tab.'
                    : 'No leads found.'}
                </p>
              ) : (
                visibleList.map((c) => {
                  const isSelected = !!selected[c.id];
                  const st = statuses[c.id];
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => toggle(c)}
                      disabled={!c.phone}
                      data-testid={`share-recipient-${c.id}`}
                      className={cn(
                        'w-full text-left flex items-start gap-3 p-2.5 rounded-md border transition-colors',
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : c.phone
                            ? 'border-transparent hover:bg-accent'
                            : 'border-transparent opacity-50 cursor-not-allowed',
                      )}
                    >
                      <div
                        className={cn(
                          'h-4 w-4 rounded border-2 mt-0.5 flex items-center justify-center shrink-0',
                          isSelected ? 'bg-primary border-primary' : 'border-input',
                        )}
                      >
                        {isSelected && <CheckCircle2 size={10} className="text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.fullName}</p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                          {c.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone size={9} /> {c.phone}
                            </span>
                          ) : (
                            <span className="italic">No phone on file</span>
                          )}
                          {c.preferredLocation && (
                            <span className="truncate">{c.preferredLocation}</span>
                          )}
                        </div>
                      </div>
                      {st && (
                        <SendStatusBadge
                          status={st.status}
                          error={st.error}
                          testId={`share-status-${c.id}`}
                        />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right column — message editor + selected chips */}
          <div className="flex flex-col overflow-hidden">
            <div className="p-3 border-b shrink-0">
              <Label className="text-xs">Recipients ({selectedIds.length})</Label>
              <div
                className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto"
                data-testid="share-selected-chips"
              >
                {selectedIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Pick at least one lead on the left.</p>
                ) : (
                  selectedIds.map((id) => {
                    const c = selected[id];
                    return (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="gap-1"
                        data-testid={`share-chip-${id}`}
                      >
                        {c.fullName}
                        <button
                          type="button"
                          onClick={() => removeSelected(id)}
                          className="ml-0.5 hover:text-destructive"
                          disabled={sending}
                          aria-label={`Remove ${c.fullName}`}
                        >
                          <X size={10} />
                        </button>
                      </Badge>
                    );
                  })
                )}
              </div>
            </div>

            <div className="p-3 border-b flex-1 flex flex-col overflow-hidden">
              {/* Image preview — shows EXACTLY what the lead will receive as
                  a native WhatsApp image attachment (no plain-text URL). */}
              {propertyImageUrl && (
                <div
                  className="mb-3 flex items-start gap-3 p-2 rounded-md border bg-muted/30"
                  data-testid="share-image-preview"
                >
                  <img
                    src={propertyImageUrl}
                    alt={property.title}
                    className="h-16 w-16 rounded object-cover shrink-0"
                    data-testid="share-image-thumb"
                  />
                  <div className="flex-1 min-w-0 text-xs">
                    <p className="font-medium">Image attachment</p>
                    <p className="text-muted-foreground mt-0.5">
                      Sent as a native WhatsApp image — appears as a preview, not a link.
                    </p>
                    <label className="inline-flex items-center gap-1.5 mt-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={includeImage}
                        onChange={(e) => setIncludeImage(e.target.checked)}
                        disabled={sending}
                        className="h-3.5 w-3.5"
                        data-testid="share-include-image-checkbox"
                      />
                      <span>Include image</span>
                    </label>
                  </div>
                </div>
              )}
              <Label htmlFor="share-message" className="text-xs">
                Message
              </Label>
              <textarea
                id="share-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
                className="flex-1 mt-2 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                data-testid="share-message-textarea"
                placeholder="Property summary…"
              />
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {propertyImageUrl && includeImage
                  ? 'The image is delivered first, then this message — both appear in the lead\u2019s history.'
                  : 'Sent as plain text. No internal links or raw image URLs are shared with the recipient.'}
              </p>
            </div>

            <div className="p-3 border-t flex items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-muted-foreground">
                {sending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Sending {selectedIds.length}…
                  </span>
                ) : okCount + failedCount > 0 ? (
                  <span data-testid="share-result-summary">
                    {okCount > 0 && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {okCount} sent
                      </span>
                    )}
                    {okCount > 0 && failedCount > 0 && ' · '}
                    {failedCount > 0 && (
                      <span className="text-destructive">{failedCount} failed</span>
                    )}
                  </span>
                ) : (
                  '\u00a0'
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={sending}
                  data-testid="share-cancel-button"
                >
                  {okCount + failedCount > 0 ? 'Close' : 'Cancel'}
                </Button>
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={!canSend}
                  data-testid="share-send-button"
                >
                  <Send size={13} className="mr-1.5" />
                  Send to {selectedIds.length || 0}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SendStatusBadge({
  status,
  error,
  testId,
}: {
  status: SendStatus;
  error?: string;
  testId: string;
}) {
  if (status === 'sending') {
    return (
      <Loader2 size={13} className="animate-spin text-muted-foreground shrink-0" data-testid={testId} />
    );
  }
  if (status === 'ok') {
    return (
      <CheckCircle2
        size={14}
        className="text-emerald-600 dark:text-emerald-400 shrink-0"
        data-testid={testId}
      />
    );
  }
  if (status === 'failed') {
    return (
      <span title={error} data-testid={testId}>
        <AlertCircle size={14} className="text-destructive shrink-0" />
      </span>
    );
  }
  return null;
}

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Phone, UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { leadsApi } from '@/services/leads';
import { extractApiError } from '@/services/api';
import type { Lead } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
}

type Mode = 'existing' | 'new';

/**
 * Modal that starts a new conversation in one of two ways:
 *
 *  1. "Existing lead" — debounce-searches leads by name/phone and opens the
 *     selected lead's chat at `/communications?leadId={id}`.
 *
 *  2. "New phone number" — accepts a phone (and optional name). Creates a
 *     minimal lead via `leadsApi.create` and routes to its chat. We persist
 *     the lead immediately so the user has somewhere to convert/edit later
 *     and so the conversation actually has a `leadId` (required by the
 *     WhatsApp send endpoint).
 */
export function NewConversationModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('existing');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Lead[]>([]);
  const [searching, setSearching] = useState(false);

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setMode('existing');
    setQuery('');
    setResults([]);
    setPhone('');
    setName('');
    setError('');
  }, [open]);

  // Debounced lead search
  useEffect(() => {
    if (mode !== 'existing') return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await leadsApi.list({ page: 1, limit: 10, search: q });
        setResults(data.leads);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, mode]);

  const handlePickLead = (lead: Lead) => {
    onClose();
    navigate(`/communications?leadId=${lead.id}`);
  };

  const handleCreateForNewPhone = async () => {
    const phoneTrim = phone.trim();
    if (!phoneTrim) {
      setError('Phone number is required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const lead = await leadsApi.create({
        fullName: name.trim() || `Unknown (${phoneTrim})`,
        phone: phoneTrim,
        status: 'NEW',
      });
      onClose();
      navigate(`/communications?leadId=${lead.id}`);
    } catch (e) {
      setError(extractApiError(e, 'Failed to create lead for the new number.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="new-conversation-modal">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>

        {/* Mode tabs */}
        <div className="inline-flex rounded-md border bg-card p-0.5 self-start" data-testid="new-conv-mode">
          <ModeButton active={mode === 'existing'} onClick={() => setMode('existing')} testId="mode-existing">
            <Search size={13} className="mr-1.5" />
            Existing lead
          </ModeButton>
          <ModeButton active={mode === 'new'} onClick={() => setMode('new')} testId="mode-new">
            <Phone size={13} className="mr-1.5" />
            New phone number
          </ModeButton>
        </div>

        {error && (
          <div
            className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
            data-testid="new-conv-error"
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {mode === 'existing' ? (
          <div className="space-y-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or phone..."
                className="pl-8"
                autoFocus
                data-testid="new-conv-search-input"
              />
            </div>
            <div className="max-h-72 overflow-y-auto border rounded-md" data-testid="new-conv-results">
              {searching ? (
                <div className="p-3 space-y-2">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : query.trim() && results.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No leads match — try the New phone number tab.
                </p>
              ) : !query.trim() ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Type a name or phone to search your leads.
                </p>
              ) : (
                <ul className="divide-y">
                  {results.map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => handlePickLead(l)}
                        className="w-full text-left p-3 hover:bg-muted/40 flex items-center gap-3"
                        data-testid={`new-conv-result-${l.id}`}
                      >
                        <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-semibold shrink-0">
                          {l.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{l.fullName}</p>
                          <p className="text-xs text-muted-foreground truncate">{l.phone || 'No phone'}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="conv-phone">
                Phone number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="conv-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                data-testid="new-conv-phone-input"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                Include the country code. WhatsApp expects E.164 format.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conv-name">Contact name (optional)</Label>
              <Input
                id="conv-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Anita Kapoor"
                data-testid="new-conv-name-input"
              />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground flex items-start gap-2">
              <UserPlus size={13} className="shrink-0 mt-0.5" />
              <span>
                A lead will be created with this number so the conversation has a home in
                the CRM. You can fill in the rest of the details later from the lead page.
              </span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          {mode === 'new' && (
            <Button
              onClick={handleCreateForNewPhone}
              disabled={submitting || !phone.trim()}
              data-testid="new-conv-create-submit"
            >
              {submitting ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : null}
              Create lead & open chat
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeButton({
  active,
  onClick,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`inline-flex items-center px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

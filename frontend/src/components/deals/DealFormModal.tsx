import { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { dealsApi } from '@/services/deals';
import { propertiesApi } from '@/services/properties';
import { clientsApi } from '@/services/clients';
import { agentsApi, type AgentOption } from '@/services/leads';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type {
  Deal,
  CreateDealData,
  DealStatus,
  Property,
  Client,
} from '@/types';
import { isAdminLevel } from '@/lib/roles';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (saved: Deal) => void;
  deal?: Deal | null;
  /** Initial values for a NEW deal. Ignored when editing. Used by the
   *  Client → Deal conversion flow to prefill the client (locked) +
   *  assignedAgentId. */
  prefill?: Partial<CreateDealData> | null;
  /** When set on a NEW deal, the client picker is rendered read-only and
   *  shows the locked client's name. Used by the Client → Deal flow so the
   *  user can only change property / amount / closing date / status. */
  lockClient?: { id: string; fullName: string } | null;
  title?: string;
}

const EMPTY: CreateDealData = {
  title: '',
  propertyId: '',
  clientId: '',
  assignedAgentId: null,
  amount: 0,
  expectedClosingDate: null,
  status: 'NEW',
  notes: '',
};

const DEAL_STATUSES: DealStatus[] = [
  'NEW',
  'NEGOTIATION',
  'DOCUMENTATION',
  'PAYMENT_PENDING',
  'WON',
  'LOST',
];

/**
 * Reduces a date input value to YYYY-MM-DD for the <input type=date>.
 * Avoids timezone drift when round-tripping through the backend.
 */
function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export function DealFormModal({
  open,
  onClose,
  onSuccess,
  deal,
  prefill,
  lockClient,
  title,
}: Props) {
  const isEdit = !!deal;
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);

  const [form, setForm] = useState<CreateDealData>(EMPTY);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [propertyQuery, setPropertyQuery] = useState('');
  const [clientQuery, setClientQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ── Initialize / reset whenever the modal opens or the editing target changes
  useEffect(() => {
    if (!open) return;
    setError('');
    if (deal) {
      setForm({
        title: deal.title,
        propertyId: deal.propertyId,
        clientId: deal.clientId,
        assignedAgentId: deal.assignedAgentId,
        amount: deal.amount,
        expectedClosingDate: deal.expectedClosingDate,
        status: deal.status,
        notes: deal.notes ?? '',
      });
      setPropertyQuery(deal.property?.title ?? '');
      setClientQuery(deal.client?.fullName ?? '');
    } else if (prefill) {
      // NEW deal pre-loaded by a conversion flow.
      setForm({ ...EMPTY, ...prefill });
      setClientQuery(lockClient?.fullName ?? '');
      setPropertyQuery('');
    } else {
      setForm(EMPTY);
      setPropertyQuery('');
      setClientQuery('');
    }
    if (isAdmin) {
      agentsApi.list().then(setAgents).catch(() => setAgents([]));
    }
  }, [open, deal, isAdmin, prefill, lockClient]);

  // Debounced property + client search (300 ms each)
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      propertiesApi
        .list({ page: 1, limit: 20, search: propertyQuery || undefined })
        .then((r) => setProperties(r.properties))
        .catch(() => setProperties([]));
    }, 300);
    return () => clearTimeout(t);
  }, [propertyQuery, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      clientsApi
        .list({ page: 1, limit: 20, search: clientQuery || undefined })
        .then((r) => setClients(r.clients))
        .catch(() => setClients([]));
    }, 300);
    return () => clearTimeout(t);
  }, [clientQuery, open]);

  const set = <K extends keyof CreateDealData>(key: K) =>
    (value: CreateDealData[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) return setError('Title is required');
    if (!form.propertyId) return setError('Select a property');
    if (!form.clientId) return setError('Select a client');
    if (!form.amount || form.amount <= 0) return setError('Amount must be greater than 0');

    setLoading(true);
    setError('');
    try {
      const payload: CreateDealData = {
        ...form,
        amount: Number(form.amount),
        expectedClosingDate: form.expectedClosingDate || null,
        notes: form.notes?.trim() || undefined,
      };
      const saved = isEdit
        ? await dealsApi.update(deal!.id, payload)
        : await dealsApi.create(payload);
      onSuccess(saved);
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Failed to save deal. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle>{title ?? (isEdit ? 'Edit Deal' : 'Add New Deal')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="deal-form-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="df-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="df-title"
              value={form.title}
              onChange={(e) => set('title')(e.target.value)}
              placeholder="Vivek - Bandra 3BHK"
              data-testid="deal-title-input"
            />
          </div>

          {/* Client picker (searchable) — read-only when lockClient is set */}
          <div className="space-y-1.5">
            <Label>
              Client <span className="text-destructive">*</span>
            </Label>
            {lockClient && !isEdit ? (
              <div
                className="flex items-center gap-2 px-3 py-2 border rounded-md bg-muted/40 text-sm"
                data-testid="deal-client-locked"
              >
                <span className="font-medium">{lockClient.fullName}</span>
                <span className="text-xs text-muted-foreground ml-auto">locked from client page</span>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search clients..."
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  data-testid="deal-client-search"
                />
                <Select value={form.clientId || 'NONE'} onValueChange={(v) => set('clientId')(v === 'NONE' ? '' : v)}>
                  <SelectTrigger data-testid="deal-client-select">
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Select a client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName}
                        {c.phone ? ` · ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          {/* Property picker (searchable) */}
          <div className="space-y-1.5">
            <Label>
              Property <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="Search properties..."
              value={propertyQuery}
              onChange={(e) => setPropertyQuery(e.target.value)}
              data-testid="deal-property-search"
            />
            <Select
              value={form.propertyId || 'NONE'}
              onValueChange={(v) => set('propertyId')(v === 'NONE' ? '' : v)}
            >
              <SelectTrigger data-testid="deal-property-select">
                <SelectValue placeholder="Select a property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Select a property</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title} · {p.city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="df-amount">
                Amount (₹) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="df-amount"
                type="number"
                value={form.amount || ''}
                onChange={(e) => set('amount')(e.target.value ? Number(e.target.value) : 0)}
                placeholder="35000000"
                data-testid="deal-amount-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status || 'NEW'}
                onValueChange={(v) => set('status')(v as DealStatus)}
              >
                <SelectTrigger data-testid="deal-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace('_', ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="df-closing">Expected Closing Date</Label>
              <Input
                id="df-closing"
                type="date"
                value={toDateInput(form.expectedClosingDate)}
                onChange={(e) => set('expectedClosingDate')(e.target.value || null)}
                data-testid="deal-closing-input"
              />
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Assigned Agent</Label>
                <Select
                  value={form.assignedAgentId || 'NONE'}
                  onValueChange={(v) => set('assignedAgentId')(v === 'NONE' ? null : v)}
                >
                  <SelectTrigger data-testid="deal-agent-select">
                    <SelectValue placeholder="Defaults to you" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Defaults to me</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="df-notes">Notes</Label>
            <Textarea
              id="df-notes"
              value={form.notes}
              onChange={(e) => set('notes')(e.target.value)}
              placeholder="Buyer wants partial payment in 90 days..."
              rows={3}
              data-testid="deal-notes-textarea"
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="deal-form-submit">
            {loading ? 'Saving...' : isEdit ? 'Update Deal' : 'Add Deal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

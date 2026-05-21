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
import { clientsApi } from '@/services/clients';
import { leadsApi, agentsApi, type AgentOption } from '@/services/leads';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Client, CreateClientData, Lead } from '@/types';
import { isAdminLevel } from '@/lib/roles';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (created: Client) => void;
  client?: Client | null;
  /** Initial values for a NEW client. Ignored when editing (`client` is set).
   *  Used by the Lead → Client conversion flow to prefill name/phone/email/
   *  notes/agent/budget/preferredLocation/linkedLeadId. */
  prefill?: Partial<CreateClientData> | null;
  /** Optional override for the dialog title — e.g. "Convert lead to client". */
  title?: string;
}

const EMPTY: CreateClientData = {
  fullName: '',
  phone: '',
  email: '',
  budget: undefined,
  preferredLocation: '',
  notes: '',
  linkedLeadId: null,
  assignedAgentId: null,
};

export function ClientFormModal({ open, onClose, onSuccess, client, prefill, title }: Props) {
  const isEdit = !!client;
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);

  const [form, setForm] = useState<CreateClientData>(EMPTY);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadQuery, setLeadQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (client) {
      setForm({
        fullName: client.fullName,
        phone: client.phone ?? '',
        email: client.email ?? '',
        budget: client.budget ?? undefined,
        preferredLocation: client.preferredLocation ?? '',
        notes: client.notes ?? '',
        linkedLeadId: client.linkedLeadId,
        assignedAgentId: client.assignedAgentId,
      });
      setLeadQuery(client.linkedLead?.fullName ?? '');
    } else if (prefill) {
      // NEW client with prefilled values (e.g. lead-conversion flow).
      setForm({ ...EMPTY, ...prefill });
      setLeadQuery('');
    } else {
      setForm(EMPTY);
      setLeadQuery('');
    }
    if (isAdmin) {
      agentsApi.list().then(setAgents).catch(() => setAgents([]));
    }
  }, [open, client, isAdmin, prefill]);

  // Debounced lead search for the linkage dropdown.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      leadsApi
        .list({ page: 1, limit: 20, search: leadQuery || undefined })
        .then((r) => setLeads(r.leads))
        .catch(() => setLeads([]));
    }, 300);
    return () => clearTimeout(t);
  }, [leadQuery, open]);

  const set = <K extends keyof CreateClientData>(key: K) =>
    (value: CreateClientData[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.fullName?.trim()) return setError('Full name is required');
    setLoading(true);
    setError('');
    try {
      const payload: CreateClientData = {
        ...form,
        phone: form.phone || undefined,
        email: form.email || undefined,
        preferredLocation: form.preferredLocation || undefined,
        notes: form.notes || undefined,
        budget: form.budget ? Number(form.budget) : null,
        linkedLeadId: form.linkedLeadId || null,
        assignedAgentId: form.assignedAgentId || null,
      };
      const result = isEdit
        ? await clientsApi.update(client!.id, payload)
        : await clientsApi.create(payload);
      onSuccess(result);
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Failed to save client. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle>{title ?? (isEdit ? 'Edit Client' : 'Add New Client')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="client-form-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cf-name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cf-name"
                value={form.fullName}
                onChange={(e) => set('fullName')(e.target.value)}
                placeholder="Vivek Kumar"
                data-testid="client-fullname-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-phone">Phone</Label>
              <Input
                id="cf-phone"
                value={form.phone}
                onChange={(e) => set('phone')(e.target.value)}
                placeholder="+91 98765 43210"
                data-testid="client-phone-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cf-email">Email</Label>
              <Input
                id="cf-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
                placeholder="vivek@example.com"
                data-testid="client-email-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cf-budget">Budget (₹)</Label>
              <Input
                id="cf-budget"
                type="number"
                value={form.budget ?? ''}
                onChange={(e) =>
                  set('budget')(e.target.value ? Number(e.target.value) : undefined)
                }
                placeholder="8500000"
                data-testid="client-budget-input"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cf-location">Preferred Location</Label>
            <Input
              id="cf-location"
              value={form.preferredLocation}
              onChange={(e) => set('preferredLocation')(e.target.value)}
              placeholder="Powai, Mumbai"
              data-testid="client-location-input"
            />
          </div>

          {/* Lead linkage — searchable dropdown */}
          <div className="space-y-1.5">
            <Label>Linked Lead (optional)</Label>
            <Input
              placeholder="Type to search leads…"
              value={leadQuery}
              onChange={(e) => setLeadQuery(e.target.value)}
              data-testid="client-lead-search"
            />
            <Select
              value={form.linkedLeadId || 'NONE'}
              onValueChange={(v) => set('linkedLeadId')(v === 'NONE' ? null : v)}
            >
              <SelectTrigger data-testid="client-lead-select">
                <SelectValue placeholder="No lead linked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">No linked lead</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.fullName} {l.phone ? `· ${l.phone}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Assigned Agent</Label>
              <Select
                value={form.assignedAgentId || 'NONE'}
                onValueChange={(v) => set('assignedAgentId')(v === 'NONE' ? null : v)}
              >
                <SelectTrigger data-testid="client-agent-select">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Unassigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cf-notes">Notes</Label>
            <Textarea
              id="cf-notes"
              value={form.notes}
              onChange={(e) => set('notes')(e.target.value)}
              placeholder="Looking for 3BHK near tech park. Budget flexible..."
              rows={4}
              data-testid="client-notes-textarea"
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="client-form-submit">
            {loading ? 'Saving...' : isEdit ? 'Update Client' : 'Add Client'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

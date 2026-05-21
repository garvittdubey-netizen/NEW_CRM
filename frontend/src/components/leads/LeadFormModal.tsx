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
import { TagInput } from './TagInput';
import { leadsApi, agentsApi, type AgentOption } from '@/services/leads';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { Lead, CreateLeadData, LeadStatus, LeadSource } from '@/types';
import { isAdminLevel } from '@/lib/roles';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  lead?: Lead | null;
}

const EMPTY: CreateLeadData = {
  fullName: '',
  phone: '',
  email: '',
  budget: undefined,
  preferredLocation: '',
  bhk: '',
  propertyType: '',
  status: 'NEW',
  source: 'MANUAL',
  tags: [],
  notes: '',
  assignedAgentId: null,
};

export function LeadFormModal({ open, onClose, onSuccess, lead }: Props) {
  const isEdit = !!lead;
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  const [form, setForm] = useState<CreateLeadData>(EMPTY);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');

    if (lead) {
      setForm({
        fullName: lead.fullName,
        phone: lead.phone ?? '',
        email: lead.email ?? '',
        budget: lead.budget ?? undefined,
        preferredLocation: lead.preferredLocation ?? '',
        bhk: lead.bhk ?? '',
        propertyType: lead.propertyType ?? '',
        status: lead.status,
        source: lead.source,
        tags: lead.tags,
        notes: lead.notes ?? '',
        assignedAgentId: lead.assignedAgentId,
      });
    } else {
      setForm(EMPTY);
    }

    // Only admins manage agent assignment; skip the call otherwise.
    if (isAdmin) {
      agentsApi.list().then(setAgents).catch(() => setAgents([]));
    }
  }, [open, lead, isAdmin]);

  const set = <K extends keyof CreateLeadData>(key: K) =>
    (value: CreateLeadData[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.fullName?.trim()) {
      setError('Full name is required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: CreateLeadData = {
        ...form,
        phone: form.phone || undefined,
        email: form.email || undefined,
        preferredLocation: form.preferredLocation || undefined,
        bhk: form.bhk || undefined,
        propertyType: form.propertyType || undefined,
        budget: form.budget ? Number(form.budget) : null,
        notes: form.notes || undefined,
        assignedAgentId: form.assignedAgentId || null,
      };

      if (isEdit) {
        await leadsApi.update(lead!.id, payload);
      } else {
        await leadsApi.create(payload);
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(extractApiError(e, 'Failed to save lead. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b">
          <DialogTitle>{isEdit ? 'Edit Lead' : 'Add New Lead'}</DialogTitle>
        </DialogHeader>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="lead-form-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Full Name + Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="lf-name"
                value={form.fullName}
                onChange={(e) => set('fullName')(e.target.value)}
                placeholder="Priya Sharma"
                data-testid="lead-fullname-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-phone">Phone</Label>
              <Input
                id="lf-phone"
                value={form.phone}
                onChange={(e) => set('phone')(e.target.value)}
                placeholder="+91 98765 43210"
                data-testid="lead-phone-input"
              />
            </div>
          </div>

          {/* Email + Budget */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-email">Email</Label>
              <Input
                id="lf-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email')(e.target.value)}
                placeholder="priya@example.com"
                data-testid="lead-email-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lf-budget">Budget (₹)</Label>
              <Input
                id="lf-budget"
                type="number"
                value={form.budget ?? ''}
                onChange={(e) =>
                  set('budget')(e.target.value ? Number(e.target.value) : undefined)
                }
                placeholder="5000000"
                data-testid="lead-budget-input"
              />
            </div>
          </div>

          {/* Location + BHK */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lf-location">Preferred Location</Label>
              <Input
                id="lf-location"
                value={form.preferredLocation}
                onChange={(e) => set('preferredLocation')(e.target.value)}
                placeholder="Andheri, Mumbai"
                data-testid="lead-location-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label>BHK</Label>
              <Select
                value={form.bhk || 'NONE'}
                onValueChange={(v) => set('bhk')(v === 'NONE' ? '' : v)}
              >
                <SelectTrigger data-testid="lead-bhk-select">
                  <SelectValue placeholder="Select BHK" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Not specified</SelectItem>
                  <SelectItem value="1BHK">1 BHK</SelectItem>
                  <SelectItem value="2BHK">2 BHK</SelectItem>
                  <SelectItem value="3BHK">3 BHK</SelectItem>
                  <SelectItem value="4BHK+">4 BHK+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Property Type + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Property Type</Label>
              <Select
                value={form.propertyType || 'NONE'}
                onValueChange={(v) => set('propertyType')(v === 'NONE' ? '' : v)}
              >
                <SelectTrigger data-testid="lead-propertytype-select">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Not specified</SelectItem>
                  <SelectItem value="Apartment">Apartment</SelectItem>
                  <SelectItem value="Villa">Villa</SelectItem>
                  <SelectItem value="Plot">Plot</SelectItem>
                  <SelectItem value="Commercial">Commercial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set('status')(v as LeadStatus)}
              >
                <SelectTrigger data-testid="lead-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NEW">New</SelectItem>
                  <SelectItem value="CONTACTED">Contacted</SelectItem>
                  <SelectItem value="QUALIFIED">Qualified</SelectItem>
                  <SelectItem value="NEGOTIATING">Negotiating</SelectItem>
                  <SelectItem value="WON">Won</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Source */}
          <div className="space-y-1.5">
            <Label>Lead Source</Label>
            <Select
              value={form.source || 'MANUAL'}
              onValueChange={(v) => set('source')(v as LeadSource)}
            >
              <SelectTrigger data-testid="lead-source-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MANUAL">Manual</SelectItem>
                <SelectItem value="FACEBOOK">Facebook</SelectItem>
                <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                <SelectItem value="WEBSITE">Website</SelectItem>
                <SelectItem value="REFERRAL">Referral</SelectItem>
                <SelectItem value="PROPERTY_PORTAL">Property Portal</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <TagInput
              value={form.tags ?? []}
              onChange={set('tags')}
              placeholder="hot, investor, referral — press Enter to add"
            />
            <p className="text-xs text-muted-foreground">Press Enter or comma to add a tag</p>
          </div>

          {/* Assign Agent — admin only (PATCH /:id/assign is admin-gated) */}
          {isAdmin && (
            <div className="space-y-1.5">
              <Label>Assign to Agent</Label>
              <Select
                value={form.assignedAgentId || 'NONE'}
                onValueChange={(v) => set('assignedAgentId')(v === 'NONE' ? null : v)}
              >
                <SelectTrigger data-testid="lead-agent-select">
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

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="lf-notes">Notes</Label>
            <Textarea
              id="lf-notes"
              value={form.notes}
              onChange={(e) => set('notes')(e.target.value)}
              placeholder="Interested in sea-facing 3BHK. Budget flexible..."
              rows={3}
              data-testid="lead-notes-textarea"
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="lead-form-submit">
            {loading ? 'Saving...' : isEdit ? 'Update Lead' : 'Add Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

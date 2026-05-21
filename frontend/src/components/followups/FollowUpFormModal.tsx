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
import { followUpsApi } from '@/services/followups';
import { leadsApi, agentsApi, type AgentOption } from '@/services/leads';
import { extractApiError } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import type { FollowUp, CreateFollowUpData, FollowUpStatus, Lead } from '@/types';
import { isAdminLevel } from '@/lib/roles';

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Pre-selected lead — typical when opening the modal from a lead detail page. */
  lead?: Pick<Lead, 'id' | 'fullName'> | null;
  /** Existing follow-up — when set, the modal switches to edit mode. */
  followUp?: FollowUp | null;
}

/** Local-timezone datetime-local string ('YYYY-MM-DDTHH:mm'). */
function toDateTimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const defaultFollowUpDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toDateTimeLocal(d);
};

/**
 * Add / edit follow-up modal.
 *
 * Behaviour:
 *  - When a `lead` is supplied, the lead selector is locked.
 *  - When `followUp` is supplied, switches to edit mode and pre-fills.
 *  - Only ADMINs see the assignee selector; AGENTs are silently auto-assigned.
 *  - The assignee dropdown is sourced from /api/agents (no admins exposed).
 */
export function FollowUpFormModal({ open, onClose, onSuccess, lead, followUp }: Props) {
  const { user } = useAuth();
  const isAdmin = isAdminLevel(user?.role);
  const isEdit = !!followUp;

  const [leadId, setLeadId] = useState<string>(lead?.id ?? followUp?.leadId ?? '');
  const [assignedAgentId, setAssignedAgentId] = useState<string>('');
  const [followUpDate, setFollowUpDate] = useState<string>(defaultFollowUpDate());
  const [reminderDate, setReminderDate] = useState<string>('');
  const [status, setStatus] = useState<FollowUpStatus>('PENDING');
  const [notes, setNotes] = useState<string>('');

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [leads, setLeads] = useState<Pick<Lead, 'id' | 'fullName'>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');

    if (followUp) {
      setLeadId(followUp.leadId);
      setAssignedAgentId(followUp.assignedAgentId);
      setFollowUpDate(toDateTimeLocal(new Date(followUp.followUpDate)));
      setReminderDate(followUp.reminderDate ? toDateTimeLocal(new Date(followUp.reminderDate)) : '');
      setStatus(followUp.status);
      setNotes(followUp.notes ?? '');
    } else {
      setLeadId(lead?.id ?? '');
      setAssignedAgentId(user?.id ?? '');
      setFollowUpDate(defaultFollowUpDate());
      setReminderDate('');
      setStatus('PENDING');
      setNotes('');
    }

    if (isAdmin) {
      agentsApi.list().then(setAgents).catch(() => setAgents([]));
    }
    // Only fetch leads when not pre-locked to one
    if (!lead && !followUp) {
      leadsApi
        .list({ page: 1, limit: 100 })
        .then((r) =>
          setLeads(r.leads.map((l) => ({ id: l.id, fullName: l.fullName }))),
        )
        .catch(() => setLeads([]));
    }
  }, [open, lead, followUp, isAdmin, user?.id]);

  const handleSubmit = async () => {
    if (!leadId || !followUpDate) {
      setError('Lead and follow-up date are required');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload: CreateFollowUpData = {
        leadId,
        // Agents are auto-assigned to themselves; admins choose explicitly.
        assignedAgentId: isAdmin ? assignedAgentId || (user?.id ?? '') : (user?.id ?? ''),
        followUpDate: new Date(followUpDate).toISOString(),
        reminderDate: reminderDate ? new Date(reminderDate).toISOString() : null,
        status,
        notes: notes.trim() || null,
      };
      if (isEdit && followUp) {
        await followUpsApi.update(followUp.id, payload);
      } else {
        await followUpsApi.create(payload);
      }
      onSuccess();
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Failed to save follow-up.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-testid="followup-form-modal">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Follow-up' : 'Schedule Follow-up'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="followup-form-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Lead */}
          <div className="space-y-1.5">
            <Label>Lead</Label>
            {lead ? (
              <div
                className="px-3 py-2 rounded-md border bg-muted/40 text-sm"
                data-testid="followup-lead-locked"
              >
                {lead.fullName}
              </div>
            ) : (
              <Select value={leadId} onValueChange={setLeadId} disabled={isEdit}>
                <SelectTrigger data-testid="followup-lead-select">
                  <SelectValue placeholder="Select lead" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Date + reminder */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fu-date">
                Follow-up Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="fu-date"
                type="datetime-local"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                data-testid="followup-date-input"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fu-reminder">Reminder</Label>
              <Input
                id="fu-reminder"
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                data-testid="followup-reminder-input"
              />
            </div>
          </div>

          {/* Status + assignee */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as FollowUpStatus)}
              >
                <SelectTrigger data-testid="followup-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="MISSED">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isAdmin && (
              <div className="space-y-1.5">
                <Label>Assign to</Label>
                <Select value={assignedAgentId} onValueChange={setAssignedAgentId}>
                  <SelectTrigger data-testid="followup-agent-select">
                    <SelectValue placeholder="Select agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Admins can also assign to themselves */}
                    {user && (
                      <SelectItem value={user.id}>{user.name} (You)</SelectItem>
                    )}
                    {agents
                      .filter((a) => a.id !== user?.id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="fu-notes">Notes</Label>
            <Textarea
              id="fu-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What's the purpose of this follow-up?"
              rows={3}
              data-testid="followup-notes-textarea"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            data-testid="followup-form-submit"
          >
            {loading ? 'Saving...' : isEdit ? 'Update' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from 'react';
import { RotateCcw, AlertCircle, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
import { extractApiError } from '@/services/api';
import type { Client } from '@/types';

/**
 * "Reactivate Lead" modal — captures a structured reason (5 presets + free
 * text) and POSTs to /api/clients/:id/reactivate. The backend decides
 * whether to RESTORE the existing linked lead or CREATE a fresh one from
 * client data; we surface that outcome in the success toast.
 *
 * RBAC visibility is enforced by the caller (ClientDetailPage shows the
 * button only to SUPER_ADMIN / ADMIN / assigned AGENT). The backend
 * independently re-checks, so this UI cannot bypass.
 */
interface Props {
  open: boolean;
  onClose: () => void;
  client: Client | null;
  onSuccess: (result: {
    mode: 'RESTORED' | 'CREATED';
    leadId: string;
  }) => void;
}

const REASON_PRESETS = [
  'Budget issue',
  'Timing issue',
  'Property unavailable',
  'Lost contact',
  'Other',
] as const;
type Preset = (typeof REASON_PRESETS)[number];

export function ReactivateLeadModal({ open, onClose, client, onSuccess }: Props) {
  const [preset, setPreset] = useState<Preset>('Budget issue');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setPreset('Budget issue');
      setDetails('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!client) return;

    // For all presets except "Other", the preset itself is the reason; the
    // optional `details` textarea is appended if filled. For "Other", a
    // non-empty details textarea is required so the audit trail has signal.
    const trimmed = details.trim();
    let reason = preset === 'Other' ? trimmed : preset;
    if (preset === 'Other' && !trimmed) {
      setError('Please describe the reason — required when selecting "Other".');
      return;
    }
    if (preset !== 'Other' && trimmed) {
      reason = `${preset} — ${trimmed}`;
    }
    if (reason.length > 500) {
      setError('Reason is too long (max 500 characters).');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const r = await clientsApi.reactivate(client.id, reason);
      onSuccess({ mode: r.mode, leadId: r.lead.id });
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Failed to reactivate lead.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && !o && onClose()}>
      <DialogContent className="max-w-md" data-testid="reactivate-lead-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw size={18} className="text-primary" />
            Reactivate Lead
          </DialogTitle>
          <DialogDescription className="pt-1">
            Move <strong>{client?.fullName}</strong> back into active lead
            nurturing without losing any history. The linked lead will be
            re-opened, or a new one created from the client data if no link
            exists.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="reactivate-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reactivate-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger id="reactivate-reason" data-testid="reactivate-reason-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASON_PRESETS.map((r) => (
                  <SelectItem key={r} value={r} data-testid={`reactivate-reason-option-${r.replace(/\s+/g, '-').toLowerCase()}`}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reactivate-details">
              {preset === 'Other' ? (
                <>Details <span className="text-destructive">*</span></>
              ) : (
                <>Additional notes <span className="text-muted-foreground text-xs">(optional)</span></>
              )}
            </Label>
            <Textarea
              id="reactivate-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={
                preset === 'Other'
                  ? 'Describe the reason for reactivation...'
                  : 'Add any context you want recorded in the timeline'
              }
              rows={3}
              data-testid="reactivate-details-textarea"
              maxLength={400}
            />
            <p className="text-[11px] text-muted-foreground">
              The reason is logged on the client and lead timelines.
            </p>
          </div>

          <div className="flex items-start gap-2 p-2.5 rounded-md bg-primary/5 border border-primary/15 text-xs">
            <Sparkles size={13} className="shrink-0 text-primary mt-0.5" />
            <p className="text-muted-foreground leading-relaxed">
              All communication history, follow-ups, and deal references will
              be preserved. The linked lead will surface again in the Pipeline
              and the AGENT's active workspace.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            data-testid="reactivate-cancel-button"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !client}
            data-testid="reactivate-submit-button"
          >
            {loading ? 'Reactivating...' : 'Reactivate Lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

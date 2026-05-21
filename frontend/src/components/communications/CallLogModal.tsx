import { useState } from 'react';
import { AlertCircle, PhoneCall } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { communicationsApi } from '@/services/communications';
import { extractApiError } from '@/services/api';
import type { Lead } from '@/types';

const OUTCOMES = [
  'CONNECTED',
  'INTERESTED',
  'NOT_INTERESTED',
  'CALLBACK_REQUESTED',
  'NO_ANSWER',
  'WRONG_NUMBER',
  'VOICEMAIL',
];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Lead the call is being logged against. */
  lead: Pick<Lead, 'id' | 'fullName' | 'phone'>;
  onSuccess: () => void;
}

/**
 * Manual call-log modal. Posts to /api/communications/calls and refreshes
 * the parent's timeline on success.
 */
export function CallLogModal({ open, onClose, lead, onSuccess }: Props) {
  const [outcome, setOutcome] = useState('CONNECTED');
  const [durationMin, setDurationMin] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setOutcome('CONNECTED');
    setDurationMin('');
    setNotes('');
    setError('');
  };

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const callDuration = durationMin ? Math.max(0, Math.round(Number(durationMin) * 60)) : undefined;
      await communicationsApi.logCall({
        leadId: lead.id,
        callOutcome: outcome,
        callDuration,
        notes: notes.trim() || undefined,
      });
      reset();
      onSuccess();
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Failed to log call.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (reset(), onClose())}>
      <DialogContent className="max-w-md" data-testid="call-log-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall size={15} />
            Log a call with {lead.fullName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="call-log-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              Outcome <span className="text-destructive">*</span>
            </Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger data-testid="call-outcome-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o} value={o}>{o.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="call-duration">Duration (minutes)</Label>
            <Input
              id="call-duration"
              type="number"
              min="0"
              step="0.5"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="e.g. 4.5"
              data-testid="call-duration-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="call-notes">Notes</Label>
            <Textarea
              id="call-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What did you discuss?"
              data-testid="call-notes-textarea"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => (reset(), onClose())} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading} data-testid="call-log-submit">
            {loading ? 'Saving...' : 'Log call'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

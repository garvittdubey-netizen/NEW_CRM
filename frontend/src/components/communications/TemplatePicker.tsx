import { useEffect, useState } from 'react';
import { AlertCircle, FileText } from 'lucide-react';
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
import { communicationsApi } from '@/services/communications';
import { extractApiError } from '@/services/api';
import type { WhatsAppTemplate } from '@/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen template + filled-in variables after the user clicks "Use template". */
  onSelect: (templateName: string, languageCode: string, variables: string[]) => void;
}

/**
 * Loads approved WhatsApp templates from /api/communications/templates and
 * lets the user fill in the {{n}} body placeholders. On submit, passes the
 * resolved values back to the parent (which is responsible for actually
 * sending the message).
 */
export function TemplatePicker({ open, onClose, onSelect }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setError('');
    setSelectedId(null);
    setParams([]);
    setLoading(true);
    communicationsApi
      .templates()
      .then((tpls) => setTemplates(tpls))
      .catch((e) => setError(extractApiError(e, 'Failed to load WhatsApp templates.')))
      .finally(() => setLoading(false));
  }, [open]);

  const selected = templates.find((t) => t.id === selectedId) ?? null;

  const handleSelectTemplate = (t: WhatsAppTemplate) => {
    setSelectedId(t.id);
    setParams(Array(t.bodyParamCount).fill(''));
  };

  const handleSubmit = () => {
    if (!selected) return;
    onSelect(selected.name, selected.language, params);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="template-picker-modal">
        <DialogHeader>
          <DialogTitle>Pick an approved WhatsApp template</DialogTitle>
        </DialogHeader>

        {error && (
          <div
            className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
            data-testid="template-picker-error"
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{error}</p>
              <p className="text-xs mt-1 text-destructive/80">
                Templates come from Meta. Confirm the access token is valid and that the WhatsApp Business Account has approved templates.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh]">
          <div className="md:border-r md:pr-4 overflow-y-auto" data-testid="template-list">
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No approved templates available.
              </p>
            ) : (
              <ul className="space-y-1">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => handleSelectTemplate(t)}
                      className={`w-full text-left rounded-md p-3 border transition-colors ${
                        selectedId === t.id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/40'
                      }`}
                      data-testid={`template-option-${t.name}`}
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={13} className="text-primary shrink-0" />
                        <span className="font-medium text-sm truncate">{t.name}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="uppercase">{t.language}</span>
                        <span>·</span>
                        <span className="uppercase">{t.category}</span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-y-auto" data-testid="template-detail">
            {!selected ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                Select a template to preview and fill in variables.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Body preview</p>
                  <p className="text-sm whitespace-pre-wrap">{selected.bodyText || '(no body)'}</p>
                </div>
                {selected.bodyParamCount === 0 ? (
                  <p className="text-xs text-muted-foreground">This template has no variables.</p>
                ) : (
                  <div className="space-y-2">
                    {Array.from({ length: selected.bodyParamCount }).map((_, idx) => (
                      <div key={idx} className="space-y-1">
                        <Label className="text-xs">Variable {`{{${idx + 1}}}`}</Label>
                        <Input
                          value={params[idx] ?? ''}
                          onChange={(e) => {
                            const next = [...params];
                            next[idx] = e.target.value;
                            setParams(next);
                          }}
                          data-testid={`template-param-${idx}`}
                          placeholder={`Value for {{${idx + 1}}}`}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selected || params.some((p) => !p.trim())}
            data-testid="template-picker-submit"
          >
            Use template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

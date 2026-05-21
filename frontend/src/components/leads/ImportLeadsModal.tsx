import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, AlertCircle, XCircle, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import api, { extractApiError } from '@/services/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete: () => void; // re-fetch leads after a successful import
}

interface ImportRowResult {
  row: number;
  status: 'imported' | 'skipped' | 'failed';
  reason?: string;
  leadId?: string;
}

interface ImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB — matches backend multer limit

/**
 * Drag-and-drop CSV import modal. After a successful upload it switches to
 * the summary view (imported/skipped/failed counters + per-row table) and
 * the parent's `onComplete` is called so the leads list refreshes.
 */
export function ImportLeadsModal({ open, onClose, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setSummary(null);
    setError('');
    setDragging(false);
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleFileSelected = (chosen: File | undefined) => {
    setError('');
    if (!chosen) return;
    if (!/\.csv$/i.test(chosen.name)) {
      setError('Only .csv files are accepted');
      return;
    }
    if (chosen.size > MAX_SIZE) {
      setError('File exceeds 5 MB limit');
      return;
    }
    setFile(chosen);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFileSelected(e.dataTransfer.files?.[0]);
  };

  const downloadSample = async () => {
    try {
      const res = await api.get('/leads/sample-template', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads-sample-template.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(extractApiError(e, 'Failed to download template'));
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<ImportSummary>('/leads/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSummary(res.data);
      if (res.data.imported > 0) onComplete();
    } catch (e) {
      setError(extractApiError(e, 'Import failed'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col" data-testid="import-leads-modal">
        <DialogHeader>
          <DialogTitle>Import Leads from CSV</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {error && (
            <div
              className="flex items-start gap-2 p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md"
              data-testid="import-error"
            >
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {!summary ? (
            <>
              {/* Drag-drop zone */}
              <div
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
                  ${dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-muted-foreground/50'}
                `}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                data-testid="import-dropzone"
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFileSelected(e.target.files?.[0] ?? undefined)}
                  data-testid="import-file-input"
                />
                {file ? (
                  <div className="flex flex-col items-center gap-2" data-testid="import-file-preview">
                    <FileText size={28} className="text-primary" />
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Upload size={28} className="text-muted-foreground" />
                    <p className="font-medium">Drop your CSV here, or click to browse</p>
                    <p className="text-xs text-muted-foreground">Max 5 MB. UTF-8 encoded.</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
                <span>
                  <strong className="font-medium">Required columns:</strong> fullName.
                  Duplicates are detected by phone or email.
                </span>
                <Button
                  variant="link"
                  size="sm"
                  onClick={downloadSample}
                  className="h-auto p-0 text-xs"
                  data-testid="download-sample-button"
                >
                  <Download size={12} className="mr-1" />
                  Sample template
                </Button>
              </div>
            </>
          ) : (
            <ImportSummaryView summary={summary} />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            {summary ? 'Close' : 'Cancel'}
          </Button>
          {!summary && (
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              data-testid="import-submit-button"
            >
              {uploading ? 'Importing...' : 'Import'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSummaryView({ summary }: { summary: ImportSummary }) {
  return (
    <div className="space-y-4" data-testid="import-summary">
      <div className="grid grid-cols-4 gap-3">
        <SummaryStat label="Total"    value={summary.total}    testId="summary-total" />
        <SummaryStat label="Imported" value={summary.imported} testId="summary-imported" accent="success" />
        <SummaryStat label="Skipped"  value={summary.skipped}  testId="summary-skipped"  accent="warning" />
        <SummaryStat label="Failed"   value={summary.failed}   testId="summary-failed"   accent="danger" />
      </div>

      {summary.rows.length > 0 && (
        <div className="border rounded-md max-h-[300px] overflow-y-auto">
          <table className="w-full text-xs" data-testid="summary-rows-table">
            <thead className="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Row</th>
                <th className="text-left px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Reason / Lead ID</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => (
                <tr key={r.row} className="border-t" data-testid={`summary-row-${r.row}`}>
                  <td className="px-3 py-1.5">{r.row}</td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground font-mono">
                    {r.reason || r.leadId || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label, value, testId, accent = 'default',
}: { label: string; value: number; testId: string; accent?: 'default' | 'success' | 'warning' | 'danger' }) {
  const accentClass = {
    default: 'text-foreground',
    success: 'text-emerald-600 dark:text-emerald-400',
    warning: 'text-amber-600 dark:text-amber-400',
    danger:  'text-red-600 dark:text-red-400',
  }[accent];
  return (
    <div className="rounded-md border p-3" data-testid={testId}>
      <p className={`text-2xl font-heading font-bold ${accentClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ImportRowResult['status'] }) {
  if (status === 'imported') {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900">
        <CheckCircle2 size={11} className="mr-1" />
        Imported
      </Badge>
    );
  }
  if (status === 'skipped') {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900">
        <AlertCircle size={11} className="mr-1" />
        Skipped
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900">
      <XCircle size={11} className="mr-1" />
      Failed
    </Badge>
  );
}

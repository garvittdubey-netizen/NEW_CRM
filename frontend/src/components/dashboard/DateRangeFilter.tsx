import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AnalyticsRange } from '@/types';

interface Props {
  range: AnalyticsRange;
  from: string;
  to: string;
  onChange: (range: AnalyticsRange, from: string, to: string) => void;
}

const PRESETS: { value: AnalyticsRange; label: string; testId: string }[] = [
  { value: 'today', label: 'Today',        testId: 'range-today' },
  { value: '7d',    label: 'Last 7 days',  testId: 'range-7d' },
  { value: '30d',   label: 'Last 30 days', testId: 'range-30d' },
  { value: 'custom', label: 'Custom',      testId: 'range-custom' },
];

/**
 * Pill-style range filter. Custom mode reveals two native date inputs;
 * the parent owns the resolved `from`/`to` values so the dashboard can
 * fan them out to every chart in a single state update.
 */
export function DateRangeFilter({ range, from, to, onChange }: Props) {
  const [pendingFrom, setPendingFrom] = useState(from);
  const [pendingTo, setPendingTo] = useState(to);

  const handlePreset = (value: AnalyticsRange) => {
    if (value === 'custom') {
      onChange('custom', pendingFrom || from, pendingTo || to);
    } else {
      onChange(value, '', '');
    }
  };

  const handleApplyCustom = () => {
    if (pendingFrom && pendingTo) {
      onChange('custom', pendingFrom, pendingTo);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="date-range-filter">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.value}
            variant={range === preset.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset(preset.value)}
            data-testid={preset.testId}
            className="h-8"
          >
            {preset.value === 'custom' && <Calendar size={13} className="mr-1.5" />}
            {preset.label}
          </Button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="flex items-center gap-2 pl-1" data-testid="custom-range-inputs">
          <Input
            type="date"
            value={pendingFrom}
            onChange={(e) => setPendingFrom(e.target.value)}
            className="h-8 w-[150px] text-xs"
            data-testid="range-from-input"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={pendingTo}
            onChange={(e) => setPendingTo(e.target.value)}
            className="h-8 w-[150px] text-xs"
            data-testid="range-to-input"
          />
          <Button
            size="sm"
            onClick={handleApplyCustom}
            disabled={!pendingFrom || !pendingTo}
            data-testid="range-apply-button"
            className="h-8"
          >
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}

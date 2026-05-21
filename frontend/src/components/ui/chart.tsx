/**
 * Thin wrapper around Recharts' ResponsiveContainer that gives every chart
 * a consistent size + tooltip theme tied to our Tailwind/Shadcn tokens.
 *
 * This is intentionally minimal — we don't ship the full shadcn/chart.tsx
 * registry component because we only need a responsive shell.
 *
 * `printMode`:
 *   Recharts' ResponsiveContainer measures its parent via ResizeObserver,
 *   which is asynchronous. When the browser snapshots the page for
 *   `window.print()` the @media print rules change parent widths
 *   synchronously, but Recharts has not yet re-measured — so the embedded
 *   <svg> is captured at its stale (often zero-or-tiny) on-screen width,
 *   producing blank/clipped charts in the generated PDF.
 *
 *   When `printMode` is true we bypass ResponsiveContainer entirely and
 *   clone the chart child with explicit width + height props. The chart
 *   then renders to a fully-laid-out SVG that is print-snapshot-safe.
 *
 *   Normal on-screen rendering is unchanged (printMode defaults to false).
 */
import * as React from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  height?: number;
  /** Render the chart with explicit width/height (no ResponsiveContainer)
   *  so the SVG is fully laid out before a print snapshot. */
  printMode?: boolean;
  /** Explicit width used when `printMode` is true. Defaults to 680px which
   *  comfortably fits inside an A4 page with 12mm margins (~ 186mm usable
   *  width, halved for the two-column charts and rounded down to 680). */
  printWidth?: number;
}

export function ChartContainer({
  className,
  children,
  height = 260,
  printMode = false,
  printWidth = 680,
  ...rest
}: ChartContainerProps) {
  if (printMode && React.isValidElement(children)) {
    // Clone the chart with explicit pixel dimensions — bypasses
    // ResponsiveContainer + ResizeObserver entirely so the SVG is
    // ready in the same tick as the print snapshot.
    const printChild = React.cloneElement(
      children as React.ReactElement<{ width?: number; height?: number }>,
      { width: printWidth, height },
    );
    return (
      <div
        className={cn('w-full', className)}
        style={{ width: printWidth, height, maxWidth: '100%' }}
        {...rest}
      >
        {printChild}
      </div>
    );
  }

  return (
    <div className={cn('w-full', className)} style={{ height }} {...rest}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Tooltip styling shared across every chart. Recharts merges these into its
 * default tooltip without forcing us to ship a custom component each time.
 */
export const tooltipStyle: React.CSSProperties = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--popover-foreground))',
  fontSize: '12px',
  padding: '8px 10px',
};

export const tooltipItemStyle: React.CSSProperties = {
  color: 'hsl(var(--popover-foreground))',
};

export const tooltipLabelStyle: React.CSSProperties = {
  color: 'hsl(var(--muted-foreground))',
  fontSize: '11px',
  marginBottom: '4px',
};

/** Palette used for categorical series (status, source, agents...). */
export const CHART_COLORS = [
  '#1e3a5f', // navy-500
  '#5880ba', // navy-400
  '#82a0cb', // navy-300
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
];

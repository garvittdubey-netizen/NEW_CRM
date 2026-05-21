import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  CalendarDays,
  ListTodo,
  CheckCircle2,
  Pencil,
  Trash2,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ReminderBadge, classifyFollowUp } from '@/components/followups/ReminderBadge';
import { FollowUpFormModal } from '@/components/followups/FollowUpFormModal';
import { followUpsApi } from '@/services/followups';
import { extractApiError } from '@/services/api';
import type { FollowUp } from '@/types';
import { useAuth } from '@/hooks/useAuth';
import { isAdminLevel } from '@/lib/roles';

type ViewMode = 'list' | 'calendar';
type WindowFilter = 'all' | 'upcoming' | 'overdue' | 'today';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtDayHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);

  if (start.getTime() === today.getTime()) return 'Today';
  if (start.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Groups follow-ups by their calendar day (YYYY-MM-DD).
 */
function groupByDay(items: FollowUp[]): { key: string; sample: string; items: FollowUp[] }[] {
  const buckets = new Map<string, FollowUp[]>();
  for (const it of items) {
    const d = new Date(it.followUpDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(it);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({ key, sample: items[0].followUpDate, items }));
}

export default function FollowUpsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [view, setView] = useState<ViewMode>('list');
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FollowUp | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (windowFilter !== 'all') params.window = windowFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const data = await followUpsApi.list({ ...params, limit: 100 } as never);
      setItems(data.followUps);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [windowFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleComplete = async (fu: FollowUp) => {
    try {
      await followUpsApi.complete(fu.id);
      fetchData();
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to mark follow-up complete.'));
    }
  };

  const handleDelete = async (fu: FollowUp) => {
    if (!window.confirm(`Delete this follow-up for "${fu.lead.fullName}"?`)) return;
    try {
      await followUpsApi.delete(fu.id);
      fetchData();
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to delete follow-up.'));
    }
  };

  const groups = groupByDay(items);

  return (
    <div className="space-y-5 animate-fade-in" data-testid="followups-page">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-heading font-semibold tracking-tight">Follow-ups</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {items.length} follow-up{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} data-testid="add-followup-button">
          <Plus size={16} className="mr-1.5" />
          New Follow-up
        </Button>
      </div>

      {/* Filters + view toggle */}
      <Card>
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={windowFilter} onValueChange={(v) => setWindowFilter(v as WindowFilter)}>
            <SelectTrigger className="w-[160px]" data-testid="followup-window-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="upcoming">Upcoming</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]" data-testid="followup-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="MISSED">Missed</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto inline-flex rounded-md border bg-card p-0.5" data-testid="followup-view-toggle">
            <ViewToggleButton
              active={view === 'list'}
              onClick={() => setView('list')}
              icon={ListTodo}
              label="List"
              testId="view-list"
            />
            <ViewToggleButton
              active={view === 'calendar'}
              onClick={() => setView('calendar')}
              icon={CalendarDays}
              label="Calendar"
              testId="view-calendar"
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <EmptyState onAdd={() => setAddOpen(true)} />
      ) : view === 'calendar' ? (
        <CalendarView items={items} onSelect={setEditing} />
      ) : (
        <div className="space-y-5" data-testid="followups-list">
          {groups.map((group) => (
            <DayGroup
              key={group.key}
              dayLabel={fmtDayHeader(group.sample)}
              items={group.items}
              isAdmin={isAdminLevel(user?.role)}
              onEdit={setEditing}
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <FollowUpFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchData}
      />
      <FollowUpFormModal
        open={!!editing}
        followUp={editing}
        onClose={() => setEditing(null)}
        onSuccess={() => { fetchData(); setEditing(null); }}
      />
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ViewToggleButton({
  active, onClick, icon: Icon, label, testId,
}: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string; testId: string;
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <Icon size={13} />
      {label}
    </button>
  );
}

function DayGroup({
  dayLabel, items, isAdmin, onEdit, onComplete, onDelete,
}: {
  dayLabel: string;
  items: FollowUp[];
  isAdmin: boolean;
  onEdit: (fu: FollowUp) => void;
  onComplete: (fu: FollowUp) => void;
  onDelete: (fu: FollowUp) => void;
}) {
  return (
    <Card data-testid={`day-group-${dayLabel.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="p-0">
        <div className="px-5 py-3 border-b bg-muted/30 flex items-center gap-2">
          <CalendarDays size={14} className="text-muted-foreground" />
          <h3 className="text-sm font-semibold">{dayLabel}</h3>
          <span className="text-xs text-muted-foreground ml-auto">
            {items.length} follow-up{items.length !== 1 ? 's' : ''}
          </span>
        </div>
        <ul className="divide-y">
          {items.map((fu) => (
            <FollowUpRow
              key={fu.id}
              fu={fu}
              isAdmin={isAdmin}
              onEdit={() => onEdit(fu)}
              onComplete={() => onComplete(fu)}
              onDelete={() => onDelete(fu)}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FollowUpRow({
  fu, isAdmin, onEdit, onComplete, onDelete,
}: {
  fu: FollowUp;
  isAdmin: boolean;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
}) {
  const effective = classifyFollowUp(fu.followUpDate, fu.status);
  return (
    <li
      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 group"
      data-testid={`followup-row-${fu.id}`}
    >
      <Clock size={15} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/leads/${fu.leadId}`}
            className="font-medium hover:text-primary truncate"
          >
            {fu.lead.fullName}
          </Link>
          <ReminderBadge status={effective} />
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
          <span>{fmtDateTime(fu.followUpDate)}</span>
          <span>·</span>
          <span>{fu.assignedAgent.name}</span>
          {fu.notes && (
            <>
              <span>·</span>
              <span className="truncate">{fu.notes}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {fu.status === 'PENDING' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:text-emerald-600"
            onClick={onComplete}
            data-testid={`complete-followup-${fu.id}`}
            title="Mark complete"
          >
            <CheckCircle2 size={14} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
          data-testid={`edit-followup-${fu.id}`}
        >
          <Pencil size={13} />
        </Button>
        {isAdmin && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:text-destructive"
            onClick={onDelete}
            data-testid={`delete-followup-${fu.id}`}
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Lightweight month-grid calendar. Each cell shows up to two follow-ups,
 * clicking a follow-up opens it in the edit modal.
 */
function CalendarView({
  items,
  onSelect,
}: {
  items: FollowUp[];
  onSelect: (fu: FollowUp) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Map yyyy-mm-dd -> follow-ups
  const byDay = new Map<string, FollowUp[]>();
  for (const fu of items) {
    const d = new Date(fu.followUpDate);
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(fu);
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const cells: ({ day: number; date: Date } | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, date: new Date(year, month, d) });

  const prevMonth = () => setCursor(new Date(year, month - 1, 1));
  const nextMonth = () => setCursor(new Date(year, month + 1, 1));

  return (
    <Card data-testid="followup-calendar">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading text-base font-semibold">
            {cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </h3>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={prevMonth} data-testid="cal-prev">
              ‹
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={nextMonth} data-testid="cal-next">
              ›
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground text-center py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) return <div key={i} className="h-20 rounded-md bg-muted/20" />;
            const key = `${year}-${month}-${cell.day}`;
            const dayItems = byDay.get(key) ?? [];
            const isToday =
              cell.date.toDateString() === today.toDateString();
            return (
              <div
                key={i}
                className={`h-20 rounded-md border p-1.5 flex flex-col text-xs overflow-hidden ${
                  isToday ? 'border-primary bg-primary/5' : 'border-border'
                }`}
              >
                <span className={`text-[11px] font-medium ${isToday ? 'text-primary' : ''}`}>
                  {cell.day}
                </span>
                <div className="flex flex-col gap-0.5 mt-1">
                  {dayItems.slice(0, 2).map((fu) => {
                    const effective = classifyFollowUp(fu.followUpDate, fu.status);
                    return (
                      <button
                        key={fu.id}
                        onClick={() => onSelect(fu)}
                        className="text-left truncate hover:underline"
                        data-testid={`cal-item-${fu.id}`}
                      >
                        <ReminderBadge status={effective} className="mr-1" />
                        <span className="truncate">{fu.lead.fullName}</span>
                      </button>
                    );
                  })}
                  {dayItems.length > 2 && (
                    <span className="text-[10px] text-muted-foreground">+{dayItems.length - 2} more</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card data-testid="followups-empty">
      <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <AlertTriangle size={20} className="text-muted-foreground" />
        </div>
        <p className="font-medium mb-1">No follow-ups yet</p>
        <p className="text-sm text-muted-foreground mb-4">
          Schedule your first follow-up to keep deals moving.
        </p>
        <Button size="sm" onClick={onAdd}>
          <Plus size={14} className="mr-1.5" />
          New Follow-up
        </Button>
      </CardContent>
    </Card>
  );
}

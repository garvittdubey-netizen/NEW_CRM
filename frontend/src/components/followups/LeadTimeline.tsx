import { useState, useEffect } from 'react';
import { CalendarPlus, CheckCircle2, Pencil, Clock, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ReminderBadge, classifyFollowUp } from '@/components/followups/ReminderBadge';
import { FollowUpFormModal } from '@/components/followups/FollowUpFormModal';
import { followUpsApi } from '@/services/followups';
import { extractApiError } from '@/services/api';
import type { FollowUp, Lead } from '@/types';

interface Props {
  /** Parent lead whose timeline this is. */
  lead: Pick<Lead, 'id' | 'fullName'>;
  /** True when the current user is allowed to add/edit/complete follow-ups for this lead. */
  canManage: boolean;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Per-lead follow-up timeline. Lists all follow-ups for the lead in chronological
 * order; permits inline add/edit/complete when the caller is allowed to manage
 * the parent lead (canManage prop = lead.assignedAgentId === me OR I'm admin).
 */
export function LeadTimeline({ lead, canManage }: Props) {
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<FollowUp | null>(null);

  const fetchData = () => {
    setLoading(true);
    followUpsApi
      .list({ leadId: lead.id, limit: 100 })
      .then((r) => setItems(r.followUps))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchData, [lead.id]);

  const handleComplete = async (fu: FollowUp) => {
    try {
      await followUpsApi.complete(fu.id);
      fetchData();
    } catch (e) {
      window.alert(extractApiError(e, 'Failed to mark follow-up complete.'));
    }
  };

  return (
    <Card data-testid="lead-timeline">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <MessageSquare size={13} />
          Follow-up Timeline
        </CardTitle>
        {canManage && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            className="h-7 text-xs"
            data-testid="add-timeline-followup"
          >
            <CalendarPlus size={12} className="mr-1" />
            Schedule
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center" data-testid="timeline-empty">
            No follow-ups scheduled yet.
          </p>
        ) : (
          <ol className="relative space-y-4 pl-5 border-l border-border" data-testid="timeline-items">
            {items.map((fu) => {
              const effective = classifyFollowUp(fu.followUpDate, fu.status);
              return (
                <li key={fu.id} className="relative" data-testid={`timeline-item-${fu.id}`}>
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <ReminderBadge status={effective} />
                        <span className="text-sm font-medium">{fmtDateTime(fu.followUpDate)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock size={11} />
                        Assigned to {fu.assignedAgent.name}
                      </p>
                      {fu.notes && (
                        <p className="text-sm text-foreground/80 mt-1.5 whitespace-pre-wrap">
                          {fu.notes}
                        </p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-1 shrink-0">
                        {fu.status === 'PENDING' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 hover:text-emerald-600"
                            onClick={() => handleComplete(fu)}
                            data-testid={`timeline-complete-${fu.id}`}
                            title="Mark complete"
                          >
                            <CheckCircle2 size={13} />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => setEditing(fu)}
                          data-testid={`timeline-edit-${fu.id}`}
                        >
                          <Pencil size={12} />
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>

      <FollowUpFormModal
        open={addOpen}
        lead={lead}
        onClose={() => setAddOpen(false)}
        onSuccess={fetchData}
      />
      <FollowUpFormModal
        open={!!editing}
        lead={lead}
        followUp={editing}
        onClose={() => setEditing(null)}
        onSuccess={() => { fetchData(); setEditing(null); }}
      />
    </Card>
  );
}

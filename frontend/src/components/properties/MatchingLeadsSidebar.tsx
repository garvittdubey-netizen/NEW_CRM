import { Link, useNavigate } from 'react-router-dom';
import { MessageSquare, Phone, UserCircle, ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/leads/StatusBadge';
import { formatPrice } from '@/lib/property-format';
import type { MatchingLead } from '@/types';

interface Props {
  leads: MatchingLead[];
  loading: boolean;
}

/**
 * "Matching Leads" sidebar shown on the property detail page. Read-only —
 * users open the lead profile from here, or jump straight to WhatsApp.
 * No automatic linking happens between Property ↔ Lead.
 */
export function MatchingLeadsSidebar({ leads, loading }: Props) {
  const navigate = useNavigate();

  return (
    <Card data-testid="matching-leads-sidebar">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-primary" />
          <h3 className="font-semibold">Matching Leads</h3>
          <span
            className="ml-auto text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full"
            data-testid="matching-leads-count"
          >
            {loading ? '…' : leads.length}
          </span>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground py-6 text-center">Finding matches…</p>
        ) : leads.length === 0 ? (
          <div className="py-6 text-center" data-testid="matching-leads-empty">
            <p className="text-sm text-muted-foreground">No matching leads yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Leads with similar location, type or budget will appear here.
            </p>
          </div>
        ) : (
          <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
            {leads.map((lead) => (
              <li
                key={lead.id}
                className="rounded-md border p-3 hover:border-primary/40 hover:bg-accent/30 transition-colors"
                data-testid={`matching-lead-${lead.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/leads/${lead.id}`}
                    className="font-medium text-sm hover:text-primary truncate flex-1"
                    data-testid={`open-matching-lead-${lead.id}`}
                  >
                    {lead.fullName}
                  </Link>
                  <StatusBadge status={lead.status} />
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {lead.phone && (
                    <span className="flex items-center gap-1">
                      <Phone size={10} /> {lead.phone}
                    </span>
                  )}
                  {lead.budget != null && <span>{formatPrice(lead.budget)}</span>}
                  {lead.preferredLocation && (
                    <span className="truncate max-w-[140px]">{lead.preferredLocation}</span>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <UserCircle size={11} />
                    {lead.assignedAgent?.name ?? 'Unassigned'}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-30"
                      disabled={!lead.phone}
                      onClick={() => navigate(`/communications?leadId=${lead.id}`)}
                      data-testid={`message-matching-lead-${lead.id}`}
                      title={lead.phone ? 'Open WhatsApp' : 'No phone on file'}
                    >
                      <MessageSquare size={12} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => navigate(`/leads/${lead.id}`)}
                      data-testid={`view-matching-lead-${lead.id}`}
                    >
                      <ArrowRight size={12} />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

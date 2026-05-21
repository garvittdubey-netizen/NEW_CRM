import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, UserCircle, Link2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/leads/StatusBadge';
import type { Client } from '@/types';

/** Compact INR formatter shared with cards/rows. */
function formatBudget(value: number | null): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

/** Grid-view client card. Click navigates to the detail page. */
export function ClientCard({ client }: { client: Client }) {
  const initials = client.fullName.charAt(0).toUpperCase();

  return (
    <Link
      to={`/clients/${client.id}`}
      className="block group"
      data-testid={`client-card-${client.id}`}
    >
      <Card className="h-full p-4 transition-all hover:shadow-md hover:-translate-y-0.5 hover:border-primary/40">
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center text-base font-semibold">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold leading-tight truncate group-hover:text-primary transition-colors">
              {client.fullName}
            </h3>
            {client.preferredLocation && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <MapPin size={11} /> <span className="truncate">{client.preferredLocation}</span>
              </p>
            )}
          </div>
          <p className="text-sm font-semibold text-primary whitespace-nowrap">
            {formatBudget(client.budget)}
          </p>
        </div>

        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {client.phone && (
            <p className="flex items-center gap-1.5">
              <Phone size={11} /> {client.phone}
            </p>
          )}
          {client.email && (
            <p className="flex items-center gap-1.5 truncate">
              <Mail size={11} /> {client.email}
            </p>
          )}
        </div>

        <div className="mt-3 pt-3 border-t flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <UserCircle size={11} />
            {client.assignedAgent?.name?.split(' ')[0] ?? 'Unassigned'}
          </span>
          {client.linkedLead && (
            <span
              className="flex items-center gap-1"
              data-testid={`client-card-linked-${client.id}`}
              title={`Linked to lead: ${client.linkedLead.fullName}`}
            >
              <Link2 size={11} />
              <span className="truncate max-w-[80px]">{client.linkedLead.fullName}</span>
              <StatusBadge status={client.linkedLead.status} />
            </span>
          )}
        </div>
      </Card>
    </Link>
  );
}

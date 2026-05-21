import { Link } from 'react-router-dom';
import { Phone, Mail, MapPin, UserCircle, Link2 } from 'lucide-react';
import { StatusBadge } from '@/components/leads/StatusBadge';
import type { Client } from '@/types';

function formatBudget(value: number | null): string {
  if (value == null) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

/** Dense list row variant used by the list-view toggle. */
export function ClientListRow({ client }: { client: Client }) {
  return (
    <Link
      to={`/clients/${client.id}`}
      className="block group"
      data-testid={`client-row-${client.id}`}
    >
      <div className="flex items-center gap-4 p-3 border-b last:border-0 hover:bg-muted/40 transition-colors">
        <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-semibold">
          {client.fullName.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold leading-tight truncate">{client.fullName}</h3>
            {client.linkedLead && (
              <span
                className="text-[10px] flex items-center gap-1 text-muted-foreground"
                title={`Linked to lead: ${client.linkedLead.fullName}`}
              >
                <Link2 size={10} /> {client.linkedLead.fullName}
                <StatusBadge status={client.linkedLead.status} />
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {client.phone && (
              <span className="flex items-center gap-1">
                <Phone size={10} /> {client.phone}
              </span>
            )}
            {client.email && (
              <span className="flex items-center gap-1 truncate max-w-[200px]">
                <Mail size={10} /> {client.email}
              </span>
            )}
            {client.preferredLocation && (
              <span className="flex items-center gap-1">
                <MapPin size={10} /> {client.preferredLocation}
              </span>
            )}
          </div>
        </div>

        <span className="text-xs text-muted-foreground flex items-center gap-1 hidden md:flex">
          <UserCircle size={11} />
          {client.assignedAgent?.name ?? 'Unassigned'}
        </span>

        <p className="text-sm font-semibold text-primary whitespace-nowrap">
          {formatBudget(client.budget)}
        </p>
      </div>
    </Link>
  );
}

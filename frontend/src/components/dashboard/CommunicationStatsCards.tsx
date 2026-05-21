import { MessageSquare, Inbox, Phone, MessagesSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CommunicationStats } from '@/types';

interface Props {
  stats: CommunicationStats | null;
  loading: boolean;
}

interface CommStatCardConfig {
  testId: string;
  title: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  getValue: (s: CommunicationStats) => number;
  description: string;
}

const CARDS: CommStatCardConfig[] = [
  {
    testId: 'comm-messages-sent',
    title: 'Messages Sent',
    icon: MessageSquare,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-50 dark:bg-blue-950/50',
    getValue: (s) => s.messagesSent,
    description: 'Outbound WhatsApp',
  },
  {
    testId: 'comm-messages-received',
    title: 'Messages Received',
    icon: Inbox,
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    getValue: (s) => s.messagesReceived,
    description: 'Inbound WhatsApp',
  },
  {
    testId: 'comm-calls-logged',
    title: 'Calls Logged',
    icon: Phone,
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-50 dark:bg-amber-950/50',
    getValue: (s) => s.callsLogged,
    description: 'Outbound + logged',
  },
  {
    testId: 'comm-total',
    title: 'Total Interactions',
    icon: MessagesSquare,
    iconColor: 'text-purple-600 dark:text-purple-400',
    iconBg: 'bg-purple-50 dark:bg-purple-950/50',
    getValue: (s) => s.total,
    description: 'All channels',
  },
];

/**
 * Four-up card row mirroring the existing dashboard stat-card visual language
 * (icon-on-right, big number, muted description). Keeps the dashboard
 * cohesive without redesigning the existing widgets.
 */
export function CommunicationStatsCards({ stats, loading }: Props) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      data-testid="communication-stats-grid"
    >
      {CARDS.map((card) => {
        const Icon = card.icon;
        return (
          <Card
            key={card.testId}
            className="hover:shadow-md transition-shadow duration-200"
            data-testid={`stat-card-${card.testId}`}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`rounded-md p-2 ${card.iconBg}`}>
                <Icon size={16} className={card.iconColor} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-heading font-bold">
                {loading ? <Skeleton className="h-7 w-12" /> : stats ? card.getValue(stats) : '—'}
              </div>
              <span className="text-xs text-muted-foreground mt-1 block">{card.description}</span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

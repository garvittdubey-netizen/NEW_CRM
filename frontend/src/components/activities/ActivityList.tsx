import { Link } from 'react-router-dom';
import { actionIcon, timeAgo, activityTestId } from './activityUtils';
import type { Activity } from '@/types';

interface Props {
  activities: Activity[];
  /** Compact mode for the dashboard widget (no big spacing, no leadlinks). */
  compact?: boolean;
}

/**
 * Vertical list of activity items, newest at top. Used by both the
 * full Team Activity page and the dashboard widget.
 */
export function ActivityList({ activities, compact = false }: Props) {
  return (
    <ul className={compact ? 'space-y-2' : 'space-y-3'} data-testid="activity-list">
      {activities.map((a) => {
        const { icon: Icon, cls } = actionIcon(a.action);
        return (
          <li
            key={a.id}
            className={`flex items-start gap-3 ${compact ? 'text-sm' : ''}`}
            data-testid={activityTestId(a)}
          >
            <div className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${cls}`}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm leading-snug">
                <span className="font-medium">{a.user.name}</span>{' '}
                <span className="text-muted-foreground">{a.description}</span>
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                <span>{timeAgo(a.createdAt)}</span>
                {a.lead && !compact && (
                  <>
                    <span>·</span>
                    <Link
                      to={`/leads/${a.lead.id}`}
                      className="hover:text-primary truncate"
                      data-testid={`activity-lead-link-${a.id}`}
                    >
                      {a.lead.fullName}
                    </Link>
                  </>
                )}
                <span>·</span>
                <span className="uppercase tracking-wide">{a.user.role}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

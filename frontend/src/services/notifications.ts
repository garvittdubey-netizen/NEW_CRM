import api from './api';

export type NotificationKind = 'FOLLOWUP' | 'DEAL_ACTIVITY' | 'LEAD_ASSIGNMENT';

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  href: string;
  createdAt: string;
  actor?: { id: string; name: string } | null;
}

export const notificationsApi = {
  list: () =>
    api
      .get<{ items: NotificationItem[] }>('/notifications')
      .then((r) => r.data.items),
};

/**
 * Returns the localStorage key holding the "last read" ISO timestamp for
 * a given user. Per-user so the unread count doesn't leak across logins
 * on a shared browser.
 */
export function lastReadKey(userId: string): string {
  return `notif:lastRead:${userId}`;
}

export function getLastRead(userId: string): string | null {
  try {
    return localStorage.getItem(lastReadKey(userId));
  } catch {
    return null;
  }
}

export function setLastRead(userId: string, iso: string = new Date().toISOString()): void {
  try {
    localStorage.setItem(lastReadKey(userId), iso);
  } catch {
    // ignore
  }
}

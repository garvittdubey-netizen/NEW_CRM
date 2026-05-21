/**
 * Single source of truth for sidebar navigation. Shared between the desktop
 * `Sidebar` and the mobile `MobileSidebar` drawer so a new menu item only
 * needs to be added in one place.
 */
import {
  LayoutDashboard,
  Building2,
  Users,
  UserPlus,
  CalendarClock,
  MessageSquareText,
  Activity as ActivityIcon,
  TrendingUp,
  BarChart3,
  Settings,
  UserCog,
  Kanban,
} from 'lucide-react';

export interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  roles?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { icon: LayoutDashboard,   label: 'Dashboard',      href: '/dashboard' },
  { icon: UserPlus,          label: 'Leads',          href: '/leads' },
  { icon: Kanban,            label: 'Pipeline',       href: '/pipeline' },
  { icon: CalendarClock,     label: 'Follow-ups',     href: '/followups' },
  { icon: MessageSquareText, label: 'Communications', href: '/communications' },
  { icon: ActivityIcon,      label: 'Activity',       href: '/activity' },
  { icon: Building2,         label: 'Properties',     href: '/properties' },
  { icon: Users,             label: 'Clients',        href: '/clients' },
  { icon: TrendingUp,        label: 'Deals',          href: '/deals' },
  { icon: BarChart3,         label: 'Reports',        href: '/reports', roles: ['ADMIN', 'SUPER_ADMIN'] },
  { icon: UserCog,           label: 'Users',          href: '/users',   roles: ['ADMIN', 'SUPER_ADMIN'] },
];

export const BOTTOM_NAV: NavItem[] = [
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export function filterNavForRole(items: NavItem[], role?: string): NavItem[] {
  return items.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

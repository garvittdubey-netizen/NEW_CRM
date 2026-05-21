import { NavLink, useNavigate } from 'react-router-dom';
import { Building2, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { NAV_ITEMS, BOTTOM_NAV, filterNavForRole, type NavItem } from './nav-items';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Mobile-only slide-in drawer that mirrors the desktop sidebar nav.
 * Visible exclusively below the `md` (768px) breakpoint via the parent
 * (`MainLayout`) — the Sheet itself doesn't gate the breakpoint.
 *
 * Tapping any nav item closes the drawer automatically via `onOpenChange`.
 */
export default function MobileSidebar({ open, onOpenChange }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const visibleItems = filterNavForRole(NAV_ITEMS, user?.role);

  const handleLogout = () => {
    onOpenChange(false);
    logout();
    navigate('/login');
  };

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="p-0 w-72"
        data-testid="mobile-sidebar"
      >
        <SheetHeader className="border-b">
          <div className="flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary shrink-0" />
            <SheetTitle className="text-lg text-primary">BuilderOne CRM</SheetTitle>
          </div>
          <SheetDescription>Navigate the CRM</SheetDescription>
        </SheetHeader>

        {/* Main nav */}
        <nav
          className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5"
          data-testid="mobile-sidebar-nav"
        >
          {visibleItems.map((item) => (
            <MobileNavItem key={item.href} item={item} onNavigate={close} />
          ))}
        </nav>

        <Separator />

        {/* Bottom nav (Settings) */}
        <div className="py-3 px-2 space-y-0.5 shrink-0">
          {BOTTOM_NAV.map((item) => (
            <MobileNavItem key={item.href} item={item} onNavigate={close} />
          ))}
        </div>

        {/* User row */}
        <div className="p-3 border-t border-border shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
              data-testid="mobile-logout-button"
              aria-label="Log out"
            >
              <LogOut size={15} />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileNavItem({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.href}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
          'hover:bg-accent hover:text-accent-foreground',
          isActive
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
            : 'text-muted-foreground',
        )
      }
      data-testid={`mobile-nav-${item.label.toLowerCase()}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

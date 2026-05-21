import { NavLink, useMatch, useNavigate, useResolvedPath } from 'react-router-dom';
import { Building2, ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { NAV_ITEMS, BOTTOM_NAV, filterNavForRole, type NavItem } from './nav-items';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

/**
 * Desktop-only sidebar (`hidden md:flex`). For mobile see `MobileSidebar`.
 *
 * Collapse UX rules enforced here so the transition stays smooth and the
 * surrounding `<main>` doesn't repaint mid-animation:
 *   - Width transitions on a single CSS property (`transition-[width]`),
 *     NEVER `transition-all` (which would also animate children).
 *   - Every nav row is `whitespace-nowrap` so the label can't wrap during
 *     the width animation; `overflow-hidden` on the row clips cleanly.
 *   - The label is wrapped in a fixed-opacity element that fades out via
 *     `opacity` instead of `display:none` so the icon never re-flows.
 *   - Icons are vertically and horizontally centered via `justify-center`
 *     when collapsed; the icon container has a fixed 18px box.
 *   - Hover tooltips are only mounted in the collapsed state.
 */
export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const visibleItems = filterNavForRole(NAV_ITEMS, user?.role);

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        data-testid="sidebar"
        data-collapsed={collapsed}
        className={cn(
          'hidden md:flex flex-col h-full border-r border-border bg-card shrink-0 overflow-hidden',
          'transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-[68px]' : 'w-[260px]',
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            'flex items-center h-16 px-3 border-b border-border shrink-0',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {collapsed ? (
            <Building2 className="h-6 w-6 text-primary shrink-0" data-testid="sidebar-logo-collapsed" />
          ) : (
            <div className="flex items-center gap-2 overflow-hidden" data-testid="sidebar-logo">
              <Building2 className="h-6 w-6 text-primary shrink-0" />
              <span className="font-heading font-semibold text-lg text-primary truncate">
                BuilderOne CRM
              </span>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
              data-testid="sidebar-toggle"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft size={16} />
            </Button>
          )}
        </div>

        {/* Expand-button row (visible only when collapsed, sits below the logo) */}
        {collapsed && (
          <div className="px-2 pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggle}
                  className="h-8 w-full text-foreground hover:text-foreground"
                  data-testid="sidebar-toggle"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Expand</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Main Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5" data-testid="sidebar-nav">
          {visibleItems.map((item) => (
            <SidebarNavItem key={item.href} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <Separator />

        {/* Bottom Nav */}
        <div className="py-3 px-2 space-y-0.5 shrink-0">
          {BOTTOM_NAV.map((item) => (
            <SidebarNavItem key={item.href} item={item} collapsed={collapsed} />
          ))}
        </div>

        {/* User info + Logout */}
        <div className="p-3 border-t border-border shrink-0">
          {!collapsed ? (
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
                data-testid="logout-button"
                aria-label="Log out"
              >
                <LogOut size={15} />
              </Button>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className="w-full h-9 text-foreground hover:text-destructive"
                  data-testid="logout-button-collapsed"
                  aria-label="Log out"
                >
                  <LogOut size={16} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;

  // Compute `isActive` externally instead of passing a className FUNCTION to
  // NavLink. When a NavLink with a function-className is wrapped in
  // `<TooltipTrigger asChild>` (collapsed mode), Radix's Slot merges props by
  // string-concatenating `className`, which calls `.toString()` on the function
  // and turns its source code into a literal class attribute. The result:
  // NavLink sees a string (not a function), never invokes it, and NONE of the
  // Tailwind classes apply in collapsed mode — neither the active highlight
  // nor the icon colour. Resolving isActive ourselves and passing a plain
  // STRING className sidesteps the Slot/function bug entirely.
  const resolved = useResolvedPath(item.href);
  const isActive = useMatch({ path: resolved.pathname, end: false }) != null;

  const linkClass = cn(
    'group flex items-center rounded-md text-sm font-medium transition-colors whitespace-nowrap',
    'hover:bg-accent hover:text-accent-foreground',
    isActive
      ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
      // In collapsed mode there's no label to give the icon visual weight, so
      // inactive icons use the solid `text-foreground` token (≈11% lightness
      // in light theme → near-black on the white card; ≈98% lightness in dark
      // theme → near-white on the dark card). Expanded mode keeps the original
      // muted tone since the label itself carries the colour.
      : collapsed
      ? 'text-foreground'
      : 'text-muted-foreground',
    // Fixed paddings per mode prevent any width-jump during the
    // outer aside's width animation.
    collapsed ? 'justify-center px-0 h-10 w-10 mx-auto' : 'gap-3 px-3 py-2.5',
  );

  // Collapsed: wrap in tooltip; Expanded: plain link.
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <NavLink
            to={item.href}
            className={linkClass}
            data-testid={`nav-${item.label.toLowerCase()}`}
            aria-label={item.label}
          >
            <Icon size={18} />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <NavLink
      to={item.href}
      className={linkClass}
      data-testid={`nav-${item.label.toLowerCase()}`}
    >
      <Icon size={18} className="shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

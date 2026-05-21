import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileSidebar from './MobileSidebar';
import Navbar from './Navbar';

const COLLAPSE_KEY = 'sidebar:collapsed';

/**
 * Reads the persisted collapse flag once on first render. Falls back to
 * `false` (expanded) when localStorage is unavailable or the key is unset.
 *
 * Returning the resolved value from the lazy initializer lets us avoid an
 * additional `useEffect` "hydrate then setState" pass, which otherwise
 * flashes the expanded sidebar for a frame on a hard refresh.
 */
function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export default function MainLayout() {
  // Desktop sidebar collapse state (persisted)
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  // Mobile drawer open state (ephemeral)
  const [mobileOpen, setMobileOpen] = useState(false);

  // Persist collapse changes across refreshes
  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* swallow — quota / disabled storage */
    }
  }, [collapsed]);

  return (
    <div
      className="flex h-screen bg-background overflow-hidden"
      data-testid="main-layout"
    >
      {/* Desktop sidebar (md+) */}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
      />

      {/* Mobile drawer (<md) */}
      <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Navbar onMobileMenuOpen={() => setMobileOpen(true)} />
        <main
          className="flex-1 overflow-y-auto p-4 sm:p-6 animate-fade-in"
          data-testid="main-content"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

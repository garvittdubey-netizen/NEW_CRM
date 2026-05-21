/**
 * Role-hierarchy helpers (frontend). Mirrors `/backend/src/lib/roles.ts`.
 *
 *   SUPER_ADMIN > ADMIN > AGENT
 */
export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';

export function isAdminLevel(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === 'SUPER_ADMIN';
}

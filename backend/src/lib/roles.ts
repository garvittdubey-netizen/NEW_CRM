/**
 * Role-hierarchy helpers. SUPER_ADMIN inherits every privilege ADMIN has,
 * including the legacy RBAC checks scattered across controllers/services
 * (e.g. `req.user.role === 'ADMIN'` → "can see everything / can edit any
 * row"). Centralised here so adding SUPER_ADMIN didn't require rewriting
 * every existing comparison.
 *
 *   SUPER_ADMIN > ADMIN > AGENT
 */

export type RoleName = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT' | string;

/** True when the role has ADMIN-or-higher capability (ADMIN or SUPER_ADMIN). */
export function isAdminLevel(role: string | undefined | null): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/** True when the role is strictly SUPER_ADMIN. */
export function isSuperAdmin(role: string | undefined | null): boolean {
  return role === 'SUPER_ADMIN';
}

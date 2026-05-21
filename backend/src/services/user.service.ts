import bcrypt from 'bcryptjs';
import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * User-management service. Mirrors the patterns used by
 * lead.service / followup.service: returns DTOs without password hashes,
 * applies safety guards before destructive role/status changes, and never
 * trusts the caller for the actor identity (controller passes `actor`).
 *
 * Role hierarchy enforced here (also guarded at the controller/route layer):
 *   SUPER_ADMIN > ADMIN > AGENT
 *
 *   - SUPER_ADMIN may create or edit users of any role.
 *   - ADMIN      may create or edit AGENT users only. ADMIN cannot create,
 *                edit, promote, or disable ADMIN/SUPER_ADMIN users.
 *   - AGENT      cannot access these endpoints at all (route-level guard).
 *
 * Safety guards (NEVER bypassable):
 *   - An ADMIN/SUPER_ADMIN can't disable themselves.
 *   - Cannot demote, disable, or delete the LAST active SUPER_ADMIN.
 *   - Cannot demote, disable, or delete the LAST active ADMIN (legacy rule
 *     preserved; SUPER_ADMIN is counted separately so it remains additive).
 */

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ActorRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';
export type TargetRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT';

function err(message: string, code: string): Error {
  const e = new Error(message);
  (e as Error & { code?: string }).code = code;
  return e;
}

/**
 * Returns the set of roles the given actor is permitted to assign when
 * creating or editing a user.
 */
export function rolesActorCanAssign(actorRole: ActorRole): TargetRole[] {
  if (actorRole === 'SUPER_ADMIN') return ['SUPER_ADMIN', 'ADMIN', 'AGENT'];
  if (actorRole === 'ADMIN') return ['AGENT'];
  return [];
}

/**
 * Returns true when an actor is permitted to view/edit/disable the given target.
 * ADMIN can only manage AGENT rows. SUPER_ADMIN can manage anyone.
 */
function actorCanManageTarget(actorRole: ActorRole, targetRole: TargetRole): boolean {
  if (actorRole === 'SUPER_ADMIN') return true;
  if (actorRole === 'ADMIN') return targetRole === 'AGENT';
  return false;
}

export interface UserListOptions {
  search?: string;
  role?: string; // 'SUPER_ADMIN' | 'ADMIN' | 'AGENT' | 'ALL'
  isActive?: boolean | 'ALL';
}

export async function listUsers(opts: UserListOptions) {
  const where: Prisma.UserWhereInput = {};

  if (opts.search?.trim()) {
    where.OR = [
      { name:  { contains: opts.search.trim(), mode: 'insensitive' } },
      { email: { contains: opts.search.trim(), mode: 'insensitive' } },
    ];
  }
  if (opts.role && opts.role !== 'ALL') {
    where.role = opts.role as Role;
  }
  if (opts.isActive !== undefined && opts.isActive !== 'ALL') {
    where.isActive = opts.isActive;
  }

  return prisma.user.findMany({
    where,
    select: USER_SELECT,
    orderBy: { name: 'asc' },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: TargetRole;
  isActive?: boolean;
}

export async function createUser(input: CreateUserInput, actorRole: ActorRole) {
  // Role-hierarchy guard.
  const allowed = rolesActorCanAssign(actorRole);
  if (!allowed.includes(input.role)) {
    throw err(
      `Your role (${actorRole}) is not permitted to create users with role ${input.role}`,
      'FORBIDDEN_ROLE_ASSIGNMENT',
    );
  }

  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw err('A user with this email already exists', 'EMAIL_TAKEN');
  }

  if (!input.password || input.password.length < 8) {
    throw err('Password must be at least 8 characters', 'WEAK_PASSWORD');
  }

  const hashed = await bcrypt.hash(input.password, 12);
  return prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      password: hashed,
      role: input.role,
      isActive: input.isActive ?? true,
    },
    select: USER_SELECT,
  });
}

export interface UpdateUserInput {
  name?: string;
  role?: TargetRole;
  isActive?: boolean;
  password?: string; // optional — only updated when non-empty
}

/**
 * Edits a user. Email is intentionally immutable to avoid breaking foreign
 * keys and audit history; create a new user instead if a swap is needed.
 */
export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actorId: string,
  actorRole: ActorRole,
) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw err('User not found', 'NOT_FOUND');
  }

  const targetRole = target.role as TargetRole;
  const isSelf = id === actorId;

  // Hierarchy guard 1 — ADMIN cannot touch ADMIN/SUPER_ADMIN rows (except
  // themselves, where the only allowed edits are name/password — name &
  // password changes alone are fine, but they cannot alter their own role
  // or status; those self-guards run below).
  if (!actorCanManageTarget(actorRole, targetRole)) {
    throw err(
      `Your role (${actorRole}) is not permitted to edit a user with role ${targetRole}`,
      'FORBIDDEN_TARGET',
    );
  }

  // Hierarchy guard 2 — if a role change is requested, the new role must be
  // one the actor is allowed to assign.
  if (input.role !== undefined && input.role !== targetRole) {
    const allowed = rolesActorCanAssign(actorRole);
    if (!allowed.includes(input.role)) {
      throw err(
        `Your role (${actorRole}) is not permitted to assign role ${input.role}`,
        'FORBIDDEN_ROLE_ASSIGNMENT',
      );
    }
  }

  // Self-disable guard
  if (input.isActive === false && isSelf) {
    throw err('You cannot disable your own account', 'CANNOT_DISABLE_SELF');
  }

  // Last-SUPER_ADMIN guards — cannot demote, disable (incl. self-demote)
  // the last active SUPER_ADMIN.
  const isDemotingSuper =
    target.role === 'SUPER_ADMIN' && input.role !== undefined && input.role !== 'SUPER_ADMIN';
  const isDisablingSuper =
    target.role === 'SUPER_ADMIN' && input.isActive === false;
  if (isDemotingSuper || isDisablingSuper) {
    const superCount = await prisma.user.count({
      where: { role: 'SUPER_ADMIN', isActive: true },
    });
    if (superCount <= 1) {
      throw err(
        isDemotingSuper
          ? 'Cannot demote the last active super admin'
          : 'Cannot disable the last active super admin',
        'LAST_SUPER_ADMIN',
      );
    }
  }

  // Legacy last-ADMIN guards (preserved). Counts ADMIN role specifically —
  // SUPER_ADMIN does not satisfy this; that is intentional so the
  // pre-existing ADMIN floor is independent of the new hierarchy tier.
  const isDemotingAdmin =
    target.role === 'ADMIN' && input.role !== undefined && input.role !== 'ADMIN' && input.role !== 'SUPER_ADMIN';
  const isDisablingAdmin = target.role === 'ADMIN' && input.isActive === false;
  if (isDemotingAdmin || isDisablingAdmin) {
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
    if (adminCount <= 1) {
      throw err(
        isDemotingAdmin
          ? 'Cannot demote the last active admin'
          : 'Cannot disable the last active admin',
        'LAST_ADMIN',
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined)     data.name     = input.name.trim();
  if (input.role !== undefined)     data.role     = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.password) {
    if (input.password.length < 8) {
      throw err('Password must be at least 8 characters', 'WEAK_PASSWORD');
    }
    data.password = await bcrypt.hash(input.password, 12);
  }

  return prisma.user.update({
    where: { id },
    data,
    select: USER_SELECT,
  });
}

/**
 * Self-service profile + password management.
 *
 * Strictly additive — does not touch `auth.service.ts` (login/register/me) so
 * existing JWT flow is unchanged. Email is intentionally immutable to keep
 * audit-history FK integrity intact (same rule as the User Management module).
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

export interface ProfileDto {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImage: string | null;
  createdAt: Date;
}

function toDto(u: {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImage: string | null;
  createdAt: Date;
}): ProfileDto {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    profileImage: u.profileImage,
    createdAt: u.createdAt,
  };
}

export async function getProfile(userId: string): Promise<ProfileDto | null> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  return u ? toDto(u) : null;
}

export interface UpdateProfileInput {
  name?: string;
  profileImage?: string | null;
}

/**
 * Updates name and/or profileImage. Email + password + role + isActive are
 * NOT mutable through this surface; password has its own endpoint with the
 * current-password check.
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<ProfileDto> {
  const data: { name?: string; profileImage?: string | null } = {};

  if (input.name !== undefined) {
    const trimmed = String(input.name).trim();
    if (!trimmed) throw new Error('Name cannot be empty');
    data.name = trimmed;
  }

  // profileImage: null → clear; string → set; undefined → no change.
  if (input.profileImage !== undefined) {
    if (input.profileImage === null || input.profileImage === '') {
      data.profileImage = null;
    } else {
      data.profileImage = String(input.profileImage);
    }
  }

  const u = await prisma.user.update({ where: { id: userId }, data });
  return toDto(u);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    (err as Error & { code?: string }).code = 'WRONG_CURRENT_PASSWORD';
    throw err;
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
}

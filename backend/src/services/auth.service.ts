import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImage: string | null;
  createdAt: Date;
}

function toDto(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImage: string | null;
  createdAt: Date;
}): UserDto {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    profileImage: user.profileImage,
    createdAt: user.createdAt,
  };
}

export function generateToken(user: UserDto): string {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string } as jwt.SignOptions,
  );
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: UserDto; token: string }> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  if (!user) {
    throw new Error('Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    throw new Error('Invalid email or password');
  }

  if (!user.isActive) {
    const err = new Error('Account is disabled. Contact your administrator.');
    (err as Error & { code?: string }).code = 'ACCOUNT_DISABLED';
    throw err;
  }

  const dto = toDto(user);
  return { user: dto, token: generateToken(dto) };
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
): Promise<{ user: UserDto; token: string }> {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new Error('Email already in use');
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name: name.trim(), email: email.toLowerCase(), password: hashed },
  });

  const dto = toDto(user);
  return { user: dto, token: generateToken(dto) };
}

export async function getUserById(id: string): Promise<UserDto | null> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return null;
  return toDto(user);
}

import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

/**
 * Seeds the admin user on first run. Idempotent — safe to call on every startup.
 *
 * After ensuring the bootstrap admin exists, we also promote the earliest user
 * in the DB to SUPER_ADMIN — but only when no SUPER_ADMIN exists yet. This
 * makes the migration to the 3-tier role hierarchy automatic without
 * hardcoding any specific email.
 */
export async function seedAdmin(): Promise<void> {
  const email = process.env.ADMIN_EMAIL || 'admin@realestate.com';
  const password = process.env.ADMIN_PASSWORD || 'Admin@2036';
  const name = 'Admin';

  const existing = await prisma.user.findUnique({ where: { email } });

  if (!existing) {
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: { name, email, password: hashed, role: 'ADMIN' },
    });
    console.log(`✅ Admin user seeded: ${email}`);
  } else {
    console.log(`ℹ️  Admin user already exists: ${email}`);
  }

  // Promote the earliest user to SUPER_ADMIN iff no SUPER_ADMIN exists yet.
  // Runs unconditionally on every boot so the post-migration state converges
  // even if seed/migration order is reversed. Safe + idempotent.
  const superAdminCount = await prisma.user.count({ where: { role: 'SUPER_ADMIN' } });
  if (superAdminCount === 0) {
    const earliest = await prisma.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, role: true },
    });
    if (earliest) {
      await prisma.user.update({
        where: { id: earliest.id },
        data: { role: 'SUPER_ADMIN', isActive: true },
      });
      console.log(`👑 Promoted earliest user to SUPER_ADMIN: ${earliest.email} (was ${earliest.role})`);
    }
  } else {
    console.log(`ℹ️  SUPER_ADMIN already present (${superAdminCount}); skipping auto-promotion`);
  }
}

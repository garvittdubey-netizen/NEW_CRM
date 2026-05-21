import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetUsers() {
  const users = [
    {
      email: "admin@realestate.com",
      password: "Admin@2036"
    },
    {
      email: "manager@realestate.com",
      password: "Manager@2036"
    },
    {
      email: "agent@realestate.com",
      password: "Agent@2036"
    }
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);

    await prisma.user.update({
      where: { email: u.email },
      data: { password: hash }
    });

    console.log(`Updated: ${u.email}`);
  }

  console.log("All users reset successfully");
}

resetUsers()
.then(() => process.exit())
.catch((err) => {
  console.error(err);
  process.exit(1);
});
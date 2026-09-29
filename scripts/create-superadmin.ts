// Run this once, via Railway's Console tab (same reliable method already
// used for seed scripts), to create the Datacrux team's own internal
// account and its first superadmin login:
//
//   SUPERADMIN_EMAIL=you@datacruxafrica.com SUPERADMIN_PASSWORD=SomeStrongPassword npx ts-node scripts/create-superadmin.ts
//
// Safe to run more than once - if the internal Datacrux account already
// exists, it's reused rather than duplicated.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD before running this script.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email } });
  if (existingAdmin) {
    console.error(`An admin account with email ${email} already exists.`);
    process.exit(1);
  }

  // The Datacrux team's own account - plan: 'internal' keeps it out of the
  // Clients list and off-limits to platform.updateClient, so it can never
  // accidentally be suspended or edited from the admin UI like a real
  // business.
  let internalClient = await prisma.client.findFirst({ where: { plan: 'internal' } });
  if (!internalClient) {
    internalClient = await prisma.client.create({
      data: {
        name: 'Datacrux Africa (Internal)',
        plan: 'internal',
        subscription: 'active',
      },
    });
    console.log(`Created internal Datacrux client: ${internalClient.id}`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.adminUser.create({
    data: {
      clientId: internalClient.id,
      email,
      passwordHash,
      role: 'superadmin',
    },
  });

  console.log(`Superadmin account created: ${admin.email} (id: ${admin.id})`);
  console.log('You can now log in at the normal admin panel login page with this email and password.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  let client = await prisma.client.findFirst({ where: { name: 'Demo Business' } });
  if (!client) {
    client = await prisma.client.create({
      data: { name: 'Demo Business', subscription: 'trial' },
    });
    console.log('✅ Client created:', client.id);
  } else {
    console.log('ℹ️  Client already exists:', client.id);
  }

  const existingProduct = await prisma.product.findFirst({
    where: { clientId: client.id, name: 'Sample Product' },
  });
  if (!existingProduct) {
    const product = await prisma.product.create({
      data: {
        clientId: client.id,
        name: 'Sample Product',
        description: 'A test product for negotiation testing',
        category: 'general',
        price: 100.0,
        minPrice: 70.0,
        available: true,
      },
    });
    console.log('✅ Product created:', product.id);
  } else {
    console.log('ℹ️  Product already exists:', existingProduct.id);
  }

  const adminEmail = 'owner@demo-business.test';
  const adminPassword = 'ChangeMe123!';

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.adminUser.create({
      data: {
        clientId: client.id,
        email: adminEmail,
        passwordHash,
        role: 'owner',
      },
    });
    console.log('✅ Admin user created!');
    console.log('   Email:', admin.email);
    console.log('   Password:', adminPassword, '(only shown here, not stored in plain text)');
  } else {
    console.log('ℹ️  Admin user already exists:', existingAdmin.email);
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
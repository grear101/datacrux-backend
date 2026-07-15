const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function seedBusiness({ name, adminEmail, adminPassword, productName, price, minPrice }) {
  let client = await prisma.client.findFirst({ where: { name } });
  if (!client) {
    client = await prisma.client.create({ data: { name, subscription: 'trial' } });
    console.log(`✅ Client created: ${name} (${client.id})`);
  } else {
    console.log(`ℹ️  Client already exists: ${name} (${client.id})`);
  }

  if (!client.apiKey) {
    const apiKey = 'dcx_' + crypto.randomBytes(24).toString('hex');
    client = await prisma.client.update({ where: { id: client.id }, data: { apiKey } });
    console.log(`✅ API key generated for ${name}!`);
    console.log(`   x-api-key: ${apiKey}`);
  } else {
    console.log(`ℹ️  API key already set for ${name} (not shown again for safety).`);
  }

  const existingProduct = await prisma.product.findFirst({
    where: { clientId: client.id, name: productName },
  });
  let product = existingProduct;
  if (!existingProduct) {
    product = await prisma.product.create({
      data: {
        clientId: client.id,
        name: productName,
        description: `A test product for ${name}`,
        category: 'general',
        price,
        minPrice,
        available: true,
      },
    });
    console.log(`✅ Product created for ${name}: ${product.name} (${product.id})`);
  } else {
    console.log(`ℹ️  Product already exists for ${name}: ${product.id}`);
  }

  const existingAdmin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const admin = await prisma.adminUser.create({
      data: { clientId: client.id, email: adminEmail, passwordHash, role: 'owner' },
    });
    console.log(`✅ Admin created for ${name}!`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Password: ${adminPassword} (only shown here, not stored in plain text)`);
  } else {
    console.log(`ℹ️  Admin already exists for ${name}: ${existingAdmin.email}`);
  }

  return { clientId: client.id, productId: product.id };
}

async function main() {
  console.log('--- Demo Business ---');
  await seedBusiness({
    name: 'Demo Business',
    adminEmail: 'owner@demo-business.test',
    adminPassword: 'ChangeMe123!',
    productName: 'Sample Product',
    price: 100.0,
    minPrice: 70.0,
  });

  console.log('\n--- Rival Traders (for tenant isolation testing) ---');
  await seedBusiness({
    name: 'Rival Traders',
    adminEmail: 'owner@rival-traders.test',
    adminPassword: 'ChangeMe456!',
    productName: 'Other Product',
    price: 200.0,
    minPrice: 150.0,
  });
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());

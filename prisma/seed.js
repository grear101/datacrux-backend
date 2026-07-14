const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const client = await prisma.client.create({
    data: {
      name: 'Demo Business',
      subscription: 'trial',
    },
  });

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

  console.log('✅ Client created! Copy this ID:');
  console.log(client.id);
  console.log('✅ Product created:', product.name);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
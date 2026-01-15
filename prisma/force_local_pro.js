import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targetShop = "netterms-demo-v1.myshopify.com"; 

  console.log(`🔍 Upgrading ${targetShop} to PRO...`);

  await prisma.shop.upsert({
    where: { shop: targetShop },
    update: {
      plan: "PRO",
      billingStatus: "ACTIVE"
    },
    create: {
      shop: targetShop,
      plan: "PRO",
      billingStatus: "ACTIVE",
      customerCount: 0
    }
  });

  console.log(`✅ Success! Shop is now PRO.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
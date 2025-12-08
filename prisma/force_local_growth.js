import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targetShop = "hjb-codeforge-test-01.myshopify.com"; 

  console.log(`🔍 Checking database for: ${targetShop}...`);

  // UPSERT: Update if exists, Create if it doesn't.
  const shop = await prisma.shop.upsert({
    where: { shop: targetShop },
    update: {
      plan: "GROWTH",
      billingStatus: "ACTIVE"
    },
    create: {
      shop: targetShop,
      plan: "GROWTH",
      billingStatus: "ACTIVE",
      customerCount: 0
    }
  });

  console.log(`✅ Success! Shop '${shop.shop}' is now set to '${shop.plan}'.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
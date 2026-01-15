
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const shops = await prisma.shop.findMany();
  console.log("Shops:", JSON.stringify(shops, null, 2));

  const invoices = await prisma.invoice.findMany({
      where: { status: "PENDING" }
  });
  console.log("Pending Invoices:", JSON.stringify(invoices, null, 2));
  
  const now = new Date();
  const threeDays = new Date();
  threeDays.setDate(now.getDate() + 3);
  
  console.log(`Checking for due dates between ${now.toISOString()} and ${threeDays.toISOString()}`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());

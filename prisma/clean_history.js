import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("🧹 Cleaning up history...");
  
  // 1. Delete all invoices
  const deletedInvoices = await prisma.invoice.deleteMany({});
  console.log(`✅ Deleted ${deletedInvoices.count} invoices.`);

  // 2. Optional: Reset shop specific counters if needed? 
  // Based on search, customerCount isn't actively updated, so leaving it.
  
  console.log("✨ History Cleaned. Ready for Demo/Ads.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

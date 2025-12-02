import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find the most recent invoice (Order #1005)
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (lastInvoice) {
    console.log(`Resetting Invoice #${lastInvoice.orderNumber} for testing...`);
    
    // 1. Keep the Date in the past (Yesterday)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // 2. Force Status back to PENDING
    await prisma.invoice.update({
      where: { id: lastInvoice.id },
      data: { 
        status: "PENDING",
        dueDate: yesterday
      }
    });
    
    console.log("✅ Invoice reset: Status is PENDING, Date is PAST DUE.");
    console.log("   The Enforcer will now target this user again.");
  } else {
    console.log("No invoices found.");
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
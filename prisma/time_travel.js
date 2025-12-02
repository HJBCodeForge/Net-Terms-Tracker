import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find the most recent invoice
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (lastInvoice) {
    console.log(`Aging Invoice #${lastInvoice.orderNumber}...`);
    
    // Set due date to Yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await prisma.invoice.update({
      where: { id: lastInvoice.id },
      data: { dueDate: yesterday }
    });
    
    console.log("✅ Invoice is now OVERDUE.");
  } else {
    console.log("No invoices found.");
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
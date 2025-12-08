import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Find the most recent invoice
  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (!lastInvoice) {
    console.log("❌ No invoices found. Create one in the app first.");
    return;
  }

  // 2. Set Due Date to 2 days from now (Perfect for the 3-day reminder window)
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

  await prisma.invoice.update({
    where: { id: lastInvoice.id },
    data: { dueDate: twoDaysFromNow }
  });

  console.log(`✅ Time Travel Successful! Invoice #${lastInvoice.orderNumber} is now due on ${twoDaysFromNow.toDateString()}.`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
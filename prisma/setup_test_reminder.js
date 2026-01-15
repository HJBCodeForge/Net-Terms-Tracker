
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const updated = await prisma.invoice.update({
    where: { orderId: "gid://shopify/Order/6174355095684" }, // Unique identifier
    data: {
      dueDate: tomorrow
    }
  });

  console.log("Updated Invoice #1006 Due Date to:", updated.dueDate);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());


import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const shops = await prisma.shop.findMany();
  console.log("Existing Shops in DB:", shops);
  
  const sessions = await prisma.session.findMany();
  console.log("Existing Sessions count:", sessions.length);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());

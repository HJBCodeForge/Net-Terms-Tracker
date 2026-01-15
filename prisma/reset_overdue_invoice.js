
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    console.log("Resetting #999-OVERDUE to PENDING...");
    try {
        await prisma.invoice.update({
            where: { orderNumber: "#999-OVERDUE" }, // schema uses orderId as unique, let's use check findFirst first or assume orderId is known
            data: { status: "PENDING" }
        });
        console.log("✅ Reset complete.");
    } catch (e) {
        // orderNumber is not @unique in schema?
        // Let's check schema: orderId @unique, orderNumber String
        // We better find it first.
        const invoice = await prisma.invoice.findFirst({
            where: { orderNumber: "#999-OVERDUE" }
        });
        if (invoice) {
            await prisma.invoice.update({
                where: { id: invoice.id },
                data: { status: "PENDING" }
            });
            console.log("✅ Reset complete (via findFirst).");
        } else {
            console.log("❌ Invoice not found.");
        }
    }
}

main().finally(() => prisma.$disconnect());

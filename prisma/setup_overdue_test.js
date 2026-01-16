
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    console.log("😈 Creating Overdue Invoice for Enforcer Test...");

    // 1. Target Customer (Henning Botha / VIP User)
    const customerId = "gid://shopify/Customer/9304937037956";
    const shop = "netterms-demo-v1.myshopify.com";

    // 2. Dates
    const now = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1); // Definitely overdue

    // 3. Create Invoice
    const invoice = await prisma.invoice.create({
        data: {
            shop: shop,
            orderId: `gid://shopify/Order/999999_${Date.now()}`, // Fake Order ID
            orderNumber: "#999-OVERDUE",
            customerId: customerId,
            customerName: "Jane Doe",
            customerEmail: "hjb.codeforge+vip@gmail.com",
            amount: 1500.00,
            currency: "USD",
            dueDate: yesterday, // <--- THE KEY
            status: "PENDING",  // <--- Still pending, so it should trigger enforcement
            createdAt: now
        }
    });

    console.log(`✅ Created Overdue Invoice: ${invoice.orderNumber}`);
    console.log(`📅 Due Date: ${invoice.dueDate.toISOString()}`);
    console.log(`👤 Customer: ${invoice.customerName} (${invoice.customerId})`);
    console.log("👉 Now run the compliance check to test the Enforcer.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

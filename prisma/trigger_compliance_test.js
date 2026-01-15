
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch'; // Standard node fetch, or global fetch if node 18+

const prisma = new PrismaClient();
const SHOP = "netterms-demo-v1.myshopify.com";

async function main() {
    console.log(`🕵️ [Enforcer Test] Starting compliance check for ${SHOP}...`);

    // 1. Get Access Token from Session
    // Usually tokens are stored in sessions. We look for an offline token or any token for this shop.
    // Offline tokens usually have id like "offline_shop.myshopify.com"
    const sessionId = `offline_${SHOP}`;
    
    let session = await prisma.session.findUnique({
        where: { id: sessionId }
    });

    // Fallback: search by shop if specific ID format fails
    if (!session) {
        console.log("⚠️ No specific offline session found, searching by shop...");
        const sessions = await prisma.session.findMany({
            where: { shop: SHOP }
        });
        if (sessions.length > 0) {
            session = sessions[0];
            console.log(`✅ Found session: ${session.id}`);
        }
    }

    if (!session || !session.accessToken) {
        console.error("❌ Could not find a valid access token for the shop.");
        process.exit(1);
    }

    const accessToken = session.accessToken;
    console.log("🔑 Access Token acquired.");

    // 2. Find PENDING & OVERDUE Invoices
    const now = new Date();
    const overdueInvoices = await prisma.invoice.findMany({
        where: {
            shop: SHOP,
            status: "PENDING",
            dueDate: { lt: now }
        }
    });

    console.log(`📉 Found ${overdueInvoices.length} invoices that satisfy overdue criteria.`);

    if (overdueInvoices.length === 0) {
        console.log("✅ No actions needed.");
        return;
    }

    // 3. Process Each Invoice
    for (const invoice of overdueInvoices) {
        console.log(`👉 Processing Invoice ${invoice.orderNumber} (Due: ${invoice.dueDate.toISOString()})...`);

        // A. Update Status in DB
        await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: "OVERDUE" }
        });
        console.log(`   ✅ DB status updated to OVERDUE`);

        // B. Revoke Tag in Shopify
        const customerId = invoice.customerId;
        if (!customerId.includes("gid://shopify/Customer/")) {
            console.warn(`   ⚠️ Invalid Customer ID format: ${customerId}, skipping tag removal.`);
            continue;
        }

        console.log(`   🚫 Revoking 'Net30_Approved' tag from ${customerId}...`);
        
        const query = `
            mutation revokeAndSuspend($id: ID!, $removeTags: [String!]!, $addTags: [String!]!) {
                tagsRemove(id: $id, tags: $removeTags) {
                    userErrors { field message }
                }
                tagsAdd(id: $id, tags: $addTags) {
                    userErrors { field message }
                }
            }
        `;

        const variables = {
            id: customerId,
            removeTags: ["Net30_Approved"],
            addTags: ["Net30_Suspended"]
        };

        try {
            const response = await fetch(`https://${SHOP}/admin/api/2024-04/graphql.json`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken
                },
                body: JSON.stringify({ query, variables })
            });

            const result = await response.json();

            if (result.errors) {
                console.error("   ❌ GraphQL Error:", JSON.stringify(result.errors, null, 2));
            } else if (result.data?.tagsRemove?.userErrors?.length > 0 || result.data?.tagsAdd?.userErrors?.length > 0) {
                console.error("   ❌ User Errors (Remove):", result.data?.tagsRemove?.userErrors);
                console.error("   ❌ User Errors (Add):", result.data?.tagsAdd?.userErrors);
            } else {
                console.log("   ✅ 'Net30_Approved' removed and 'Net30_Suspended' added.");
            }

        } catch (error) {
            console.error("   ❌ Network or Script Error:", error);
        }
    }

    console.log("🏁 Compliance Check Complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

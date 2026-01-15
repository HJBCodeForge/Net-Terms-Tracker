
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

// 1. Load Env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = envContent.split('\n').reduce((acc, line) => {
    const [key, value] = line.split('=');
    if (key && value) {
        acc[key.trim()] = value.trim().replace(/"/g, '');
    }
    return acc;
}, {});

const RESEND_API_KEY = envVars.RESEND_API_KEY;
if (!RESEND_API_KEY) {
    console.error("❌ No RESEND_API_KEY found in .env");
    process.exit(1);
}

const db = new PrismaClient();
const resend = new Resend(RESEND_API_KEY);

async function main() {
    console.log("[Test] Starting Independent Reminder Test...");

    // 1. Find Shops
    const eligibleShops = await db.shop.findMany({
        where: {
            plan: { in: ["GROWTH", "PRO"] },
            billingStatus: "ACTIVE"
        }
    });

    const shopDomains = eligibleShops.map(s => s.shop);
    console.log(`[Test] Eligible Shops: ${shopDomains.join(', ')}`);

    if (shopDomains.length === 0) {
        console.log("No eligible shops.");
        return;
    }

    // 2. Find Invoices
    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    console.log(`[Test] Window: ${now.toISOString()} to ${threeDaysFromNow.toISOString()}`);

    const pendingInvoices = await db.invoice.findMany({
        where: {
            shop: { in: shopDomains },
            status: "PENDING",
            dueDate: {
                lte: threeDaysFromNow,
                gte: now
            }
        }
    });

    console.log(`[Test] Found ${pendingInvoices.length} invoices due soon.`);
    
    // Log them for verification
    pendingInvoices.forEach(inv => {
        console.log(` - Invoice ${inv.orderNumber} (Due: ${inv.dueDate.toISOString()})`);
    });

    // 3. Send Emails
    for (const invoice of pendingInvoices) {
        if (!invoice.customerEmail) {
            console.log(`[Test] Skipping Invoice ${invoice.orderNumber}: No email.`);
            continue;
        }

        console.log(`[Test] Sending email for Invoice ${invoice.orderNumber} to ${invoice.customerEmail}...`);
        
        try {
            const { data, error } = await resend.emails.send({
                from: 'Net Terms App <onboarding@resend.dev>',
                to: [invoice.customerEmail], // In onboarding, this goes to account owner (me/you)
                subject: `[TEST] Invoke #${invoice.orderNumber} is Due Soon`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px;">
                      <h2>Payment Reminder (Test)</h2>
                      <p>Hello ${invoice.customerName},</p>
                      <p>Your invoice <strong>#${invoice.orderNumber}</strong> for <strong>${invoice.amount} ${invoice.currency}</strong> is due on <strong>${new Date(invoice.dueDate).toDateString()}</strong>.</p>
                      <p>This is a manual test of the notification system.</p>
                    </div>
                `
            });

            if (error) {
                console.error(`[Test] Error sending to ${invoice.customerEmail}:`, error);
            } else {
                console.log(`[Test] Email sent successfully! ID: ${data.id}`);
            }

        } catch (err) {
            console.error(`[Test] Exception sending email:`, err);
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await db.$disconnect();
    });

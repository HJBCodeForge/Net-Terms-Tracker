import { json } from "@remix-run/node";
import db from "../db.server";
import { sendInvoiceReminder } from "../email.server";

export const loader = async ({ request }) => {
  console.log("[Cron] Starting Invoice Reminder Job...");

  // 1. Find Shops eligible for Automation (Growth or Pro)
  const eligibleShops = await db.shop.findMany({
    where: {
      plan: { in: ["GROWTH", "PRO"] }, // GATEKEEPER: Only paid plans [cite: 249]
      billingStatus: "ACTIVE"
    }
  });

  const shopDomains = eligibleShops.map(s => s.shop);
  console.log(`[Cron] Found ${shopDomains.length} eligible shops.`);

  if (shopDomains.length === 0) {
    return json({ status: "skipped", message: "No eligible shops found." });
  }

  // 2. Find Invoices needing reminders
  // Logic: Status is PENDING and Due Date is within 3 days [cite: 248]
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const pendingInvoices = await db.invoice.findMany({
    where: {
      shop: { in: shopDomains }, // Only for eligible shops
      status: "PENDING",
      dueDate: {
        lte: threeDaysFromNow, // Less than or equal to 3 days from now
        gte: new Date()        // But not in the past (already overdue)
      },
      // Optional: Add a field to invoice to track if reminder was already sent
      // reminderSent: false 
    }
  });

  console.log(`[Cron] Found ${pendingInvoices.length} invoices due soon.`);

  // 3. Send Emails
  let sentCount = 0;
  
  for (const invoice of pendingInvoices) {
    if (invoice.customerEmail) {
      await sendInvoiceReminder({
        to: invoice.customerEmail, // Note: In Resend 'onboarding', this sends to YOU only.
        customerName: invoice.customerName,
        invoiceNumber: invoice.orderNumber,
        amount: `${invoice.amount} ${invoice.currency}`,
        dueDate: invoice.dueDate,
        checkoutUrl: `https://${invoice.shop}` // Simplified for now
      });
      sentCount++;
    }
  }

  return json({ 
    status: "success", 
    shopsScanned: shopDomains.length,
    emailsSent: sentCount 
  });
};
import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  // 1. Handle Mandatory GDPR Webhooks (Admin context is NOT always present here)
  // These often come without a session, so we rely on the payload verification done by authenticate.webhook
  
  if (topic === "CUSTOMERS_DATA_REQUEST") {
    // Return PII data for a specific customer. 
    // "Net Terms Tracker" only stores Invoice data linked to customers.
    console.log(`[GDPR] Data Request for ${payload.customer.email}`);
    // In a real scenario, you would email the merchant a JSON dump of this customer's invoices.
    return new Response("Data request logged", { status: 200 });
  }

  if (topic === "CUSTOMERS_REDACT") {
    // Delete data for a specific customer
    const customerId = payload.customer.id;
    try {
        await db.invoice.deleteMany({
            where: { 
                shop: shop,
                customerId: `${customerId}` 
            }
        });
        console.log(`[GDPR] Redacted invoices for customer ${customerId}`);
    } catch (e) {
        console.error("Redaction failed", e);
    }
    return new Response("Customer redacted", { status: 200 });
  }

  if (topic === "SHOP_REDACT") {
    // Delete ALL data for the shop (48 hours after uninstall)
    try {
        await db.invoice.deleteMany({ where: { shop: shop } });
        await db.session.deleteMany({ where: { shop: shop } });
        await db.shop.deleteMany({ where: { shop: shop } });
        console.log(`[GDPR] Redacted all data for shop ${shop}`);
    } catch (e) {
        console.error("Shop redaction failed", e);
    }
    return new Response("Shop redacted", { status: 200 });
  }

  // 2. Handle Order Logic (Requires Admin Context)
  if (topic === "ORDERS_CREATE" && admin) {
    const order = payload as any;
    const gateway = order.payment_gateway_names?.[0] || "unknown";

    console.log(`[Webhook] Processing Order #${order.order_number} (${gateway})`);

    if (gateway === "manual" || gateway === "Net Terms") {
        const date = new Date();
        date.setDate(date.getDate() + 30); 

        try {
            await db.invoice.upsert({
                where: { orderId: `${order.admin_graphql_api_id}` }, // Ensure string format
                update: {},
                create: {
                    shop: shop,
                    orderId: `${order.admin_graphql_api_id}`,
                    orderNumber: `${order.order_number}`,
                    customerId: `${order.customer?.id || 'unknown'}`,
                    customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`,
                    customerEmail: order.customer?.email || 'no-email',
                    amount: parseFloat(order.total_price),
                    currency: order.currency,
                    dueDate: date,
                    status: "PENDING"
                }
            });
            console.log(`✅ Invoice saved for Order #${order.order_number}`);
        } catch (error) {
            console.error("Failed to save invoice:", error);
        }
    }
  }

  return new Response();
};
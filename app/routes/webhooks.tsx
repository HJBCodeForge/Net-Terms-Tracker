import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // We extract 'shop' from the webhook context here
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    return new Response();
  }

  if (topic === "ORDERS_CREATE") {
    const order = payload as any;
    const gateway = order.payment_gateway_names?.[0] || "unknown";

    console.log(`[Webhook] Processing Order #${order.order_number} (${gateway})`);

    // Check if it is a Net Terms order
    if (gateway === "manual" || gateway === "Net Terms") {
        
        // 1. Calculate Due Date (Net 30)
        const date = new Date();
        date.setDate(date.getDate() + 30); // Add 30 days

        // 2. Save to Database (Upsert prevents duplicates if webhook fires twice)
        try {
            await db.invoice.upsert({
                where: { orderId: order.admin_graphql_api_id },
                update: {}, // If it exists, do nothing
                create: {
                    shop: shop, // <--- CRITICAL FIX: Save the shop domain
                    orderId: order.admin_graphql_api_id,
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
import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  console.log(`[Webhook] Received ${topic} for ${shop}`);

  // =================================================================
  // 1. GDPR & REDACTION LOGIC (KEEPING THIS INTACT)
  // =================================================================
  
  if (topic === "CUSTOMERS_DATA_REQUEST") {
    console.log(`[GDPR] Data Request for ${payload.customer.email}`);
    return new Response("Data request logged", { status: 200 });
  }

  if (topic === "CUSTOMERS_REDACT") {
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

  // =================================================================
  // 2. ORDER PROCESSING LOGIC (EXISTING + NEW BALANCE UPDATE)
  // =================================================================
  if (topic === "ORDERS_CREATE" && admin) {
    const order = payload as any;
    
    // Check both the gateway name AND payment_gateway_names array for safety
    const paymentGateways = order.payment_gateway_names || [];
    
    // LOGGING: See what we actually got
    console.log(`[Webhook] Order #${order.order_number} received.`);
    console.log(`[Webhook] - Gateway: ${order.gateway}`);
    console.log(`[Webhook] - Payment Names: ${JSON.stringify(paymentGateways)}`);

    // Allow 'bogus' for testing, 'manual', or explicit 'Net Terms'
    const isNetTerms = 
        paymentGateways.some((n: string) => {
            const lower = n.toLowerCase();
            return lower.includes("net") && lower.includes("terms");
        }) || 
        order.gateway === "manual" || 
        order.gateway === "bogus"; 

    console.log(`[Webhook] Is Net Terms? ${isNetTerms}`);

    if (isNetTerms) {
        console.log(`[Webhook] ✅ Identified as Net Terms Order. Processing...`);

        // --- PART A: Save Invoice to Database (Your Existing Code) ---
        const date = new Date();
        date.setDate(date.getDate() + 30); 

        try {
            // Ensure Shop exists to prevent Foreign Key errors
            await db.shop.upsert({
                where: { shop: shop },
                update: {},
                create: { shop: shop }
            });

            await db.invoice.upsert({
                where: { orderId: `${order.admin_graphql_api_id}` },
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
            console.log(`✅ Invoice saved to DB for Order #${order.order_number}`);
        } catch (error) {
            console.error("Failed to save invoice:", error);
        }

        // --- PART B: Update Customer Credit Balance (NEW CODE) ---
        // We only proceed if we have a valid customer ID attached to the order
        if (order.customer && order.customer.admin_graphql_api_id) {
            try {
                const customerId = order.customer.admin_graphql_api_id;
                const orderTotalCents = Math.round(parseFloat(order.total_price) * 100);

                console.log(`[Net Terms] Updating Balance for ${customerId}. Adding: ${orderTotalCents} cents`);

                // 1. Fetch CURRENT Outstanding Balance
                const customerResponse = await admin.graphql(
                    `#graphql
                    query getCustomer($id: ID!) {
                        customer(id: $id) {
                            metafield(namespace: "net_terms", key: "outstanding") {
                                value
                            }
                        }
                    }`,
                    { variables: { id: customerId } }
                );

                const customerData = await customerResponse.json();
                const currentOutstanding = parseInt(customerData.data?.customer?.metafield?.value || "0", 10);

                // 2. Calculate NEW Balance
                const newOutstanding = currentOutstanding + orderTotalCents;

                // 3. Save it back to Shopify
                await admin.graphql(
                    `#graphql
                    mutation updateOutstanding($id: ID!, $value: String!) {
                        metafieldsSet(metafields: [{
                            ownerId: $id,
                            namespace: "net_terms",
                            key: "outstanding",
                            type: "number_integer",
                            value: $value
                        }]) {
                            userErrors { field message }
                        }
                    }`,
                    {
                        variables: {
                            id: customerId,
                            value: newOutstanding.toString()
                        }
                    }
                );
                console.log(`[Net Terms] SUCCESS: Balance updated to ${newOutstanding}`);
            } catch (err) {
                console.error("Failed to update credit balance:", err);
            }
        } else {
            console.log("[Net Terms] Skipping balance update (No Customer ID found on order)");
        }
    }
  }

  return new Response();
};
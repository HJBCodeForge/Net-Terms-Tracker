import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[Webhook Debug] Processing logic at /webhooks/app/orders/create");
  
  // 1. Authenticate that the signal came from Shopify
  const { admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    console.log("[Webhook Debug] No admin context in specific handler.");
    return new Response();
  }

  // 2. Parse the Order Data
  const order = payload as any;
  console.log(`[Net Terms] Processing Order (Specific Handler): ${order.name}`);

  // 3. CHECK: Is this a "Net Terms" order?
  const paymentGateways = order.payment_gateway_names || [];
  
  // Allow 'bogus' for testing, 'manual', or explicit 'Net Terms' (case insensitive)
  const isNetTerms = 
      paymentGateways.some((n: string) => {
          const lower = n.toLowerCase();
          return lower.includes("net") && lower.includes("terms");
      }) || 
      order.gateway === "manual" || 
      order.gateway === "bogus";

  if (!isNetTerms) {
    console.log("[Net Terms] Ignoring order (Not Net Terms/Bogus)");
    return new Response();
  }

  if (!order.customer) {
    console.log("[Net Terms] No customer attached. Skipping.");
    return new Response();
  }

  // ==========================================================
  // LOGIC B: UPDATE OUTSTANDING BALANCE
  // ==========================================================
  const customerId = order.customer.admin_graphql_api_id; 
  
  // 1. Get the Order Total in Cents
  const orderTotalCents = Math.round(parseFloat(order.total_price) * 100);
  console.log(`[Net Terms] Updating Balance. Adding: ${orderTotalCents} cents`);

  // 2. Fetch CURRENT Customer Data (Outstanding Balance & Tags)
  const customerResponse = await admin.graphql(
    `#graphql
    query getCustomer($id: ID!) {
      customer(id: $id) {
        tags
        metafield(namespace: "net_terms", key: "outstanding") {
          value
        }
      }
    }`,
    { variables: { id: customerId } }
  );

  const customerData = await customerResponse.json();
  const currentOutstandingCents = customerData.data.customer?.metafield?.value 
      ? parseInt(customerData.data.customer.metafield.value) 
      : 0;

  const tags = customerData.data.customer?.tags || [];
  
  // DETERMINE TERM
  let days = 30; // Default
  if (tags.includes("Net15_Approved")) days = 15;
  else if (tags.includes("Net60_Approved")) days = 60;
  
  // CALCULATE DUE DATE
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);
  
  // FORMAT FOR METAFIELD (YYYY-MM-DD or ISO)
  // Liquid 'date' filter handles ISO strings well.
  const dueDateISO = dueDate.toISOString(); 

  // ==========================================================
  // LOGIC A: INVOICE GENERATION
  // ==========================================================
  try {
      const { shop } = await authenticate.webhook(request);
      
      // Ensure Shop exists to prevent Foreign Key errors
      await db.shop.upsert({
          where: { shop: shop },
          update: {},
          create: { shop: shop }
      });

      await db.invoice.upsert({
          where: { orderId: `${order.admin_graphql_api_id}` },
          update: { dueDate: dueDate },
          create: {
              shop: shop,
              orderId: `${order.admin_graphql_api_id}`,
              orderNumber: `${order.order_number}`,
              customerId: `${order.customer?.id || 'unknown'}`,
              customerName: `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`,
              customerEmail: order.customer?.email || 'no-email',
              amount: parseFloat(order.total_price),
              currency: order.currency,
              dueDate: dueDate,
              status: "PENDING"
          }
      });
      console.log(`✅ Invoice saved to DB with Net ${days} Terms.`);
  } catch (error) {
      console.error("Failed to save invoice (Specific Handler):", error);
  }

  // ==========================================================
  // LOGIC C: SAVE DUE DATE TO ORDER METAFIELD (For Liquid Access)
  // ==========================================================
  const orderId = order.admin_graphql_api_id;
  await admin.graphql(
    `#graphql
    mutation setOrderMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          ownerId: orderId,
          namespace: "net_terms",
          key: "due_date",
          type: "date_time",
          value: dueDateISO
        }]
      }
    }
  );
  console.log(`✅ Due Date (${dueDateISO}) saved to Order Metafield.`);

  // ==========================================================
  // LOGIC B: UPDATE OUTSTANDING BALANCE (Continued)
  // ==========================================================

  // 3. Calculate NEW Balance (using variables from Step 2)
  const newOutstanding = currentOutstandingCents + orderTotalCents;

  // 4. Save it back to Shopify
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

  return new Response();
};
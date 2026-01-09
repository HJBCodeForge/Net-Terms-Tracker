import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. Authenticate that the signal came from Shopify
  const { admin, payload, topic } = await authenticate.webhook(request);

  if (!admin) {
    return new Response();
  }

  // 2. Parse the Order Data
  const order = payload as any;
  console.log(`[Net Terms] Processing Order: ${order.name}`);

  // 3. CHECK: Is this a "Net Terms" order?
  const isNetTerms = order.payment_gateway_names.includes("Net Terms") || order.gateway === "manual";

  if (!isNetTerms) {
    console.log("[Net Terms] Ignoring order (Not Net Terms)");
    return new Response();
  }

  if (!order.customer) {
    console.log("[Net Terms] No customer attached. Skipping.");
    return new Response();
  }

  // ==========================================================
  // LOGIC A: INVOICE GENERATION (Placeholder)
  // ==========================================================
  // This confirms the order was received successfully
  console.log(`✅ Net Terms Order Verified: ${order.name}`);


  // ==========================================================
  // LOGIC B: UPDATE OUTSTANDING BALANCE
  // ==========================================================
  const customerId = order.customer.admin_graphql_api_id; 
  
  // 1. Get the Order Total in Cents
  const orderTotalCents = Math.round(parseFloat(order.total_price) * 100);
  console.log(`[Net Terms] Updating Balance. Adding: ${orderTotalCents} cents`);

  // 2. Fetch CURRENT Outstanding Balance
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

  // 3. Calculate NEW Balance
  const newOutstanding = currentOutstanding + orderTotalCents;

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
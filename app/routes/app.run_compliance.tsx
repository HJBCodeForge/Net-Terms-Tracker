import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  // 1. Find all PENDING invoices where dueDate is in the past
  const now = new Date();
  
  const overdueInvoices = await db.invoice.findMany({
    where: {
      status: "PENDING",
      dueDate: { lt: now } // "Less Than" now
    }
  });

  console.log(`[Enforcer] Found ${overdueInvoices.length} overdue invoices.`);

  let revokedCount = 0;

  // 2. Loop through them and drop the hammer
  for (const invoice of overdueInvoices) {
    
    // A. Update Database Status
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: "OVERDUE" }
    });

    // B. Revoke Shopify Tag (The Punishment)
    if (invoice.customerId && invoice.customerId !== 'unknown') {
        
        // SAFETY CHECK: Ensure ID is a GraphQL Global ID
        // If it looks like "123456", turn it into "gid://shopify/Customer/123456"
        let graphqlId = invoice.customerId;
        if (!graphqlId.startsWith("gid://")) {
            graphqlId = `gid://shopify/Customer/${graphqlId}`;
        }

        try {
            const response = await admin.graphql(
                `#graphql
                mutation revokeAndSuspend($id: ID!, $removeTags: [String!]!, $addTags: [String!]!) {
                  tagsRemove(id: $id, tags: $removeTags) {
                    userErrors { field message }
                  }
                  tagsAdd(id: $id, tags: $addTags) {
                    userErrors { field message }
                  }
                }`,
                {
                    variables: {
                        id: graphqlId,
                        removeTags: ["Net30_Approved"],
                        addTags: ["Net30_Suspended"]
                    }
                }
            );
            
            const result = await response.json();
            
            // Check for GraphQL errors
            if (result.data?.tagsRemove?.userErrors?.length === 0) {
                revokedCount++;
                console.log(`[Enforcer] Revoked access for customer ${graphqlId}`);
            } else {
                console.warn(`[Enforcer] Failed to revoke for ${graphqlId}:`, result.data?.tagsRemove?.userErrors);
            }
        } catch (error) {
            console.error(`[Enforcer] API Error for ${graphqlId}:`, error);
        }
    }
  }

  return json({ 
    status: "success", 
    processed: overdueInvoices.length, 
    revoked: revokedCount 
  });
};
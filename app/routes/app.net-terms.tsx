import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  ResourceList,
  Avatar,
  ResourceItem,
  Text,
  Badge,
  Button,
  InlineStack,
  Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// 1. LOADER
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getCustomers {
      customers(first: 20, reverse: true) {
        edges {
          node {
            id
            firstName
            lastName
            email 
            tags
          }
        }
      }
    }`
  );

  const data = await response.json();
  
  const customers = (data.data?.customers?.edges || []).map((edge: any) => {
    const node = edge.node;
    return {
      id: node.id,
      name: `${node.firstName || ""} ${node.lastName || ""}`.trim() || "No Name",
      email: node.email,
      isApproved: node.tags.includes("Net30_Approved"),
      initials: (node.firstName?.[0] || "") + (node.lastName?.[0] || "")
    };
  });

  return json({ customers });
};

// 2. ACTION (LOUD DEBUG VERSION)
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const customerId = formData.get("customerId") as string;
  const intent = formData.get("intent"); 

  console.log(`[Debug] Processing ${intent} for ID: ${customerId}`);

  if (!customerId) return json({ status: "error" });

  const TAG = "Net30_Approved";
  
  const mutation = intent === "approve" 
    ? `#graphql
      mutation addTags($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
          node { ... on Customer { id tags } }
        }
      }`
    : `#graphql
      mutation removeTags($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          userErrors { field message }
          node { ... on Customer { id tags } }
        }
      }`;

  try {
    const response = await admin.graphql(mutation, {
      variables: {
        id: customerId,
        tags: [TAG]
      }
    });

    const responseJson = await response.json();

    // --- THE LOUD LOGGING SECTION ---
    console.log("========================================");
    console.log("SHOPIFY API RESPONSE:");
    console.log(JSON.stringify(responseJson, null, 2));
    console.log("========================================");
    // --------------------------------

    return json({ status: "success", data: responseJson });

  } catch (error) {
    console.log("CRITICAL ERROR:", error);
    return json({ status: "error", message: error.message });
  }
};

// 3. UI COMPONENT (UPDATED WITH HIDDEN INPUT)
export default function NetTermsManager() {
  const { customers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <Page 
      title="Net Terms Manager"
      backAction={{ content: "Dashboard", url: "/app" }}
      secondaryActions={[
        { 
            content: "View Invoices", url: "/app/invoices" 
        },
        {
            content: "Dashboard", url: "/app"
        }
      ]}
    >
      <Layout>
        <Layout.Section>
           <Banner title="Gatekeeper Active">
             <p>Customers with the <strong>Net 30 Active</strong> badge will see the Net Terms payment option at checkout.</p>
           </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <ResourceList
              resourceName={{ singular: "customer", plural: "customers" }}
              items={customers}
              renderItem={(item) => {
                const { id, name, email, initials, isApproved } = item;
                const media = <Avatar customer size="md" name={name} initials={initials} />;

                const isSubmitting = fetcher.formData?.get("customerId") === id;
                
                // Logic: If they are approved, next action is 'revoke'. If not, 'approve'.
                const nextIntent = isApproved ? "revoke" : "approve";

                return (
                  <ResourceItem
                    id={id}
                    media={media}
                    accessibilityLabel={`View details for ${name}`}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                        <div style={{ width: "40%"}}>
                            <Text variant="bodyMd" fontWeight="bold" as="h3">{name}</Text>
                            <Text variant="bodySm" as="p" tone="subdued">{email}</Text>
                        </div>

                        <div style={{ width: "20%"}}>
                            {isApproved ? (
                                <Badge tone="success">Net 30 Active</Badge>
                            ) : (
                                <Badge tone="critical">Not Approved</Badge>
                            )}
                        </div>

                        <div style={{ width: "30%", textAlign: "right" }}>
                           <fetcher.Form method="post">
                               <input type="hidden" name="customerId" value={id} />
                               {/* THE FIX: Explicitly set the intent in a hidden field */}
                               <input type="hidden" name="intent" value={nextIntent} />
                               
                               {isApproved ? (
                                   <Button submit variant="primary" tone="critical" loading={isSubmitting}>
                                       Revoke Access
                                   </Button>
                               ) : (
                                   <Button submit variant="primary" loading={isSubmitting}>
                                       Approve Net 30
                                   </Button>
                               )}
                           </fetcher.Form>
                        </div>
                    </InlineStack>
                  </ResourceItem>
                );
              }}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
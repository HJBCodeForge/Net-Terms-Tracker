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

// 1. LOADER: Fetch Customers
// FIXED: We strictly use 'email', not 'defaultEmailAddress'
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
  
  // Transform data for UI
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

// 2. ACTION: Handle "Approve" or "Revoke" clicks
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const customerId = formData.get("customerId") as string;
  const intent = formData.get("intent"); // "approve" or "revoke"

  if (!customerId) return json({ status: "error" });

  const TAG = "Net30_Approved";
  
  // Define the mutation based on intent
  const mutation = intent === "approve" 
    ? `#graphql
      mutation addTags($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
        }
      }`
    : `#graphql
      mutation removeTags($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          userErrors { field message }
        }
      }`;

  await admin.graphql(mutation, {
    variables: {
      id: customerId,
      tags: [TAG]
    }
  });

  return json({ status: "success" });
};

// 3. UI COMPONENT
export default function NetTermsManager() {
  const { customers } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  return (
    <Page title="Net Terms Manager">
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

                return (
                  <ResourceItem
                    id={id}
                    media={media}
                    accessibilityLabel={`View details for ${name}`}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                        {/* Customer Info */}
                        <div style={{ width: "40%"}}>
                            <Text variant="bodyMd" fontWeight="bold" as="h3">{name}</Text>
                            <Text variant="bodySm" as="p" tone="subdued">{email}</Text>
                        </div>

                        {/* Status Badge */}
                        <div style={{ width: "20%"}}>
                            {isApproved ? (
                                <Badge tone="success">Net 30 Active</Badge>
                            ) : (
                                <Badge tone="critical">Not Approved</Badge>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div style={{ width: "30%", textAlign: "right" }}>
                           <fetcher.Form method="post">
                               <input type="hidden" name="customerId" value={id} />
                               {isApproved ? (
                                   <Button submit variant="primary" tone="critical" name="intent" value="revoke">
                                       Revoke Access
                                   </Button>
                               ) : (
                                   <Button submit variant="primary" name="intent" value="approve">
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
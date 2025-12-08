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
  Banner,
  ProgressBar,
  BlockStack,
  Box
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server"; // Import DB to check plan

// 1. LOADER
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // A. Fetch Customers
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

  // B. Calculate "Active" Count
  const approvedCount = customers.filter((c: any) => c.isApproved).length;

  // C. Fetch Shop Plan from DB
  const shopRecord = await db.shop.findUnique({
    where: { shop: session.shop },
  });
  const plan = shopRecord?.plan || "FREE";

  return json({ customers, approvedCount, plan });
};

// 2. ACTION (With Gatekeeper Logic)
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const customerId = formData.get("customerId") as string;
  const intent = formData.get("intent"); 

  console.log(`[Debug] Processing ${intent} for ID: ${customerId}`);

  if (!customerId) return json({ status: "error", message: "Missing Customer ID" });

  // --- GATEKEEPER LOGIC START ---
  if (intent === "approve") {
    const shopRecord = await db.shop.findUnique({
      where: { shop: session.shop },
    });

    const plan = shopRecord?.plan || "FREE";

    if (plan === "FREE") {
      // Re-count active users from Shopify to be safe
      const countResponse = await admin.graphql(
        `#graphql
        query countApproved {
          customers(first: 10, query: "tag:Net30_Approved") {
            edges { node { id } }
          }
        }`
      );
      const countData = await countResponse.json();
      const currentCount = countData.data.customers.edges.length;

      // STRICT LIMIT: 5
      if (currentCount >= 5) {
        return json({ 
            status: "error", 
            message: "Free Plan Limit Reached (5/5). Upgrade to Approve." 
        });
      }
    }
  }
  // --- GATEKEEPER LOGIC END ---

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
    return json({ status: "success", data: responseJson });

  } catch (error: any) {
    console.log("CRITICAL ERROR:", error);
    return json({ status: "error", message: error.message });
  }
};

// 3. UI COMPONENT
export default function NetTermsManager() {
  const { customers, plan, approvedCount } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();

  // Check if we just hit an error
  const isLimitError = fetcher.data?.status === "error";
  const errorMessage = fetcher.data?.message;

  // Plan Visuals
  const limit = 5;
  const isFree = plan === "FREE";
  // Avoid division by zero if limit is weird, cap at 100%
  const usagePercent = isFree ? Math.min(100, (approvedCount / limit) * 100) : 0;

  return (
    <Page 
      title="Net Terms Manager"
      backAction={{ content: "Dashboard", url: "/app" }}
      secondaryActions={[
        { content: "View Invoices", url: "/app/invoices" },
        { content: "Dashboard", url: "/app" }
      ]}
    >
      <Layout>
        <Layout.Section>
            {/* 1. GATEKEEPER ERROR BANNER */}
            {isLimitError && (
              <div style={{ marginBottom: "1rem" }}>
                 <Banner tone="critical" title="Upgrade Required">
                   <p>{errorMessage}</p>
                   <Button url="/app/pricing" variant="plain">View Plans</Button>
                 </Banner>
              </div>
            )}

            {/* 2. PLAN STATUS CARD (Handles Both Free & Paid) */}
            <div style={{ marginBottom: "1rem" }}>
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between">
                            <Text variant="headingSm" as="h3">Current Plan: {plan}</Text>
                            {isFree ? (
                                <Badge tone="info">Starter</Badge>
                            ) : (
                                <Badge tone="success">Active</Badge>
                            )}
                        </InlineStack>

                        {isFree ? (
                            // FREE VIEW: Usage Meter
                            <BlockStack gap="200">
                                <InlineStack align="space-between">
                                    <Text variant="bodySm" as="span">Usage: {approvedCount} / {limit} Customers</Text>
                                    <Button url="/app/pricing" variant="plain" size="micro">Upgrade for Unlimited</Button>
                                </InlineStack>
                                <ProgressBar progress={usagePercent} tone={approvedCount >= 5 ? "critical" : "primary"} />
                            </BlockStack>
                        ) : (
                            // PAID VIEW: Unlimited Badge
                            <Banner tone="success">
                                <Text variant="bodyMd" as="p">
                                    ✅ You have <strong>Unlimited</strong> Net Terms approvals.
                                </Text>
                            </Banner>
                        )}
                    </BlockStack>
                </Card>
            </div>

            <div style={{ marginBottom: "1rem" }}>
                 <Banner title="Gatekeeper Active">
                   <p>Customers with the <strong>Net 30 Active</strong> badge will see the Net Terms payment option at checkout.</p>
                 </Banner>
            </div>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <ResourceList
              resourceName={{ singular: "customer", plural: "customers" }}
              items={customers}
              renderItem={(item: any) => {
                const { id, name, email, initials, isApproved } = item;
                const media = <Avatar customer size="md" name={name} initials={initials} />;

                const isSubmitting = fetcher.formData?.get("customerId") === id;
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
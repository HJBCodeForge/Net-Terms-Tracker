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
  Box,
  Tooltip,
} from "@shopify/polaris";
import { AlertCircleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server"; 

// 1. LOADER (Preserved)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
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
  const approvedCount = customers.filter((c: any) => c.isApproved).length;
  const shopRecord = await db.shop.findUnique({ where: { shop: session.shop } });
  const plan = shopRecord?.plan || "FREE";
  return json({ customers, approvedCount, plan });
};

// 2. ACTION (Preserved)
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const customerId = formData.get("customerId") as string;
  const intent = formData.get("intent"); 

  if (intent === "approve") {
    const shopRecord = await db.shop.findUnique({ where: { shop: session.shop } });
    const plan = shopRecord?.plan || "FREE";
    if (plan === "FREE") {
      const countResponse = await admin.graphql(
        `#graphql
        query countApproved {
          customers(first: 10, query: "tag:Net30_Approved") { edges { node { id } } }
        }`
      );
      const countData = await countResponse.json();
      if (countData.data.customers.edges.length >= 5) {
        return json({ status: "error", message: "Free Limit (5) Reached. Upgrade to add more." });
      }
    }
  }

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
    
    if (responseJson.data?.tagsAdd?.userErrors?.length > 0) {
        return json({ status: "error", message: responseJson.data.tagsAdd.userErrors[0].message });
    }
    if (responseJson.data?.tagsRemove?.userErrors?.length > 0) {
        return json({ status: "error", message: responseJson.data.tagsRemove.userErrors[0].message });
    }

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

  const isLimitError = fetcher.data?.status === "error";
  const errorMessage = fetcher.data?.message;

  const limit = 5;
  const isFree = plan === "FREE";
  const usagePercent = isFree ? Math.min(100, (approvedCount / limit) * 100) : 0;
  const isAtLimit = isFree && approvedCount >= limit;

  return (
    <Page 
      title="Net Terms Manager"
      subtitle="Control who can pay later."
      backAction={{ content: "Dashboard", url: "/app" }}
      secondaryActions={[{ content: "View Invoices", url: "/app/invoices" }]}
    >
      <Layout>
        {/* 1. CAPACITY & STATUS */}
        <Layout.Section>
            {isLimitError && (
              <Box paddingBlockEnd="400">
                 <Banner tone="critical" title="Limit Reached" onDismiss={() => {}}>
                   <p>{errorMessage}</p>
                 </Banner>
              </Box>
            )}

            {isFree ? (
                <Card>
                    <BlockStack gap="300">
                        <InlineStack align="space-between">
                            <Text variant="headingSm" as="h3">Starter Plan Capacity</Text>
                            <Text variant="bodySm" as="span" tone={isAtLimit ? "critical" : "subdued"}>
                                {approvedCount} / {limit} Customers
                            </Text>
                        </InlineStack>
                        <ProgressBar 
                            progress={usagePercent} 
                            tone={isAtLimit ? "critical" : "primary"} 
                            size="small"
                        />
                        {isAtLimit && (
                            <Banner tone="info">
                                <InlineStack align="space-between" blockAlign="center">
                                    <p>You have reached the limit of the Starter plan.</p>
                                    <Button url="/app/pricing" size="micro">Upgrade to Pro</Button>
                                </InlineStack>
                            </Banner>
                        )}
                    </BlockStack>
                </Card>
            ) : (
                <Banner tone="success" title="Unlimited Access Active">
                    <p>You are on the <strong>{plan}</strong> plan. No customer limits applied.</p>
                </Banner>
            )}
        </Layout.Section>

        {/* 2. CUSTOMER LIST */}
        <Layout.Section>
          <Card padding="0">
            <ResourceList
              resourceName={{ singular: "customer", plural: "customers" }}
              items={customers}
              emptyState={
                  <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <Text variant="headingMd" as="h3">No customers found</Text>
                      <p>Your 20 most recent customers will appear here.</p>
                  </div>
              }
              renderItem={(item: any) => {
                const { id, name, email, initials, isApproved } = item;
                const isSubmitting = fetcher.formData?.get("customerId") === id;
                const nextIntent = isApproved ? "revoke" : "approve";

                return (
                  <ResourceItem
                    id={id}
                    media={<Avatar customer size="md" name={name} initials={initials} />}
                    accessibilityLabel={`View details for ${name}`}
                    onClick={() => {}}
                  >
                    <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                            <Text variant="bodyMd" fontWeight="bold" as="h3">{name}</Text>
                            <Text variant="bodySm" as="p" tone="subdued">{email}</Text>
                        </BlockStack>

                        <InlineStack gap="400" blockAlign="center">
                            {isApproved && <Badge tone="success">Net 30 Active</Badge>}
                            
                            <div style={{ minWidth: '100px', textAlign: 'right' }}>
                               <fetcher.Form method="post">
                                   <input type="hidden" name="customerId" value={id} />
                                   <input type="hidden" name="intent" value={nextIntent} />
                                   <Button 
                                        submit 
                                        size="slim"
                                        variant={isApproved ? "secondary" : "primary"} 
                                        tone={isApproved ? "critical" : undefined}
                                        loading={isSubmitting}
                                        disabled={!isApproved && isAtLimit}
                                    >
                                        {isApproved ? "Revoke" : "Approve"}
                                   </Button>
                               </fetcher.Form>
                            </div>
                        </InlineStack>
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
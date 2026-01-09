import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  Banner,
  BlockStack,
  ProgressBar,
  Box,
  TextField,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// 1. LOADER
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getCustomers {
      customers(first: 50, reverse: true) {
        nodes {
          id
          firstName
          lastName
          email
          tags
          credit_limit: metafield(namespace: "net_terms", key: "credit_limit") {
            value
          }
          outstanding: metafield(namespace: "net_terms", key: "outstanding") {
            value
          }
        }
      }
    }`
  );

  const data = await response.json();

  const customers = data.data.customers.nodes.map((node: any) => ({
    id: node.id,
    name: `${node.firstName || ""} ${node.lastName || ""}`.trim() || "No Name",
    email: node.email,
    isApproved: node.tags.includes("Net30_Approved"),
    creditLimit: node.credit_limit?.value ? parseFloat(node.credit_limit.value) / 100 : 0,
    outstanding: node.outstanding?.value ? parseFloat(node.outstanding.value) / 100 : 0,
  }));

  const approvedCount = customers.filter((c: any) => c.isApproved).length;
  const shopRecord = await db.shop.findUnique({
    where: { shop: session.shop },
  });
  const plan = shopRecord?.plan || "FREE";

  return json({ customers, approvedCount, plan });
};

// 2. ACTION
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const intent = formData.get("intent");
  const customerId = formData.get("customerId") as string;

  if (!customerId) return json({ status: "error", message: "Missing Customer ID" });

  if (intent === "update_limit") {
    const limit = formData.get("limit") as string;
    const limitCents = Math.round(parseFloat(limit || "0") * 100);

    const response = await admin.graphql(
      `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [{
            ownerId: customerId,
            namespace: "net_terms",
            key: "credit_limit",
            type: "number_integer",
            value: limitCents.toString()
          }]
        }
      }
    );
    return json({ status: "success" });
  }

  if (intent === "approve") {
    const shopRecord = await db.shop.findUnique({ where: { shop: session.shop } });
    const plan = shopRecord?.plan || "FREE";

    if (plan === "FREE") {
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

      if (currentCount >= 5) {
        return json({ status: "error", message: "Free Plan Limit Reached (5/5). Upgrade to Approve." });
      }
    }
  }

  const mutation = intent === "approve"
    ? `mutation addTags($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
        }
      }`
    : `mutation removeTags($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          userErrors { field message }
        }
      }`;

  await admin.graphql(mutation, {
    variables: { id: customerId, tags: ["Net30_Approved"] },
  });

  return json({ status: "success" });
};

// 3. UI COMPONENT
export default function NetTermsManager() {
  const { customers, plan, approvedCount } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const isLimitError = fetcher.data?.status === "error";

  const limit = 5;
  const isFree = plan === "FREE";
  const usagePercent = isFree ? Math.min(100, (approvedCount / limit) * 100) : 0;

  return (
    <Page 
      title="Net Terms Manager" 
      fullWidth
      secondaryActions={[
        { content: "View Invoices", url: "/app/invoices" },
        { content: "Pricing", url: "/app/pricing" },
      ]}
    >
      <Layout>
        <Layout.Section>
          {isLimitError && (
            <Banner tone="critical" title="Action Failed">
              <p>{fetcher.data?.message}</p>
            </Banner>
          )}
          
          <Box paddingBlockEnd="400">
            {isFree ? (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingSm" as="h3">Plan Usage: {approvedCount} / {limit} Customers</Text>
                  <ProgressBar progress={usagePercent} tone="primary" />
                </BlockStack>
              </Card>
            ) : (
              <Banner tone="success"><p>✅ Unlimited Plan Active</p></Banner>
            )}
          </Box>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <CustomerTable customers={customers} isAtLimit={isFree && approvedCount >= limit} />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function CustomerTable({ customers, isAtLimit }: { customers: any[], isAtLimit: boolean }) {
  const resourceName = { singular: "customer", plural: "customers" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(customers);

  const rowMarkup = customers.map(
    ({ id, name, email, isApproved, creditLimit, outstanding }, index) => {
      const available = creditLimit - outstanding;
      
      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
        >
          {/* Customer */}
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">{name}</Text>
            <div style={{ color: "#666", fontSize: "12px" }}>{email}</div>
          </IndexTable.Cell>

          {/* Status Badge */}
          <IndexTable.Cell>
            {isApproved ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}
          </IndexTable.Cell>

          {/* Action Button */}
          <IndexTable.Cell>
            <ApprovalButton id={id} isApproved={isApproved} isAtLimit={isAtLimit} />
          </IndexTable.Cell>

          {/* Limit Input - Wider Box for Button */}
          <IndexTable.Cell>
             {isApproved ? (
               <Box maxWidth="220px">
                 <LimitInput id={id} currentLimit={creditLimit} />
               </Box>
             ) : <Text as="span" tone="subdued">—</Text>}
          </IndexTable.Cell>

          {/* Owed */}
          <IndexTable.Cell>
            {isApproved ? `$${outstanding.toFixed(2)}` : "—"}
          </IndexTable.Cell>

          {/* Available */}
          <IndexTable.Cell>
            {isApproved ? (
              <Text as="span" tone={available < 0 ? "critical" : "success"} fontWeight="bold">
                ${available.toFixed(2)}
              </Text>
            ) : "—"}
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  return (
    <IndexTable
      resourceName={resourceName}
      itemCount={customers.length}
      selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
      onSelectionChange={handleSelectionChange}
      headings={[
        { title: "Customer" },
        { title: "Status" },
        { title: "Action" },
        { title: "Limit ($)" },
        { title: "Owed" },
        { title: "Available" },
      ]}
    >
      {rowMarkup}
    </IndexTable>
  );
}

function ApprovalButton({ id, isApproved, isAtLimit }: { id: string, isApproved: boolean, isAtLimit: boolean }) {
  const fetcher = useFetcher();
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <fetcher.Form method="post">
        <input type="hidden" name="customerId" value={id} />
        <input type="hidden" name="intent" value={isApproved ? "revoke" : "approve"} />
        <Button 
          submit 
          size="micro" 
          variant={isApproved ? "primary" : "secondary"} 
          tone={isApproved ? "critical" : undefined}
          disabled={!isApproved && isAtLimit}
        >
          {isApproved ? "Revoke" : "Approve"}
        </Button>
      </fetcher.Form>
    </div>
  );
}

// FIX: New LimitInput with "Save" Button
function LimitInput({ id, currentLimit }: { id: string, currentLimit: number }) {
  const [val, setVal] = useState(currentLimit === 0 ? "" : currentLimit.toString());
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    setVal(currentLimit === 0 ? "" : currentLimit.toString());
  }, [currentLimit]);

  const handleSave = () => {
    const submitVal = val === "" ? "0" : val;
    
    const formData = new FormData();
    formData.append("intent", "update_limit");
    formData.append("customerId", id);
    formData.append("limit", submitVal);
    
    fetcher.submit(formData, { method: "post" });
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <InlineStack gap="200" wrap={false} align="start" blockAlign="center">
        <div style={{ width: "100px" }}>
            <TextField
                label="Limit"
                labelHidden
                type="number"
                name="limit"
                value={val}
                onChange={(newValue) => setVal(newValue)}
                placeholder="0.00"
                autoComplete="off"
            />
        </div>
        <Button 
            onClick={handleSave} 
            loading={isSubmitting}
            size="micro"
        >
            Save
        </Button>
      </InlineStack>
    </div>
  );
}
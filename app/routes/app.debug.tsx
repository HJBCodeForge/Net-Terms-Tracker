import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, BlockStack, Banner, List, Box, Badge, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const count = await db.invoice.count();
  return json({ count });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. Get Session (Required to link data to your shop)
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  // A. CLEAR DATABASE
  if (intent === "clear_db") {
    await db.invoice.deleteMany({});
    return json({ status: "success", logs: [], message: "Database wiped. Ready to re-sync." });
  }
  
  // B. SYNC ORDERS
  if (intent === "sync_orders") {
    const response = await admin.graphql(
      `#graphql
      query getRecentOrders {
        orders(first: 10, reverse: true) {
          nodes {
            id
            name
            displayFinancialStatus
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { id displayName email }
            createdAt
            processedAt
            dueDate: metafield(namespace: "net_terms", key: "due_date") { value }
          }
        }
      }`
    );
    
    const data = await response.json();
    const orders = data.data.orders.nodes;
    
    const logs = [];
    let addedCount = 0;

    for (const order of orders) {
      const exists = await db.invoice.findFirst({ where: { orderId: order.id } });
      const isPending = order.displayFinancialStatus === "PENDING" || order.displayFinancialStatus === "PARTIALLY_PAID";
      
      let status = "SKIPPED";
      let reason = "";

      if (exists) {
        reason = "Already in Database";
      } else if (!isPending) {
        reason = `Status is ${order.displayFinancialStatus} (Not PENDING)`;
      } else {
        // FIX: Connect the invoice to the current Shop
        await db.invoice.create({
             data: {
               orderId: order.id,
               orderNumber: order.name,
               customerId: order.customer?.id || "unknown",
               customerName: order.customer?.displayName || "Unknown",
               customerEmail: order.customer?.email || "",
               amount: parseFloat(order.totalPriceSet?.shopMoney?.amount || "0"),
               currency: order.totalPriceSet?.shopMoney?.currencyCode || "USD",
               status: "PENDING",
               dueDate: order.dueDate?.value ? new Date(order.dueDate.value) : new Date(order.processedAt),
               // The missing link:
               shopData: {
                 connect: {
                   shop: session.shop
                 }
               }
             }
        });
        status = "ADDED";
        reason = `Synced to Customer: ${order.customer?.displayName}`;
        addedCount++;
      }

      logs.push({
        name: order.name,
        shopifyStatus: order.displayFinancialStatus,
        action: status,
        reason: reason
      });
    }

    return json({ status: "success", logs, addedCount });
  }
  return json({ status: "success", logs: [] });
};

export default function DebugPage() {
  const { count } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<any>();
  const logs = fetcher.data?.logs || [];
  const message = fetcher.data?.message;

  return (
    <Page title="Deep Scan Diagnostics">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Database Repair</Text>
              <Text as="p">Current Invoices in DB: <strong>{count}</strong></Text>
              
              {message && <Banner tone="success">{message}</Banner>}

              <InlineStack gap="300">
                <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="clear_db" />
                    <Button submit tone="critical" variant="primary" loading={fetcher.state !== "idle"}>
                    1. Clear Database
                    </Button>
                </fetcher.Form>

                <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="sync_orders" />
                    <Button submit variant="primary" loading={fetcher.state !== "idle"}>
                    2. Sync Orders
                    </Button>
                </fetcher.Form>
              </InlineStack>
              
              {logs.length > 0 && (
                <Box paddingBlockStart="400">
                  <Text variant="headingSm" as="h3">Scan Results:</Text>
                  <List type="bullet">
                    {logs.map((log: any, index: number) => (
                      <List.Item key={index}>
                        <strong>Order {log.name}</strong>: <Badge tone={log.action === "ADDED" ? "success" : "critical"}>{log.action}</Badge> — {log.reason}
                      </List.Item>
                    ))}
                  </List>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
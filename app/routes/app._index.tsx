import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link as RemixLink } from "@remix-run/react";
import {
  Page,
  Layout,
  BlockStack,
  Card,
  Text,
  Button,
  InlineGrid,
  Divider,
  Box,
  Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // 1. Fetch Stats
  const invoices = await db.invoice.findMany();
  
  // Calculate Totals
  const pendingInvoices = invoices.filter(i => i.status === "PENDING");
  const pendingCount = pendingInvoices.length;
  
  // Sum up the total amount due (Assuming USD for simplicity in this demo)
  const totalDue = pendingInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  return json({ 
    totalDue, 
    pendingCount,
    totalCount: invoices.length 
  });
};

export default function Index() {
  const { totalDue, pendingCount, totalCount } = useLoaderData<typeof loader>();

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <Page title="Dashboard">
      <BlockStack gap="500">
        
        {/* 1. TOP SUMMARY BANNER */}
        <Layout>
          <Layout.Section>
            {pendingCount > 0 ? (
                <Banner tone="warning" title={`You have ${pendingCount} unpaid invoices.`}>
                   <p>Action may be required to collect payments.</p>
                </Banner>
            ) : (
                <Banner tone="success" title="All caught up!">
                    <p>You have no outstanding debt to collect.</p>
                </Banner>
            )}
          </Layout.Section>

          {/* 2. STATS CARDS */}
          <Layout.Section>
            <InlineGrid columns={3} gap="400">
              
              {/* Card 1: Total Money Owed */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Total Receivables</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {formatMoney(totalDue)}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">Total pending amount</Text>
                </BlockStack>
              </Card>

              {/* Card 2: Pending Count */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Pending Invoices</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {pendingCount}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">Orders awaiting payment</Text>
                </BlockStack>
              </Card>

              {/* Card 3: Total History */}
              <Card>
                <BlockStack gap="200">
                  <Text as="h2" variant="headingSm">Total Orders</Text>
                  <Text as="p" variant="heading2xl" fontWeight="bold">
                    {totalCount}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">Lifetime Net Terms orders</Text>
                </BlockStack>
              </Card>

            </InlineGrid>
          </Layout.Section>

          {/* 3. QUICK NAVIGATION */}
          <Layout.Section>
            <Card>
                <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Quick Actions</Text>
                    <Divider />
                    <InlineGrid columns={2} gap="400">
                        
                        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">Manage Access</Text>
                                <p>Approve or revoke Net Terms access for specific customers.</p>
                                <Button url="/app/net-terms" variant="primary">Go to Manager</Button>
                            </BlockStack>
                        </Box>

                        <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h3" variant="headingSm">View Ledger</Text>
                                <p>See all invoices, check due dates, and mark orders as paid.</p>
                                <Button url="/app/invoices">View Invoices</Button>
                            </BlockStack>
                        </Box>

                    </InlineGrid>
                </BlockStack>
            </Card>
          </Layout.Section>

        </Layout>
      </BlockStack>
    </Page>
  );
}
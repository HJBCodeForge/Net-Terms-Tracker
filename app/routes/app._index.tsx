import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  Box,
} from "@shopify/polaris";
import { CreditCardIcon, ReceiptIcon, SettingsIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // 1. Fetch Shop Plan
  const shopRecord = await db.shop.findUnique({
    where: { shop: session.shop },
  });
  const plan = shopRecord?.plan || "FREE";

  // 2. Fetch Quick Stats (Optional polish)
  const pendingInvoices = await db.invoice.count({
    where: { shop: session.shop, status: "PENDING" }
  });

  return json({ plan, pendingInvoices });
};

export default function Index() {
  const { plan, pendingInvoices } = useLoaderData<typeof loader>();
  const isFree = plan === "FREE";

  return (
    <Page title="Dashboard">
      <Layout>
        {/* 1. PLAN STATUS CARD */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Subscription Status</Text>
                {isFree ? (
                    <Badge tone="info">Starter Plan</Badge>
                ) : (
                    <Badge tone="success">Pro Plan Active</Badge>
                )}
              </InlineStack>

              <BlockStack gap="200">
                <Text variant="bodyMd" as="p">
                  {isFree 
                    ? "You are currently limited to 5 Net Terms customers." 
                    : "You have unlimited access to Net Terms, Email Automation, and Data Exports."
                  }
                </Text>
                {isFree && (
                   <Button url="/app/pricing" variant="primary">Upgrade to Pro</Button>
                )}
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 2. QUICK ACTIONS */}
        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                    <div style={{ padding: '8px', background: '#f1f8f5', borderRadius: '8px' }}>
                        <CreditCardIcon width={24} />
                    </div>
                    <Text variant="headingSm" as="h3">Net Terms Manager</Text>
                </InlineStack>
                <Text variant="bodyMd" as="p">Approve or revoke Net 30 status for your wholesale customers.</Text>
                <Button url="/app/net-terms" fullWidth>Manage Customers</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneHalf">
          <Card>
            <BlockStack gap="200">
                <InlineStack gap="200" blockAlign="center">
                    <div style={{ padding: '8px', background: '#f1f8f5', borderRadius: '8px' }}>
                         <ReceiptIcon width={24} />
                    </div>
                    <Text variant="headingSm" as="h3">Invoices</Text>
                    {pendingInvoices > 0 && <Badge tone="warning">{pendingInvoices} Pending</Badge>}
                </InlineStack>
                <Text variant="bodyMd" as="p">Track payments, download PDFs, and manage collections.</Text>
                <Button url="/app/invoices" fullWidth>View Invoices</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* 3. SETUP REMINDER (Footer) */}
        <Layout.Section>
             <Box paddingBlockStart="400">
                 <Banner title="One-time Setup Required" tone="info" icon={SettingsIcon}>
                    <p>
                        If you haven't already, ensure you have created the <strong>"Net Terms"</strong> manual payment method in your 
                        <Link to="shopify:admin/settings/payments" target="_blank" rel="noopener noreferrer"> Shopify Payment Settings</Link>.
                    </p>
                 </Banner>
             </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
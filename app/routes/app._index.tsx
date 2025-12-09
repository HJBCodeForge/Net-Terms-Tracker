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
  InlineGrid,
  Divider,
} from "@shopify/polaris";
import { CreditCardIcon, ReceiptIcon, SettingsIcon, LockIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkSubscription } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // 1. Sync & Fetch Shop Plan
  const plan = await checkSubscription(request);

  // 2. Fetch Quick Stats
  const pendingInvoices = await db.invoice.count({
    where: { shop: session.shop, status: "PENDING" }
  });

  // 3. AUTO-ACTIVATE PAYMENT RULE (Logic Preserved)
  const customizationsResponse = await admin.graphql(
    `#graphql
    query {
      paymentCustomizations(first: 10, query: "title:'Net Terms Gatekeeper'") {
        nodes { id enabled }
      }
    }`
  );
  const customizationsData = await customizationsResponse.json();
  const existingCustomization = customizationsData.data?.paymentCustomizations?.nodes?.[0];

  if (!existingCustomization) {
    // ... (Existing creation logic preserved) ...
    const functionsResponse = await admin.graphql(
      `#graphql
      query {
        shopifyFunctions(first: 25) {
          nodes { id title apiType }
        }
      }`
    );
    const functionsData = await functionsResponse.json();
    const functionNode = functionsData.data?.shopifyFunctions?.nodes?.find(
      (node: any) => node.title === "net-terms-payment-rule"
    );

    if (functionNode) {
      await admin.graphql(
        `#graphql
        mutation paymentCustomizationCreate($functionId: String!) {
          paymentCustomizationCreate(paymentCustomization: {
            title: "Net Terms Gatekeeper",
            enabled: true,
            functionId: $functionId
          }) {
            paymentCustomization { id }
            userErrors { field message }
          }
        }`,
        { variables: { functionId: functionNode.id } }
      );
    }
  }

  return json({ plan, pendingInvoices });
};

export default function Index() {
  const { plan, pendingInvoices } = useLoaderData<typeof loader>();
  
  const isFree = plan === "FREE";
  const isPro = plan === "PRO";

  return (
    <Page title="Overview">
      <BlockStack gap="600">
        
        {/* 1. CRITICAL SETUP ACTION (Moved to Top for Visibility) */}
        <Banner title="Essential Setup Required" tone="info" icon={SettingsIcon}>
            <p>
                To offer Net Terms at checkout, you must enable the manual payment method in your 
                <Link to="shopify:admin/settings/payments" target="_blank" rel="noopener noreferrer"> Shopify Settings</Link>.
            </p>
        </Banner>

        <Layout>
            {/* 2. MAIN KPI SECTION */}
            <Layout.Section>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                    {/* Invoice Health */}
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text variant="headingSm" as="h3">Accounts Receivable</Text>
                                <ReceiptIcon width={20} tone="subdued" />
                            </InlineStack>
                            <Box paddingBlock="200">
                                <Text variant="heading3xl" as="h2">
                                    {pendingInvoices}
                                </Text>
                                <Text variant="bodySm" tone="subdued">Pending Invoices</Text>
                            </Box>
                            <Button url="/app/invoices" fullWidth variant="primary">View Invoices</Button>
                        </BlockStack>
                    </Card>

                    {/* Subscription Health */}
                    <Card>
                        <BlockStack gap="400">
                             <InlineStack align="space-between" blockAlign="center">
                                <Text variant="headingSm" as="h3">Current Plan</Text>
                                <Badge tone={isPro ? "success" : "info"}>{plan} TIER</Badge>
                            </InlineStack>
                            
                            <Box paddingBlock="200">
                                <Text variant="bodyMd" as="p" tone="subdued">
                                    {isFree && "Limited to 5 Net Terms customers. Upgrade to automate approvals and remove limits."}
                                    {isPro && "You are running on the highest tier. Unlimited access enabled."}
                                </Text>
                            </Box>

                            {!isPro ? (
                                <Button url="/app/pricing" fullWidth tone="critical">Upgrade to Pro</Button>
                            ) : (
                                <Button url="/app/pricing" fullWidth variant="plain">Manage Subscription</Button>
                            )}
                        </BlockStack>
                    </Card>
                </InlineGrid>
            </Layout.Section>

            {/* 3. FEATURE NAVIGATION */}
            <Layout.Section>
                <Card>
                    <BlockStack gap="500">
                        <Text variant="headingMd" as="h2">Management</Text>
                        <Divider />
                        <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="400" blockAlign="center">
                                <div style={{ padding: '10px', background: '#F1F8F5', borderRadius: '8px', color: '#008060' }}>
                                    <CreditCardIcon width={24} />
                                </div>
                                <BlockStack gap="050">
                                    <Text variant="headingSm" as="h3">Net Terms Manager</Text>
                                    <Text variant="bodySm" tone="subdued">Approve wholesale customers for Net 30</Text>
                                </BlockStack>
                            </InlineStack>
                            <Button url="/app/net-terms">Manage</Button>
                        </InlineStack>

                        <InlineStack align="space-between" blockAlign="center">
                             <InlineStack gap="400" blockAlign="center">
                                <div style={{ padding: '10px', background: '#EDEEEF', borderRadius: '8px', color: '#5C5F62' }}>
                                    <LockIcon width={24} />
                                </div>
                                <BlockStack gap="050">
                                    <Text variant="headingSm" as="h3">Automated Reminders</Text>
                                    <Text variant="bodySm" tone="subdued">{isPro ? "Active and monitoring" : "Upgrade to enable email automation"}</Text>
                                </BlockStack>
                            </InlineStack>
                            <Button url="/app/pricing" disabled={isPro} variant={isPro ? "plain" : "primary"}>
                                {isPro ? "Configured" : "Unlock"}
                            </Button>
                        </InlineStack>
                    </BlockStack>
                </Card>
            </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
import { json, redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { useState } from "react";
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
  Modal,
  Image,
} from "@shopify/polaris";
import { CreditCardIcon, ReceiptIcon, SettingsIcon, LockIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { getPlanDetails } = await import("../billing.server");

  const { session, admin } = await authenticate.admin(request);
  // (Terms Acceptance is now checked globally in app.jsx layout)

  // 2. Sync & Fetch Shop Plan
  const planDetails = await getPlanDetails(request);
  const plan = planDetails.plan;

  // 3. Fetch Quick Stats
  const pendingInvoices = await db.invoice.count({
    where: { shop: session.shop, status: "PENDING" }
  });

  const overdueInvoices = await db.invoice.count({
    where: { shop: session.shop, status: "OVERDUE" }
  });

  // 4. AUTO-ACTIVATE PAYMENT RULE
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

  // Pass this flag to the UI to optionally hide the banner if they are already set up
  const isSetupComplete = !!existingCustomization?.enabled;

  return json({ 
    plan: planDetails.plan, 
    trialEndsOn: planDetails.trialEndsOn,
    daysRemaining: planDetails.daysRemaining,
    isVip: planDetails.isVip,
    pendingInvoices, 
    overdueInvoices, 
    isSetupComplete 
  });
};

export default function Index() {
  const { plan, trialEndsOn, daysRemaining, isVip, pendingInvoices, overdueInvoices, isSetupComplete } = useLoaderData<typeof loader>();
  const [modalOpen, setModalOpen] = useState(false);
  
  const isFree = plan === "FREE";
  const isGrowth = plan === "GROWTH";
  const isPro = plan === "PRO";

  // --- TRIAL BANNER ---
  const TrialBanner = () => {
    if (!trialEndsOn || daysRemaining < 0) return null;
    
    // Customize text for VIPs vs Standard
    const title = isVip 
        ? `VIP Access Active: ${daysRemaining} days remaining in your extended trial.`
        : `Free Trial Active: ${daysRemaining} days remaining.`;

    return (
      <Box paddingBlockEnd="400">
        <Banner tone="info" title={title}>
          <p>
             Your trial ends on {new Date(trialEndsOn).toLocaleDateString()}. 
             Need specific help? <Link url="/app/support">Contact Support</Link>.
          </p>
        </Banner>
      </Box>
    );
  };

  // --- SETUP GUIDE MODAL COMPONENT ---
  const SetupGuideModal = () => (
    <Modal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      title="How to Enable Net Terms"
      primaryAction={{
        content: 'Open Payment Settings',
        url: 'shopify:admin/settings/payments',
        external: true, // Opens in new tab so they don't lose the guide
      }}
      secondaryActions={[
        {
          content: 'Close',
          onAction: () => setModalOpen(false),
        },
      ]}
      size="large"
    >
      <Modal.Section>
        <BlockStack gap="800">
            <Banner tone="info">
                <p>Keep this window open while you follow the steps in your Settings tab.</p>
            </Banner>

            {/* STEP 1 */}
            <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Step 1: Navigate to Payment Settings</Text>
                <Text as="p">Go to your Shopify Admin. Click <strong>Settings</strong> (bottom left), then select <strong>Payments</strong>.</Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="200" shadow="200">
                     {/* Ensure these images exist in your /public folder */}
                     <Image source="/setup-1.png" alt="Step 1: Settings Menu" width="100%" />
                </Box>
            </BlockStack>
            <Divider />

            {/* STEP 2 */}
            <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Step 2: Add Manual Payment Method</Text>
                <Text as="p">Scroll down to the <strong>Manual payment methods</strong> section. Click the button <strong>Add manual payment method</strong>.</Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="200" shadow="200">
                     <Image source="/setup-2.png" alt="Step 2: Add Method Button" width="100%" />
                </Box>
            </BlockStack>
            <Divider />

            {/* STEP 3 */}
            <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Step 3: Choose 'Create custom payment method'</Text>
                <Text as="p">Select the option labeled <strong>Create custom payment method</strong> from the dropdown list.</Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="200" shadow="200">
                     <Image source="/setup-3.png" alt="Step 3: Select Custom" width="100%" />
                </Box>
            </BlockStack>
            <Divider />

            {/* STEP 4 */}
            <BlockStack gap="400">
                <Text variant="headingMd" as="h3">Step 4: Name it 'Net Terms'</Text>
                <Text as="p">Type exactly <strong>Net Terms</strong> into the name field and click <strong>Activate</strong>.</Text>
                <Box padding="200" background="bg-surface-secondary" borderRadius="200" shadow="200">
                     <Image source="/setup-4.png" alt="Step 4: Activate" width="100%" />
                </Box>
            </BlockStack>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );

  return (
    <Page title="Overview">
      {/* RENDER THE MODAL */}
      <SetupGuideModal />

      <BlockStack gap="600">

        {/* TRIAL WARNING BANNER */}
        <TrialBanner />
        
        {/* OVERDUE WARNING BANNER */}
        {overdueInvoices > 0 && (
          <Banner
            title="Action Required: Overdue Invoices Detected"
            tone="critical"
            action={{ content: "View Invoices", url: "/app/invoices" }}
          >
            <p>
              There {overdueInvoices === 1 ? "is" : "are"} {overdueInvoices} overdue 
              invoice{overdueInvoices === 1 ? "" : "s"} requiring attention.
            </p>
          </Banner>
        )}

        {/* 1. CRITICAL SETUP ACTION */}
        {/* We show this banner if setup is NOT complete, or if you prefer, always show it for reference */}
        {!isSetupComplete && (
            <Banner 
                title="Essential Setup Required" 
                tone="warning" 
                icon={SettingsIcon}
                action={{
                    content: "View Setup Guide", 
                    onAction: () => setModalOpen(true) 
                }}
                secondaryAction={{
                    content: "Go to Settings",
                    url: "shopify:admin/settings/payments",
                    external: true
                }}
            >
                <p>
                    To offer Net Terms at checkout, you must enable the manual payment method in your settings.
                </p>
            </Banner>
        )}

        <Layout>
            {/* 2. MAIN KPI SECTION */}
            <Layout.Section>
                <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
                    {/* Invoice Health */}
                    <Card>
                        <BlockStack gap="400">
                            <InlineStack align="space-between" blockAlign="center">
                                <Text variant="headingSm" as="h3">Accounts Receivable</Text>
                                <div style={{ color: 'var(--p-color-text-secondary)' }}>
                                  <ReceiptIcon width={20} />
                                </div>
                            </InlineStack>
                            <Box paddingBlock="200">
                                <Text variant="heading2xl" as="h2">
                                    {pendingInvoices}
                                </Text>
                                <Text variant="bodySm" as="p" tone="subdued">Pending Invoices</Text>
                            </Box>
                            <Button url="/app/invoices" fullWidth variant="primary">View Invoices</Button>
                        </BlockStack>
                    </Card>

                    {/* Subscription Health */}
                    <Card>
                        <BlockStack gap="400">
                             <InlineStack align="space-between" blockAlign="center">
                                <Text variant="headingSm" as="h3">Current Plan</Text>
                                <Badge tone={isPro ? "success" : "info"}>{`${plan} TIER`}</Badge>
                            </InlineStack>
                            
                            <Box paddingBlock="200">
                                <Text variant="bodyMd" as="p" tone="subdued">
                                    {isFree && "Limited to 5 Net Terms customers. Upgrade to automate approvals and remove limits."}
                                    {isGrowth && "Unlimited customers enabled. Upgrade to Pro for PDF Invoicing and Priority Support."}
                                    {isPro && "You are running on the highest tier. Unlimited access enabled."}
                                </Text>
                            </Box>

                            {/* TRIAL DAYS REMAINING - PUSH TO UPGRADE */}
                            {trialEndsOn && daysRemaining >= 0 && (
                                <Box paddingBlockEnd="200">
                                    <Text variant="bodySm" as="p" tone="success" fontWeight="bold" alignment="center">
                                        ✨ {daysRemaining} Day{daysRemaining !== 1 ? 's' : ''} Remaining in Free Trial
                                    </Text>
                                </Box>
                            )}

                            {!isPro ? (
                                <Button url="/app/pricing" fullWidth tone="critical">
                                    {isFree ? "Upgrade to Growth" : "Upgrade to Pro"}
                                </Button>
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
                                    <Text variant="bodySm" as="p" tone="subdued">Approve wholesale customers for Net 30</Text>
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
                                    <Text variant="bodySm" as="p" tone="subdued">{isPro ? "Active and monitoring" : "Upgrade to enable email automation"}</Text>
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
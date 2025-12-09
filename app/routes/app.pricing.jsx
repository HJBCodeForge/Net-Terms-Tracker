import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, BlockStack, Box, InlineGrid, Badge, Divider, List, InlineStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { createSubscription, checkSubscription, cancelSubscription } from "../billing.server";
import { useEffect } from "react";

// LOADER & ACTION (Preserved)
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  if (shopParam && chargeId) {
    return json({ billingComplete: true, shop: shopParam, appUrl: process.env.SHOPIFY_APP_URL });
  }

  const { session } = await authenticate.admin(request);
  const currentPlan = await checkSubscription(request);
  return json({ currentPlan });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const desiredPlan = formData.get("plan");

  if (desiredPlan === "FREE") {
    await cancelSubscription(request, session.shop);
    return json({ status: "success" });
  }

  if (desiredPlan === "GROWTH" || desiredPlan === "PRO") {
    const confirmUrl = await createSubscription(request, session.shop, desiredPlan);
    if (confirmUrl) return json({ confirmUrl }); 
  }
  return json({ status: "error" });
};

export default function PricingPage() {
  const loaderData = useLoaderData(); 
  const actionData = useActionData();
  const submit = useSubmit();

  useEffect(() => {
    if (actionData?.confirmUrl) window.top.location.href = actionData.confirmUrl;
  }, [actionData]);

  useEffect(() => {
    if (loaderData?.billingComplete && loaderData?.shop) {
      const targetUrl = `${loaderData.appUrl}/auth/login?shop=${loaderData.shop}`;
      try { window.open(targetUrl, "_top"); } catch (e) { console.error(e); }
    }
  }, [loaderData]);

  if (loaderData?.billingComplete) {
    const targetUrl = `${loaderData.appUrl}/auth/login?shop=${loaderData.shop}`;
    return (
      <Page>
        <Layout><Layout.Section><Card><Text>Redirecting...</Text><Button url={targetUrl}>Click here</Button></Card></Layout.Section></Layout>
      </Page>
    );
  }

  const { currentPlan } = loaderData;
  const handlePlanSelect = (plan) => submit({ plan }, { method: "POST" });

  const PlanCard = ({ tier, title, price, features, recommended = false }) => {
    const isActive = currentPlan === tier;
    const isFree = tier === "FREE";
    const isDowngrade = !isActive && isFree; 

    return (
      <div style={recommended ? { transform: 'scale(1.02)', border: '2px solid #008060', borderRadius: '10px' } : {}}>
        <Card background={recommended ? "bg-surface-secondary" : "bg-surface"}>
            <BlockStack gap="400">
            <BlockStack gap="200">
                <InlineStack align="space-between">
                    <Text as="h2" variant="headingLg">{title}</Text>
                    {recommended && !isActive && <Badge tone="success">Most Popular</Badge>}
                    {isActive && <Badge tone="info">Current</Badge>}
                </InlineStack>
                <Text as="p" variant="heading3xl" fontWeight="bold">
                ${price}<span style={{fontSize: "0.5em", color: "#6D7175", fontWeight: "normal"}}>/mo</span>
                </Text>
            </BlockStack>
            
            <Divider />

            <Box minHeight="200px">
                <BlockStack gap="300">
                {features.map((f, i) => (
                    <InlineStack key={i} gap="200" blockAlign="start">
                        <span style={{color: "#008060"}}>✓</span>
                        <Text as="span" variant="bodyMd">{f}</Text>
                    </InlineStack>
                ))}
                </BlockStack>
            </Box>

            <Button 
                variant={isActive ? "secondary" : recommended ? "primary" : "secondary"} 
                disabled={isActive}
                onClick={() => !isActive && handlePlanSelect(tier)}
                fullWidth
            >
                {isActive ? "Active Plan" : isDowngrade ? "Downgrade" : `Select ${title}`}
            </Button>
            </BlockStack>
        </Card>
      </div>
    );
  };

  return (
    <Page title="Plans & Pricing" subtitle="Choose the right plan for your wholesale business.">
      <Layout>
        <Layout.Section>
            <InlineGrid columns={{xs: 1, md: 3}} gap="400" alignItems="start">
                <PlanCard 
                    tier="FREE" 
                    title="Starter" 
                    price="0" 
                    features={["5 Net Terms Customers", "Manual Approval", "Email Support"]} 
                />
                <PlanCard 
                    tier="GROWTH" 
                    title="Growth" 
                    price="19" 
                    recommended={true}
                    features={["Unlimited Customers", "Automated Email Reminders", "Priority Support", "Remove Branding"]} 
                />
                <PlanCard 
                    tier="PRO" 
                    title="Pro" 
                    price="49" 
                    features={["Everything in Growth", "PDF Invoice Generation", "Bulk CSV Data Exports", "Dedicated Account Manager"]} 
                />
            </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
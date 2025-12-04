import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useActionData } from "@remix-run/react";
import { Page, Layout, Card, Text, Button, BlockStack, Box, InlineGrid, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { createSubscription, checkSubscription } from "../billing.server";
import { useEffect } from "react";

// app/routes/app.pricing.jsx

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const chargeId = url.searchParams.get("charge_id");

  // If returning from billing, force OAuth handshake immediately
  if (shopParam && chargeId) {
    console.log(`[Pricing] Billing complete. Redirecting to OAuth for ${shopParam}`);

    // Return a JSON response to trigger a client-side redirect
    // This avoids potential issues with server-side redirects stripping query params
    return json({ 
      billingComplete: true, 
      shop: shopParam,
      appUrl: process.env.SHOPIFY_APP_URL 
    });
  }

  const { session } = await authenticate.admin(request);
  const currentPlan = await checkSubscription(request);

  return json({ currentPlan });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const desiredPlan = formData.get("plan");

  console.log(`[Pricing] Initiating upgrade to ${desiredPlan}...`);

  if (desiredPlan === "GROWTH" || desiredPlan === "PRO") {
    const confirmUrl = await createSubscription(request, session.shop, desiredPlan);

    console.log(`[Pricing] Generated confirmation URL: ${confirmUrl}`);

    if (confirmUrl) {
      // Return the URL to the client so it can "break out" of the iframe
      return json({ confirmUrl });
    }
  }

  return json({ status: "error" });
};

export default function PricingPage() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  // Client-Side Redirect to break out of iframe
  useEffect(() => {
    if (actionData?.confirmUrl) {
      window.top.location.href = actionData.confirmUrl;
    }
  }, [actionData]);

  // Handle post-billing redirect
  useEffect(() => {
    if (loaderData?.billingComplete && loaderData?.shop) {
      const targetUrl = `${loaderData.appUrl}/auth/login?shop=${loaderData.shop}`;
      console.log(`[Pricing] Client-side redirecting to ${targetUrl}`);
      try {
        window.open(targetUrl, "_top");
      } catch (e) {
        console.error("Automatic redirect failed:", e);
      }
    }
  }, [loaderData]);

  if (loaderData?.billingComplete) {
    const targetUrl = `${loaderData.appUrl}/auth/login?shop=${loaderData.shop}`;
    return (
      <Page>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400" align="center">
                <Text as="h2" variant="headingMd">
                  Billing confirmed!
                </Text>
                <Text>
                   Redirecting you back to the app...
                </Text>
                <Button url={targetUrl} target="_top" variant="primary">
                    Click here if you are not redirected
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const { currentPlan } = loaderData;

  const handleUpgrade = (plan) => {
    submit({ plan }, { method: "POST" });
  };

  const PlanCard = ({ tier, title, price, features }) => {
    const isActive = currentPlan === tier;
    const isFree = tier === "FREE";

    return (
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="200">
            <Text as="h2" variant="headingLg">
              {title}
              {isActive && <Badge tone="success"> Current Plan</Badge>}
            </Text>
            <Text as="p" variant="heading2xl" fontWeight="bold">
              ${price}<span style={{ fontSize: "0.5em" }}>/mo</span>
            </Text>
          </BlockStack>

          <Box minHeight="150px">
            <BlockStack gap="200">
              {features.map((f, i) => (
                <Text key={i} as="p" variant="bodyMd">✓ {f}</Text>
              ))}
            </BlockStack>
          </Box>

          <Button
            variant={isActive ? "secondary" : "primary"}
            disabled={isActive}
            onClick={() => !isActive && !isFree && handleUpgrade(tier)}
          >
            {isActive ? "Active" : isFree ? "Free Forever" : `Upgrade to ${title}`}
          </Button>
        </BlockStack>
      </Card>
    );
  };

  return (
    <Page title="Subscription Plans" backAction={{ content: "Dashboard", url: "/app" }}>
      <Layout>
        <Layout.Section>
          <InlineGrid columns={3} gap="400">
            <PlanCard
              tier="FREE"
              title="Free Tier"
              price="0"
              features={["5 Net Terms Customers", "Manual Approval", "Basic Support"]}
            />
            <PlanCard
              tier="GROWTH"
              title="Growth"
              price="19"
              features={["Unlimited Customers", "Automated Email Reminders", "Standard Support"]}
            />
            <PlanCard
              tier="PRO"
              title="Pro"
              price="49"
              features={["Everything in Growth", "PDF Invoice Generation", "CSV Data Exports", "Priority Support"]}
            />
          </InlineGrid>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
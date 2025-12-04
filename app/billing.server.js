import { authenticate } from "./shopify.server";
import db from "./db.server";

export const PLANS = {
  FREE: {
    name: "Free Tier",
    price: 0,
    interval: "EVERY_30_DAYS",
    limit: 5,
  },
  GROWTH: {
    name: "Growth Plan",
    price: 19,
    interval: "EVERY_30_DAYS",
    features: ["Automated Email Reminders", "Unlimited Customers"],
  },
  PRO: {
    name: "Pro Plan",
    price: 49,
    interval: "EVERY_30_DAYS",
    features: ["PDF Invoicing", "CSV Exports", "Priority Support"],
  },
};

export async function getShop(shopDomain) {
  const shop = await db.shop.findUnique({ where: { shop: shopDomain } });
  
  if (!shop) {
    return await db.shop.create({
      data: {
        shop: shopDomain,
        plan: "FREE",
      },
    });
  }
  return shop;
}

export async function createSubscription(request, shopDomain, plan) {
  const { admin } = await authenticate.admin(request);
  const planDetails = PLANS[plan];
  
  // 1. Get the Base URL
  let appUrl = process.env.SHOPIFY_APP_URL || "https://admin.shopify.com";
  
  // Remove trailing slash if present to avoid double slashes
  if (appUrl.endsWith("/")) {
    appUrl = appUrl.slice(0, -1);
  }

  // 2. Construct Return URL with Explicit Shop Parameter
  const returnUrl = `${appUrl}/app/pricing?shop=${shopDomain}`;

  console.log("---------------------------------------------------");
  console.log(`[Billing] 💰 Initiating Charge for ${shopDomain}`);
  console.log(`[Billing] 🔗 Return URL set to: ${returnUrl}`);
  console.log("---------------------------------------------------");

  const response = await admin.graphql(
    `#graphql
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
        }
      }
    }`,
    {
      variables: {
        name: planDetails.name,
        returnUrl: returnUrl,
        test: true, 
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: planDetails.price, currencyCode: "USD" },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    }
  );

  const data = await response.json();
  const errors = data.data.appSubscriptionCreate.userErrors;

  if (errors && errors.length > 0) {
    console.error("❌ BILLING FAILED:", JSON.stringify(errors, null, 2));
    return null;
  }

  return data.data.appSubscriptionCreate.confirmationUrl;
}

export async function checkSubscription(request) {
  const { admin, session } = await authenticate.admin(request);
  
  const response = await admin.graphql(
    `#graphql
    query {
      appInstallation {
        activeSubscriptions {
          name
          status
          test
        }
      }
    }`
  );

  const data = await response.json();
  const activeSubscriptions = data.data.appInstallation.activeSubscriptions;

  let currentPlan = "FREE";

  if (activeSubscriptions.length > 0) {
    const subName = activeSubscriptions[0].name;
    if (subName === "Growth Plan") currentPlan = "GROWTH";
    if (subName === "Pro Plan") currentPlan = "PRO";
  }

  await db.shop.upsert({
    where: { shop: session.shop },
    update: { plan: currentPlan, billingStatus: "ACTIVE" },
    create: {
      shop: session.shop,
      plan: currentPlan,
      billingStatus: "ACTIVE",
      customerCount: 0
    }
  });

  return currentPlan;
}

export async function requirePlan(shopDomain, requiredPlan) {
  const shop = await getShop(shopDomain);
  
  if (shop.plan === "FREE") return false;
  if (requiredPlan === "PRO" && shop.plan === "GROWTH") return false;
  
  return true;
}
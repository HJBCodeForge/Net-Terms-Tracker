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

const VIP_SHOPS = [
  "netterms-demo-v1.myshopify.com",
  "hjb-codeforge-test-01.myshopify.com",
  "hjb-billing-test.myshopify.com"
];

export { VIP_SHOPS }; // Export for use in pricing page

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
  // DEV BYPASS: Allow unlimited testing without "Managed Pricing" errors
  if (process.env.NODE_ENV === "development") {
    console.log(`[Billing] 🛠️ DEV MODE: Bypassing Billing API for plan change to ${plan}`);
    
    await db.shop.upsert({
      where: { shop: shopDomain },
      update: {
        plan: plan,
        billingStatus: "ACTIVE",
        subscriptionId: `dev-mock-${Date.now()}`
      },
      create: {
        shop: shopDomain,
        plan: plan,
        billingStatus: "ACTIVE",
        subscriptionId: `dev-mock-${Date.now()}`
      }
    });

    return null; // Return null to signal immediate success (no redirect needed)
  }

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
  
  // 3. Determine Trial Days (VIP Override)
  let trialDays = 7; // Standard 7-day trial
  if (VIP_SHOPS.includes(shopDomain)) {
    console.log(`[Billing] 🌟 VIP SHOP DETECTED: Granting 365-day trial to ${shopDomain}`);
    trialDays = 365;
  }

  console.log("---------------------------------------------------");
  console.log(`[Billing] 💰 Initiating Charge for ${shopDomain}`);
  console.log(`[Billing] 🔗 Return URL set to: ${returnUrl}`);
  console.log(`[Billing] ⏳ Trial Days: ${trialDays}`);
  console.log("---------------------------------------------------");

  const response = await admin.graphql(
    `#graphql
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $test: Boolean, $trialDays: Int) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: $test, trialDays: $trialDays) {
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
        trialDays: trialDays,
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
  
  // DEV BYPASS: In dev mode, the DB is the source of truth, not Shopify
  if (process.env.NODE_ENV === "development") {
    const dbShop = await db.shop.findUnique({ where: { shop: session.shop } });
    return dbShop?.plan || "FREE";
  }
  
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

export async function getPlanDetails(request) {
  const { admin, session } = await authenticate.admin(request);
  const isVip = VIP_SHOPS.includes(session.shop);

  // DEV BYPASS
  if (process.env.NODE_ENV === "development") {
    const dbShop = await db.shop.findUnique({ where: { shop: session.shop } });
    const fakePlan = dbShop?.plan || "FREE";
    
    // FAKE TRIAL LOGIC FOR DEV
    let fakeTrialEnd = null;
    let fakeDaysRemaining = 0;
    
    if (fakePlan !== "FREE") {
        // Simulate a trial that expires in 5 days
        const now = Date.now();
        const days = isVip ? 365 : 7;
        const fakeEndTime = now + (days * 24 * 60 * 60 * 1000) - (2 * 24 * 60 * 60 * 1000); // Created 2 days ago
        fakeTrialEnd = new Date(fakeEndTime).toISOString();
        fakeDaysRemaining = Math.max(0, Math.ceil((fakeEndTime - now) / (1000 * 60 * 60 * 24)));
    }

    return {
      plan: fakePlan,
      isVip,
      trialEndsOn: fakeTrialEnd,
      daysRemaining: fakeDaysRemaining,
      status: "ACTIVE"
    };
  }

  const response = await admin.graphql(
    `#graphql
    query {
      appInstallation {
        activeSubscriptions {
          name
          status
          test
          trialDays
          currentPeriodEnd
          createdAt
        }
      }
    }`
  );

  const data = await response.json();
  const activeSubscriptions = data.data.appInstallation.activeSubscriptions;

  let currentPlan = "FREE";
  let trialEndsOn = null;
  let daysRemaining = 0;

  if (activeSubscriptions.length > 0) {
    const sub = activeSubscriptions[0];
    if (sub.name === "Growth Plan") currentPlan = "GROWTH";
    if (sub.name === "Pro Plan") currentPlan = "PRO";
    
    // Calculate Trial Status
    // If 'trialDays' > 0, we can check if we are still within that window
    if (sub.trialDays > 0 && sub.createdAt) {
      const createdTime = new Date(sub.createdAt).getTime();
      const trialDurationMs = sub.trialDays * 24 * 60 * 60 * 1000;
      const endTime = createdTime + trialDurationMs;
      const now = Date.now();
      
      if (endTime > now) {
        trialEndsOn = new Date(endTime).toISOString();
        daysRemaining = Math.ceil((endTime - now) / (1000 * 60 * 60 * 24));
      }
    }
  }

  return {
    plan: currentPlan,
    isVip,
    trialEndsOn,
    daysRemaining,
    status: activeSubscriptions[0]?.status || "ACTIVE"
  };
}

export async function requirePlan(shopDomain, requiredPlan) {
  const shop = await getShop(shopDomain);
  
  if (shop.plan === "FREE") return false;
  if (requiredPlan === "PRO" && shop.plan === "GROWTH") return false;
  
  return true;
}

// app/billing.server.js

// ... existing code ...

// 4. Helper to Cancel Subscription (Downgrade to Free)
export async function cancelSubscription(request, shopDomain) {
  const { admin } = await authenticate.admin(request);

  // A. Find the active paid subscription
  const response = await admin.graphql(
    `#graphql
    query {
      appInstallation {
        activeSubscriptions {
          id
          name
          status
        }
      }
    }`
  );

  const data = await response.json();
  const activeSubscriptions = data.data.appInstallation.activeSubscriptions;

  if (activeSubscriptions.length > 0) {
    const subscriptionId = activeSubscriptions[0].id;

    // B. Cancel it using the GraphQL Mutation
    const cancelResponse = await admin.graphql(
      `#graphql
      mutation AppSubscriptionCancel($id: ID!) {
        appSubscriptionCancel(id: $id) {
          userErrors {
            field
            message
          }
          appSubscription {
            id
            status
          }
        }
      }`,
      {
        variables: {
          id: subscriptionId
        }
      }
    );

    const cancelData = await cancelResponse.json();
    if (cancelData.data.appSubscriptionCancel.userErrors.length > 0) {
      console.error("❌ Failed to cancel:", cancelData.data.appSubscriptionCancel.userErrors);
      return false;
    }
  }

  // C. Update Local DB to FREE
  await db.shop.update({
    where: { shop: shopDomain },
    data: { plan: "FREE", billingStatus: "ACTIVE" } 
  });

  return true;
}
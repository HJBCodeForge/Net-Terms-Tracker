import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { json, redirect } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { VIP_SHOPS } from "../billing.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  
  // If returning from billing, skip authentication in the parent loader
  // to avoid a redirect loop (authenticate.admin throws redirect on failure).
  // The child route (app.pricing.jsx) will handle the client-side redirect.
  if (url.searchParams.get("shop") && url.searchParams.get("charge_id")) {
    return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
  }

  const { session } = await authenticate.admin(request);

  // GLOBAL TERMS GATEKEEPER
  // Protects all routes from unauthorized access until terms are accepted.
  // We allow access to the terms page itself and the privacy policy.
  const isTermsPage = url.pathname === "/app/terms";
  const isPrivacyPage = url.pathname === "/app/privacy";
  
  if (!isTermsPage && !isPrivacyPage) {
       const shopRecord = await db.shop.findUnique({
        where: { shop: session.shop },
      });

      // If record exists but terms not accepted, redirect (or if record missing/issue, we might let them pass or handle error, here assuming record exists from auth)
      if (shopRecord && !shopRecord.termsAccepted) {
        throw redirect("/app/terms");
      }
  }

  const showDiagnostics = process.env.NODE_ENV === "development" || VIP_SHOPS.includes(session.shop);

  return json({ apiKey: process.env.SHOPIFY_API_KEY || "", showDiagnostics });
};

export default function App() {
  const { apiKey, showDiagnostics } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      {/* This NavMenu controls the top navigation bar of your app. 
        We are adding the "Net Terms Manager" link here.
        The 'to' prop matches the filename: app.net-terms.tsx -> "/app/net-terms"
      */}
      <NavMenu>
        <Link to="/app" rel="home">Home</Link>
        <Link to="/app/net-terms">Net Terms Manager</Link> 
        <Link to="/app/invoices">Invoices</Link>
        <Link to="/app/pricing">Plans & Pricing</Link>
        <Link to="/app/additional">Payment Settings</Link>
        {showDiagnostics && <Link to="/app/debug">Diagnostics</Link>}
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs this to handle errors gracefully
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
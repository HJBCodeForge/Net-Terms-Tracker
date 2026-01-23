import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  
  // If returning from billing, skip authentication in the parent loader
  // to avoid a redirect loop (authenticate.admin throws redirect on failure).
  // The child route (app.pricing.jsx) will handle the client-side redirect.
  if (url.searchParams.get("shop") && url.searchParams.get("charge_id")) {
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  }

  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

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
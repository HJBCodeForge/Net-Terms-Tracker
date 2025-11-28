import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
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
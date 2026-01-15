import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import '@shopify/shopify-api/adapters/node';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // 1. Get the session for the shop
  const shopDomain = 'netterms-demo-v1.myshopify.com';
  const sessionData = await prisma.session.findFirst({
    where: { shop: shopDomain }
  });

  if (!sessionData) {
    console.error(`No session found for ${shopDomain}`);
    return;
  }

  console.log("Found session for:", sessionData.shop);

  // 2. Initialize API library manually (just for this script)
  const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: ['read_products', 'read_orders', 'read_customers'], // Add scopes as needed
    hostName: 'localhost',
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
  });

  // 3. Create a session object
  const session = new shopify.Session(sessionData);

  // 4. Client to query webhooks
  const client = new shopify.clients.Graphql({ session });

  const response = await client.request(`
    query {
      webhookSubscriptions(first: 10) {
        edges {
          node {
            id
            topic
            endpoint {
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    }
  `);

  console.log(JSON.stringify(response.data, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

import { json, type LoaderFunctionArgs } from "@remix-run/node";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Divider,
  List,
  Box
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({});
};

export default function PrivacyPolicy() {
  return (
    <Page 
      title="Privacy Policy" 
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="500">
              <BlockStack gap="200">
                <Text variant="headingLg" as="h1">Privacy Policy</Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  Last Updated: {new Date().toLocaleDateString()}
                </Text>
              </BlockStack>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">1. Role of the Service</Text>
                <Text as="p">
                  For the purposes of the GDPR and CPRA, <strong>HJB CodeForge</strong> acts as a <strong>Data Processor</strong>. 
                  The Merchant is the <strong>Data Controller</strong>. We process data solely to fulfill the Merchant's instructions (generating invoices).
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">2. Data We Collect</Text>
                <Text as="p">We collect only the Minimum Necessary Data to function:</Text>
                <Box paddingInlineStart="400">
                  <List type="bullet">
                    <List.Item>
                      <strong>Merchant Data:</strong> Shop URL, Email, Plan Status.
                    </List.Item>
                    <List.Item>
                      <strong>Buyer Data:</strong> Name, Email, Order IDs, Transaction Amounts.
                    </List.Item>
                  </List>
                </Box>
                <Text as="p" tone="subdued">
                  <em>Note:</em> We DO NOT store credit card numbers or payment tokens.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">3. Data Retention</Text>
                <Text as="p">
                  We retain invoice records for the duration of your installation. Upon uninstallation, data is retained for 30 days to allow for accidental re-installation, after which it is permanently deleted, unless a specific <strong>Shopify GDPR Redaction Request</strong> is received sooner.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

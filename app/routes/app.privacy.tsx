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
                <Text variant="headingMd" as="h2">2. Data We Collect & Store</Text>
                <Text as="p">We collect and store the following data to provide invoicing services:</Text>
                <Box paddingInlineStart="400">
                  <List type="bullet">
                    <List.Item>
                      <strong>Merchant Data:</strong> Shop URL, Shop Email, Shop Name, Billing Address, and Plan Status.
                    </List.Item>
                    <List.Item>
                      <strong>Customer Data:</strong> Name, Email Address, and Billing Address of customers who place orders using Net Terms.
                    </List.Item>
                    <List.Item>
                      <strong>Order Data:</strong> Order IDs, Line Items, Transaction Amounts, and Due Dates.
                    </List.Item>
                  </List>
                </Box>
                <Text as="p" tone="subdued">
                  <em>Note:</em> We DO NOT store credit card numbers, bank account numbers, or sensitive payment tokens. All payment processing is handled strictly by Shopify.
                </Text>
              </BlockStack>

              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">3. Data Retention & Deletion</Text>
                <Text as="p">
                  <strong>Active Retention:</strong> We retain invoice and customer records for the duration of your installation to maintain your financing history and reports.
                </Text>
                <Text as="p">
                   <strong>Uninstallation:</strong> Upon uninstallation of the App, your data is marked for deletion. We retain a backup for <strong>30 days</strong> to allow for data recovery in case of accidental uninstallation. After 30 days, all personal data is permanently deleted.
                </Text>
                <Text as="p">
                   <strong>GDPR/CCPA Requests:</strong> If we receive a mandatory "Shopify Redact" request (GDPR/CCPA), relevant personal data will be deleted within 48 hours, overriding the standard retention period.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

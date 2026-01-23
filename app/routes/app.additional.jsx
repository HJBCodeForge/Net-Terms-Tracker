import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { useState } from "react";
import {
  Box,
  Card,
  Layout,
  Link,
  List,
  Page,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  Select,
  FormLayout,
  Divider
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

// 1. LOADER: Fetch existing Metafield
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  const response = await admin.graphql(
    `#graphql
    query {
      shop {
        id
        metafield(namespace: "net_terms", key: "payment_instructions") {
          value
        }
      }
    }`
  );

  const responseJson = await response.json();
  const shopData = responseJson.data?.shop || {};

  return json({
    shopId: shopData.id,
    instructions: shopData.metafield?.value || ""
  });
};

// 2. ACTION: Compiler Logic
export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  
  const shopId = formData.get("shopId");
  const methodType = formData.get("methodType");
  
  let finalInstructions = "";

  // COMPILE THE FIELDS INTO TEXT FORMAT
  if (methodType === "wire") {
    const bank = formData.get("wire_bank");
    const holder = formData.get("wire_holder");
    const routing = formData.get("wire_routing");
    const account = formData.get("wire_account");
    const swift = formData.get("wire_swift");

    finalInstructions = `Payment Method: Wire Transfer\n` +
      `Bank: ${bank}\n` +
      `Account Holder: ${holder}\n` +
      `Routing: ${routing}\n` +
      `Account: ${account}\n` +
      (swift ? `SWIFT/BIC: ${swift}` : "");
      
  } else if (methodType === "check") {
    const payable = formData.get("check_payable");
    const address = formData.get("check_address");

    finalInstructions = `Payment Method: Mailed Check\n` +
      `Make Payable To: ${payable}\n` +
      `Address:\n${address}`;

  } else {
    // Custom / Other
    finalInstructions = formData.get("custom_text") || "";
  }

  // Save to Shopify Metafield
  await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          ownerId: shopId,
          namespace: "net_terms",
          key: "payment_instructions",
          type: "multi_line_text_field",
          value: finalInstructions
        }]
      }
    }
  );

  return json({ status: "success", savedInstructions: finalInstructions });
};

// HELPER: Parse string back into variables (Reverse Compiler)
const parseInstructions = (text) => {
  if (!text) return { type: 'custom', values: {} };

  // Detect Wire Format
  if (text.startsWith("Payment Method: Wire Transfer")) {
    const lines = text.split('\n');
    const getValue = (key) => {
      const line = lines.find(l => l.startsWith(key));
      return line ? line.split(': ')[1] : '';
    };

    return {
      type: 'wire',
      values: {
        bankName: getValue('Bank'),
        holder: getValue('Account Holder'),
        routing: getValue('Routing'),
        account: getValue('Account'),
        swift: getValue('SWIFT/BIC')
      }
    };
  }

  // Detect Check Format
  if (text.startsWith("Payment Method: Mailed Check")) {
     const lines = text.split('\n');
     const payableLine = lines.find(l => l.startsWith("Make Payable To:"));
     const payable = payableLine ? payableLine.split(': ')[1] : '';
     
     // Address is everything after "Address:" line
     const addressIndex = lines.findIndex(l => l.trim() === "Address:");
     const address = addressIndex !== -1 ? lines.slice(addressIndex + 1).join('\n') : '';

     return {
      type: 'check',
      values: { payable, address }
     };
  }

  // Fallback
  return { type: 'custom', values: { text } };
};

// 3. REACT COMPONENT
export default function AdditionalPage() {
  const { shopId, instructions } = useLoaderData();
  const fetcher = useFetcher();
  
  // Initialize state from existing data
  const initialData = parseInstructions(instructions);

  const [methodType, setMethodType] = useState(initialData.type);
  
  // Wire State
  const [wireBank, setWireBank] = useState(initialData.values.bankName || "");
  const [wireHolder, setWireHolder] = useState(initialData.values.holder || "");
  const [wireRouting, setWireRouting] = useState(initialData.values.routing || "");
  const [wireAccount, setWireAccount] = useState(initialData.values.account || "");
  const [wireSwift, setWireSwift] = useState(initialData.values.swift || "");

  // Check State
  const [checkPayable, setCheckPayable] = useState(initialData.values.payable || "");
  const [checkAddress, setCheckAddress] = useState(initialData.values.address || "");

  // Custom State
  const [customText, setCustomText] = useState(initialData.type === 'custom' ? (initialData.values.text || instructions) : instructions);

  const isSuccess = fetcher.data?.status === "success";
  const isSaving = fetcher.state !== "idle";

  const options = [
    {label: 'Wire Transfer / ACH', value: 'wire'},
    {label: 'Mailed Check', value: 'check'},
    {label: 'Custom / Other', value: 'custom'},
  ];

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Payment Instructions Wizard
              </Text>
              <Text as="p">
                Select your preferred payment method and fill in the details. These will be automatically formatted and displayed in the customer portal.
              </Text>

              {isSuccess && <Banner tone="success">Payment instructions updated successfully.</Banner>}

              <fetcher.Form method="post">
                <input type="hidden" name="shopId" value={shopId} />
                <input type="hidden" name="methodType" value={methodType} />
                
                <BlockStack gap="400">
                  <Select
                    label="Payment Method"
                    options={options}
                    onChange={setMethodType}
                    value={methodType}
                  />

                  <Divider />

                  {/* WIRE UI */}
                  {methodType === 'wire' && (
                    <FormLayout>
                      <FormLayout.Group>
                        <TextField label="Bank Name" name="wire_bank" value={wireBank} onChange={setWireBank} autoComplete="off"/>
                        <TextField label="Account Holder Name" name="wire_holder" value={wireHolder} onChange={setWireHolder} autoComplete="off"/>
                      </FormLayout.Group>
                      <FormLayout.Group>
                         <TextField label="Routing Number (ABA)" name="wire_routing" value={wireRouting} onChange={setWireRouting} autoComplete="off"/>
                         <TextField label="Account Number" name="wire_account" value={wireAccount} onChange={setWireAccount} autoComplete="off"/>
                      </FormLayout.Group>
                      <TextField label="SWIFT / BIC Code (Optional)" name="wire_swift" value={wireSwift} onChange={setWireSwift} autoComplete="off"/>
                    </FormLayout>
                  )}

                  {/* CHECK UI */}
                  {methodType === 'check' && (
                    <FormLayout>
                      <TextField label="Make Payable To" name="check_payable" value={checkPayable} onChange={setCheckPayable} autoComplete="off"/>
                      <TextField 
                        label="Mailing Address" 
                        name="check_address" 
                        value={checkAddress} 
                        onChange={setCheckAddress} 
                        multiline={4} 
                        autoComplete="off"
                        helpText="Include Street, City, State, and Zip Code."
                      />
                    </FormLayout>
                  )}

                  {/* CUSTOM UI */}
                  {methodType === 'custom' && (
                    <TextField 
                      label="Custom Instructions"
                      name="custom_text"
                      value={customText}
                      onChange={setCustomText}
                      multiline={6}
                      autoComplete="off"
                      helpText="Enter any text here. It will be displayed exactly as written."
                    />
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <Button submit variant="primary" loading={isSaving}>Save Instructions</Button>
                  </div>
                </BlockStack>
              </fetcher.Form>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        {/* PREVIEW SIDEBAR */}
        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="200">
               <Text as="h2" variant="headingMd">
                Live Preview
              </Text>
              <Text as="p" tone="subdued">
                This is exactly what customers will see in the "Pay Now" modal:
              </Text>
              
              <Box padding="300" background="bg-surface-secondary" borderRadius="200" minHeight="150px">
                <Text as="p" variant="bodySm">
                 {/* PREVIEW LOGIC */}
                 {methodType === 'custom' ? (customText || <span style={{fontStyle:'italic'}}>No custom text entered...</span>) :
                  methodType === 'wire' ? (
                    <>
                      Payment Method: Wire Transfer<br/>
                      Bank: {wireBank || "..."}<br/>
                      Account Holder: {wireHolder || "..."}<br/>
                      Routing: {wireRouting || "..."}<br/>
                      Account: {wireAccount || "..."}<br/>
                      {wireSwift && <>SWIFT/BIC: {wireSwift}</>}
                    </>
                  ) : (
                    <>
                      Payment Method: Mailed Check<br/>
                      Make Payable To: {checkPayable || "..."}<br/>
                      Address:<br/>
                      {/* Convert newlines to breaks for preview */}
                      {(checkAddress || "...").split('\n').map((str, i) => <span key={i}>{str}<br/></span>)}
                    </>
                  )
                 }
                </Text>
              </Box>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}


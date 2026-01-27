import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
import { useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  Tooltip,
  Banner,
  BlockStack,
} from "@shopify/polaris";
import { LockIcon, ExportIcon } from "@shopify/polaris-icons"; 
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { checkSubscription } from "../billing.server"; 

// 1. LOADER (Preserved)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request); 
  const plan = await checkSubscription(request); 
  const invoices = await db.invoice.findMany({ 
    where: { shop: session.shop }, 
    orderBy: { createdAt: "desc" } 
  });
  return json({ invoices, shop: session.shop, plan });
};

// 2. DIAGNOSTIC ACTION
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const invoiceId = formData.get("invoiceId") as string;
  const intent = formData.get("intent");

  console.log(`[Invoice Debug] Action Triggered. Intent: ${intent}, ID: ${invoiceId}`);

  if (intent === "mark_paid" && invoiceId) {
    // A. Find the Invoice
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
        console.error("[Invoice Debug] Invoice not found in DB.");
        return json({ status: "error", message: "Invoice not found" });
    }

    console.log(`[Invoice Debug] Found Invoice #${invoice.orderNumber}`);
    console.log(`[Invoice Debug] - Status: ${invoice.status}`);
    console.log(`[Invoice Debug] - Order ID (DB): ${invoice.orderId}`);
    console.log(`[Invoice Debug] - Customer ID (DB): ${invoice.customerId}`);
    console.log(`[Invoice Debug] - Amount: ${invoice.amount}`);

    // B. Update Local Database
    // We do this regardless of the other steps to ensure local UI updates
    await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
    console.log("[Invoice Debug] Local DB updated to PAID.");

    // C. SYNC 1: Mark Shopify Order as Paid
    if (invoice.orderId) {
        console.log(`[Invoice Debug] Attempting to mark Order ${invoice.orderId} as Paid...`);
        try {
            const response = await admin.graphql(
                `#graphql
                mutation markOrderPaid($id: ID!) {
                    orderMarkAsPaid(input: {id: $id}) {
                        userErrors { field message }
                    }
                }`,
                { variables: { id: invoice.orderId } }
            );
            const data = await response.json();
            if (data.data?.orderMarkAsPaid?.userErrors?.length > 0) {
                console.error("[Invoice Debug] Shopify Order Error:", data.data.orderMarkAsPaid.userErrors);
            } else {
                console.log("[Invoice Debug] Shopify Order marked as Paid successfully.");
            }
        } catch (e) {
            console.error("[Invoice Debug] Failed to call Shopify Order Mutation:", e);
        }
    } else {
        console.warn("[Invoice Debug] SKIPPING Order Sync: No orderId found on invoice record.");
    }

    // D. SYNC 2: Reduce Customer Debt & Handle Suspension Logic
    if (invoice.customerId && invoice.customerId !== 'unknown') {
        try {
            const rawId = invoice.customerId;
            const customerGid = rawId.startsWith("gid://") ? rawId : `gid://shopify/Customer/${rawId}`;
            console.log(`[Invoice Debug] Attempting to update Wallet & Tags for ${customerGid}...`);
            
            // 1. Fetch current balance AND tags
            const customerResponse = await admin.graphql(
                `#graphql
                query getCustomer($id: ID!) {
                    customer(id: $id) {
                        tags
                        metafield(namespace: "net_terms", key: "outstanding") {
                            value
                        }
                    }
                }`,
                { variables: { id: customerGid } }
            );
            
            const customerData = await customerResponse.json();
            const currentOutstanding = parseInt(customerData.data?.customer?.metafield?.value || "0", 10);
            const currentTags: string[] = customerData.data?.customer?.tags || [];
            
            console.log(`[Invoice Debug] Current Outstanding Balance: ${currentOutstanding}`);
            console.log(`[Invoice Debug] Current Tags: ${currentTags.join(', ')}`);
            
            // 2. Calculate New Balance
            const paidAmountCents = Math.round(invoice.amount * 100);
            const newOutstanding = Math.max(0, currentOutstanding - paidAmountCents);
            console.log(`[Invoice Debug] Paid Amount (Cents): ${paidAmountCents}`);
            console.log(`[Invoice Debug] New Balance Calculation: ${currentOutstanding} - ${paidAmountCents} = ${newOutstanding}`);

            // 3. Prepare Metadata Update
            const mutationProms = [];
            
            // Mutation A: Update Balance
            const metaUpdateStr = `#graphql
                mutation updateOutstanding($id: ID!, $value: String!) {
                    metafieldsSet(metafields: [{
                        ownerId: $id,
                        namespace: "net_terms",
                        key: "outstanding",
                        type: "number_integer",
                        value: $value
                    }]) {
                        userErrors { field message }
                    }
                }`;
            
            mutationProms.push(
                admin.graphql(metaUpdateStr, {
                    variables: { id: customerGid, value: newOutstanding.toString() }
                }).then(r => r.json())
            );

            // 4. CHECK FOR SUSPENSION RESET
            // If the user is currently suspended, check if they have any OTHER overdue invoices.
            // Since we just marked *this* invoice as PAID in step B, we just need to see if any remaining invoices are OVERDUE.
            
            const suspendedTags = currentTags.filter(t => t.endsWith('_Suspended'));
            if (suspendedTags.length > 0) {
                console.log(`[Invoice Debug] Customer is currently suspended (${suspendedTags.join(',')}). Checking for reinstatement...`);
                
                // Query DB for any remaining overdue items (check both ID formats to be safe)
                const rawIdLookup = invoice.customerId.replace("gid://shopify/Customer/", "");
                const gidLookup = `gid://shopify/Customer/${rawIdLookup}`;

                const remainingOverdueCount = await db.invoice.count({
                    where: {
                        customerId: { in: [rawIdLookup, gidLookup] },
                        shop: invoice.shop,
                        status: "OVERDUE"
                    }
                });

                if (remainingOverdueCount === 0) {
                    console.log("[Invoice Debug] No remaining overdue invoices. PROCEEDING WITH REINSTATEMENT.");
                    
                    const tagsToRemove = [...suspendedTags];
                    const tagsToAdd: string[] = [];

                    // Logic: Swap "NetXX_Suspended" -> "NetXX_Approved"
                    if (suspendedTags.includes("Net15_Suspended")) tagsToAdd.push("Net15_Approved");
                    if (suspendedTags.includes("Net30_Suspended")) tagsToAdd.push("Net30_Approved");
                    if (suspendedTags.includes("Net60_Suspended")) tagsToAdd.push("Net60_Approved");

                    const tagMutationStr = `#graphql
                        mutation reinstateTags($id: ID!, $remove: [String!]!, $add: [String!]!) {
                            tagsRemove(id: $id, tags: $remove) {
                                userErrors { field message }
                            }
                            tagsAdd(id: $id, tags: $add) {
                                userErrors { field message }
                            }
                        }`;

                    mutationProms.push(
                        admin.graphql(tagMutationStr, {
                            variables: { id: customerGid, remove: tagsToRemove, add: tagsToAdd }
                        }).then(r => r.json())
                    );
                } else {
                    console.log(`[Invoice Debug] Customer still has ${remainingOverdueCount} overdue invoices. Suspension remains.`);
                }
            }

            // Execute all mutations
            const results = await Promise.all(mutationProms);
            console.log("[Invoice Debug] Sync Operations Complete.", results);

        } catch (e) {
            console.error("[Invoice Debug] Failed to update customer wallet/tags:", e);
        }
    } else {
        console.warn("[Invoice Debug] SKIPPING Wallet Sync: No customerId found on invoice record.");
    }

    return json({ status: "success", refreshed: new Date().toISOString() });
  }
  return json({ status: "error" });
};

// 3. UI COMPONENT (Preserved Layout)
export default function InvoiceDashboard() {
  const { invoices, shop, plan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  // Polling for Auto-Update (every 5 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
        if (document.visibilityState === "visible") {
            revalidator.revalidate();
        }
    }, 5000); 
    return () => clearInterval(interval);
  }, [revalidator]);

  // OPTIMISTIC UI: Check if we are currently submitting a "mark_paid" action
  const pendingId = fetcher.formData?.get("intent") === "mark_paid" ? fetcher.formData.get("invoiceId") : null;

  const isPro = plan === "PRO";
  const resourceName = { singular: "invoice", plural: "invoices" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(invoices as any);

  const formatMoney = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  const getShopifyGlobal = () => {
    // @ts-ignore
    if (typeof shopify !== 'undefined') return shopify;
    // @ts-ignore
    if (window.shopify) return window.shopify;
    return null;
  };

  const downloadInvoice = async (id: string, orderNumber: string) => {
      try {
       const app = getShopifyGlobal();
       if (app && app.idToken) {
         const token = await app.idToken();
         const response = await fetch(`/app/invoice_pdf/${id}`, {
           method: "GET",
           headers: { Authorization: `Bearer ${token}` },
         });
         if (!response.ok) {
             if (response.status === 403) {
                 // @ts-ignore
                 shopify.toast.show("Upgrade to Pro to download PDFs");
                 return; 
             }
             throw new Error("Server rejected download");
         }
         const blob = await response.blob();
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement("a");
         a.href = url;
         a.download = `Invoice-${orderNumber}.pdf`;
         document.body.appendChild(a);
         a.click();
         window.URL.revokeObjectURL(url);
         document.body.removeChild(a);
       } else {
         window.open(`/app/invoice_pdf/${id}?shop=${shop}`, '_blank');
       }
     } catch (error) { console.error("Download Error:", error); }
  };

  const downloadCSV = async () => {
      try {
       const app = getShopifyGlobal();
       if (app && app.idToken) {
         const token = await app.idToken();
         const response = await fetch(`/app/export_csv`, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
         if (!response.ok) {
             if (response.status === 403) {
                 // @ts-ignore
                 shopify.toast.show("Upgrade to Pro to export data");
                 return;
             }
             throw new Error("Server rejected CSV download");
         }
         const blob = await response.blob();
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement("a");
         a.href = url;
         a.download = `Invoices_Export_${new Date().toISOString().split('T')[0]}.csv`;
         document.body.appendChild(a);
         a.click();
         window.URL.revokeObjectURL(url);
         document.body.removeChild(a);
       } else { window.open("/app/export_csv", "_blank"); }
     } catch (error) { console.error("CSV Download Error:", error); }
  };

  const rowMarkup = invoices.map(
    ({ id, orderNumber, customerName, amount, currency, dueDate, status, customerEmail }, index) => {
      // OPTIMISTIC UPDATE: If this row is being marked paid, show it as PAID immediately
      const displayStatus = (pendingId === id) ? "PAID" : status;
      const isPaid = displayStatus === "PAID";
      
      return (
        <IndexTable.Row id={id} key={id} selected={selectedResources.includes(id)} position={index}>
          <IndexTable.Cell><Text variant="bodyMd" fontWeight="bold" as="span">#{orderNumber}</Text></IndexTable.Cell>
          <IndexTable.Cell>
              <div>
                <div style={{fontWeight: 600}}>{customerName}</div>
                <div style={{color: "#616161", fontSize: "0.8em"}}>{customerEmail}</div>
              </div>
          </IndexTable.Cell>
          <IndexTable.Cell>{formatDate(dueDate)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(amount, currency)}</IndexTable.Cell>
          <IndexTable.Cell><Badge tone={isPaid ? "success" : "attention"}>{displayStatus}</Badge></IndexTable.Cell>
          <IndexTable.Cell>
            <div onClick={(e) => e.stopPropagation()}>
                {isPro ? (
                    <Button onClick={() => downloadInvoice(id, orderNumber)} size="micro" icon={ExportIcon} variant="tertiary">PDF</Button>
                ) : (
                    <Tooltip content="Upgrade to Pro to unlock PDF downloads">
                        <Button url="/app/pricing" size="micro" icon={LockIcon} variant="plain" tone="subdued" />
                    </Tooltip>
                )}
            </div>
          </IndexTable.Cell>
          <IndexTable.Cell>
            {!isPaid && (
                <div onClick={(e) => e.stopPropagation()}>
                    <fetcher.Form method="post">
                        <input type="hidden" name="invoiceId" value={id} />
                        <input type="hidden" name="intent" value="mark_paid" />
                        <Button submit size="micro" variant="plain">Mark Paid</Button>
                    </fetcher.Form>
                </div>
            )}
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  return (
    <Page 
      title="Invoices"
      subtitle="Track and manage your Net Terms accounts receivable."
      backAction={{ content: "Dashboard", url: "/app" }}
      primaryAction={{
        content: "Export CSV",
        icon: ExportIcon,
        disabled: !isPro,
        onAction: () => isPro ? downloadCSV() : null 
      }}
    >
      <Layout>
        {!isPro && (
            <Layout.Section>
                <Banner tone="info" title="Unlock Data Portability">
                    <p>Upgrade to the <strong>Pro Plan</strong> to bulk export your invoices to CSV and download branded PDFs.</p>
                </Banner>
            </Layout.Section>
        )}
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={invoices.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Order" }, { title: "Customer" }, { title: "Due Date" }, 
                { title: "Amount" }, { title: "Status" }, { title: "PDF" }, { title: "Action" }
              ]}
            >
              {rowMarkup}
            </IndexTable>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  useIndexResourceState,
  Text,
  Badge,
  Button,
  InlineStack,
} from "@shopify/polaris";
import db from "../db.server";
import { authenticate } from "../shopify.server";

// 1. LOADER
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request); 

  const invoices = await db.invoice.findMany({
    orderBy: { createdAt: "desc" },
  });

  return json({ 
    invoices,
    shop: session.shop 
  });
};

// 2. ACTION
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  
  const invoiceId = formData.get("invoiceId") as string;
  const intent = formData.get("intent");

  if (intent === "mark_paid" && invoiceId) {
    await db.invoice.update({
      where: { id: invoiceId },
      data: { status: "PAID" }
    });
    return json({ status: "success" });
  }

  return json({ status: "error" });
};

// 3. UI COMPONENT
export default function InvoiceDashboard() {
  const { invoices, shop } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const resourceName = {
    singular: "invoice",
    plural: "invoices",
  };

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(invoices as any);

  const formatMoney = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  // --- UPDATED DOWNLOAD FUNCTION ---
  const downloadInvoice = async (id: string, orderNumber: string) => {
    console.log("Attempting download...");

    const getShopifyGlobal = () => {
      // @ts-ignore
      if (typeof shopify !== 'undefined') return shopify;
      // @ts-ignore
      if (window.shopify) return window.shopify;
      // @ts-ignore
      if (globalThis.shopify) return globalThis.shopify;
      return null;
    };

    try {
      const app = getShopifyGlobal();

      // THE FIX: Check for .idToken() directly based on your logs
      if (app && app.idToken) {
        console.log("✅ Found Shopify App Bridge. Fetching token...");
        
        // 1. Get Token (Directly from the root object)
        const token = await app.idToken();
        
        // 2. Fetch Blob
        const response = await fetch(`/app/invoice_pdf/${id}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("Server rejected download");

        // 3. Download
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
        console.warn("⚠️ App Bridge 'idToken' method not found. Using fallback URL.");
        console.log("Object found was:", app);
        // Fallback: This might ask for login, but it's the last resort
        window.open(`/app/invoice_pdf/${id}?shop=${shop}`, '_blank');
      }

    } catch (error) {
      console.error("Download Error:", error);
      window.open(`/app/invoice_pdf/${id}?shop=${shop}`, '_blank');
    }
  };
  // -------------------------------------

  const rowMarkup = invoices.map(
    ({ id, orderNumber, customerName, amount, currency, dueDate, status, customerEmail }, index) => {
      const isPaid = status === "PAID";
      return (
        <IndexTable.Row
          id={id}
          key={id}
          selected={selectedResources.includes(id)}
          position={index}
        >
          <IndexTable.Cell>
            <Text variant="bodyMd" fontWeight="bold" as="span">#{orderNumber}</Text>
          </IndexTable.Cell>
          <IndexTable.Cell>
              <div>{customerName}</div>
              <div style={{color: "#666", fontSize: "0.8em"}}>{customerEmail}</div>
          </IndexTable.Cell>
          <IndexTable.Cell>{formatDate(dueDate)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(amount, currency)}</IndexTable.Cell>
          <IndexTable.Cell>
            <InlineStack align="start" gap="200" blockAlign="center">
                <Badge tone={isPaid ? "success" : "attention"}>{status}</Badge>
                
                {/* PDF Button */}
                <div onClick={(e) => e.stopPropagation()}>
                    <Button 
                        onClick={() => downloadInvoice(id, orderNumber)}
                        size="micro" 
                        icon="export"
                    >
                        PDF
                    </Button>
                </div>

                {/* Mark Paid Button */}
                {!isPaid && (
                    <div onClick={(e) => e.stopPropagation()}>
                        <fetcher.Form method="post">
                            <input type="hidden" name="invoiceId" value={id} />
                            <input type="hidden" name="intent" value="mark_paid" />
                            <Button submit size="micro" variant="plain">Mark Paid</Button>
                        </fetcher.Form>
                    </div>
                )}
            </InlineStack>
          </IndexTable.Cell>
        </IndexTable.Row>
      );
    }
  );

  return (
    <Page 
      title="Accounts Receivable"
      backAction={{ content: "Dashboard", url: "/app" }}
      secondaryActions={[
        { content: "Manage Access", url: "/app/net-terms" },
        { content: "Dashboard", url: "/app" }
      ]}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              resourceName={resourceName}
              itemCount={invoices.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              headings={[
                { title: "Order" }, { title: "Customer" }, { title: "Due Date" }, { title: "Amount" }, { title: "Status" },
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
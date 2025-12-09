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
  Tooltip,
  Banner,
  BlockStack,
} from "@shopify/polaris";
import { LockIcon, ExportIcon } from "@shopify/polaris-icons"; 
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { checkSubscription } from "../billing.server"; 

// LOADER & ACTION (Preserved exactly as provided)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request); 
  const plan = await checkSubscription(request); 
  const invoices = await db.invoice.findMany({ orderBy: { createdAt: "desc" } });
  return json({ invoices, shop: session.shop, plan });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const invoiceId = formData.get("invoiceId") as string;
  const intent = formData.get("intent");
  if (intent === "mark_paid" && invoiceId) {
    await db.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
    return json({ status: "success" });
  }
  return json({ status: "error" });
};

export default function InvoiceDashboard() {
  const { invoices, shop, plan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const isPro = plan === "PRO";
  const resourceName = { singular: "invoice", plural: "invoices" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } = useIndexResourceState(invoices as any);

  // Formatting helpers
  const formatMoney = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString();

  // Download handlers (Logic preserved)
  const getShopifyGlobal = () => {
    // @ts-ignore
    if (typeof shopify !== 'undefined') return shopify;
    // @ts-ignore
    if (window.shopify) return window.shopify;
    return null;
  };

  const downloadInvoice = async (id: string, orderNumber: string) => {
     // ... (Preserved download logic)
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
     // ... (Preserved CSV logic)
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
      const isPaid = status === "PAID";
      return (
        <IndexTable.Row id={id} key={id} selected={selectedResources.includes(id)} position={index}>
          <IndexTable.Cell><Text variant="bodyMd" fontWeight="bold" as="span">#{orderNumber}</Text></IndexTable.Cell>
          <IndexTable.Cell>
              <BlockStack>
                <Text variant="bodyMd" as="span" truncate>{customerName}</Text>
                <Text variant="bodySm" tone="subdued" truncate>{customerEmail}</Text>
              </BlockStack>
          </IndexTable.Cell>
          <IndexTable.Cell>{formatDate(dueDate)}</IndexTable.Cell>
          <IndexTable.Cell>{formatMoney(amount, currency)}</IndexTable.Cell>
          <IndexTable.Cell><Badge tone={isPaid ? "success" : "attention"}>{status}</Badge></IndexTable.Cell>
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
        onAction: () => isPro ? downloadCSV() : null // Logic handled by button state, but retained click check
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
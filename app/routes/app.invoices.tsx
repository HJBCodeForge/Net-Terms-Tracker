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

// 1. LOADER: Fetch invoices
export const loader = async ({ request }: LoaderFunctionArgs) => {
    await authenticate.admin(request);

    const invoices = await db.invoice.findMany({
        orderBy: { createdAt: "desc" },
    });

    return json({ invoices });
};

// 2. ACTION: Handle "Mark Paid"
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
    const { invoices } = useLoaderData<typeof loader>();
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
                        <Text variant="bodyMd" fontWeight="bold" as="span">
                            #{orderNumber}
                        </Text>
                    </IndexTable.Cell>
                    <IndexTable.Cell>
                        <div>{customerName}</div>
                        <div style={{ color: "#666", fontSize: "0.8em" }}>{customerEmail}</div>
                    </IndexTable.Cell>
                    <IndexTable.Cell>{formatDate(dueDate)}</IndexTable.Cell>
                    <IndexTable.Cell>{formatMoney(amount, currency)}</IndexTable.Cell>
                    <IndexTable.Cell>
                        <InlineStack align="start" gap="200" blockAlign="center">
                            <Badge tone={isPaid ? "success" : "attention"}>
                                {status}
                            </Badge>

                            {/* Show "Mark Paid" button only if PENDING */}
                            {!isPaid && (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <fetcher.Form method="post">
                                        <input type="hidden" name="invoiceId" value={id} />
                                        <input type="hidden" name="intent" value="mark_paid" />
                                        <Button submit size="micro" variant="plain">
                                            Mark Paid
                                        </Button>
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
        { 
            content: "Manage Access", url: "/app/net-terms"
        },
        {
            content: "Dashboard", url: "/app"
        }
      ]}
    >
            <Layout>
                <Layout.Section>
                    <Card padding="0">
                        <IndexTable
                            resourceName={resourceName}
                            itemCount={invoices.length}
                            selectedItemsCount={
                                allResourcesSelected ? "All" : selectedResources.length
                            }
                            onSelectionChange={handleSelectionChange}
                            headings={[
                                { title: "Order" },
                                { title: "Customer" },
                                { title: "Due Date" },
                                { title: "Amount" },
                                { title: "Status" },
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
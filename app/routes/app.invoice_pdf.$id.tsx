import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { renderToStream, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// 1. STYLES
const styles = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  label: { fontSize: 10, color: '#666' },
  value: { fontSize: 12, marginBottom: 5 },
  section: { marginTop: 20 },
  tableHeader: { flexDirection: 'row', borderBottom: '1px solid #000', paddingBottom: 5, marginTop: 20 },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #eee', paddingTop: 5, paddingBottom: 5 },
  col1: { width: '50%' },
  col2: { width: '15%', textAlign: 'right' },
  col3: { width: '15%', textAlign: 'right' },
  col4: { width: '20%', textAlign: 'right' },
  totalSection: { marginTop: 20, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: '50%', justifyContent: 'space-between', marginBottom: 5 },
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, textAlign: 'center', fontSize: 10, color: '#999' }
});

// 2. PDF COMPONENT (Safe Version)
const InvoiceDocument = ({ invoice, orderData }: any) => {
  // SAFETY CHECK: Handle cases where Shopify returns null (Order deleted or ID mismatch)
  const lineItems = orderData?.lineItems?.edges || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View>
              <Text style={styles.title}>INVOICE</Text>
              <Text style={styles.value}>#{invoice.orderNumber}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.label}>Date Issued:</Text>
              <Text style={styles.value}>{new Date(invoice.createdAt).toLocaleDateString()}</Text>
              <Text style={styles.label}>Due Date:</Text>
              <Text style={[styles.value, { color: 'red' }]}>{new Date(invoice.dueDate).toLocaleDateString()}</Text>
          </View>
        </View>

        {/* BILL TO */}
        <View style={styles.section}>
          <Text style={styles.label}>Bill To:</Text>
          <Text style={styles.value}>{invoice.customerName}</Text>
          <Text style={styles.value}>{invoice.customerEmail}</Text>
        </View>

        {/* TABLE HEADERS */}
        <View style={styles.tableHeader}>
          <Text style={[styles.label, styles.col1]}>Item</Text>
          <Text style={[styles.label, styles.col2]}>Qty</Text>
          <Text style={[styles.label, styles.col3]}>Price</Text>
          <Text style={[styles.label, styles.col4]}>Total</Text>
        </View>

        {/* LINE ITEMS */}
        {lineItems.length > 0 ? (
            lineItems.map((edge: any, i: number) => {
                const item = edge.node;
                return (
                    <View key={i} style={styles.tableRow}>
                        <Text style={[styles.value, styles.col1]}>{item.title}</Text>
                        <Text style={[styles.value, styles.col2]}>{item.quantity}</Text>
                        <Text style={[styles.value, styles.col3]}>{item.originalUnitPriceSet?.shopMoney?.amount || "0.00"}</Text>
                        <Text style={[styles.value, styles.col4]}>
                            {((parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || "0") * item.quantity).toFixed(2))}
                        </Text>
                    </View>
                );
            })
        ) : (
            <View style={{ marginTop: 10 }}>
                <Text style={styles.label}>Order details not available from Shopify.</Text>
            </View>
        )}

        {/* TOTALS */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
              <Text style={styles.label}>Total Due ({invoice.currency}):</Text>
              <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{invoice.amount.toFixed(2)}</Text>
          </View>
        </View>

        {/* FOOTER */}
        <Text style={styles.footer}>
          Thank you for your business. Please pay via Check or Wire Transfer within 30 days.
        </Text>

      </Page>
    </Document>
  );
};

// 3. LOADER
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const invoiceId = params.id;

  // --- GATING LOGIC ---
  const shopRecord = await db.shop.findUnique({
    where: { shop: session.shop },
  });

  if (shopRecord?.plan !== "PRO") {
    return new Response("Upgrade to Pro Required", { status: 403 });
  }
  // --------------------

  // A. Fetch Invoice
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Response("Not Found", { status: 404 });

  // B. FIX: Ensure Proper GID Format
  // If stored as "12345", convert to "gid://shopify/Order/12345"
  let orderGid = invoice.orderId;
  if (!orderGid.startsWith("gid://")) {
    orderGid = `gid://shopify/Order/${orderGid}`;
  }

  // C. Fetch Line Items
  const response = await admin.graphql(
    `#graphql
    query getOrderDetails($id: ID!) {
      order(id: $id) {
        lineItems(first: 20) {
          edges {
            node {
              title
              quantity
              originalUnitPriceSet {
                shopMoney { amount }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: orderGid } }
  );
  
  const result = await response.json();
  const orderData = result.data?.order || null; // Handle null safely

  // D. Generate Stream
  const stream = await renderToStream(<InvoiceDocument invoice={invoice} orderData={orderData} />);

  return new Response(stream as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.orderNumber}.pdf"`,
    },
  });
};
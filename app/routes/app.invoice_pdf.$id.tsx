import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { renderToStream, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// 1. STYLES FOR THE PDF
const styles = StyleSheet.create({
  page: { padding: 50, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold' },
  label: { fontSize: 10, color: '#666' },
  value: { fontSize: 12, marginBottom: 5 },
  section: { marginTop: 20 },
  tableHeader: { flexDirection: 'row', borderBottom: '1px solid #000', paddingBottom: 5, marginTop: 20 },
  tableRow: { flexDirection: 'row', borderBottom: '1px solid #eee', paddingTop: 5, paddingBottom: 5 },
  col1: { width: '50%' }, // Product Name
  col2: { width: '15%', textAlign: 'right' }, // Qty
  col3: { width: '15%', textAlign: 'right' }, // Price
  col4: { width: '20%', textAlign: 'right' }, // Total
  totalSection: { marginTop: 20, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', width: '50%', justifyContent: 'space-between', marginBottom: 5 },
  footer: { position: 'absolute', bottom: 30, left: 50, right: 50, textAlign: 'center', fontSize: 10, color: '#999' }
});

// 2. THE PDF COMPONENT (The Visual Layout)
const InvoiceDocument = ({ invoice, orderData }: any) => (
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

      {/* LINE ITEMS FROM SHOPIFY */}
      {orderData.lineItems.edges.map((edge: any, i: number) => {
        const item = edge.node;
        return (
            <View key={i} style={styles.tableRow}>
                <Text style={[styles.value, styles.col1]}>{item.title}</Text>
                <Text style={[styles.value, styles.col2]}>{item.quantity}</Text>
                <Text style={[styles.value, styles.col3]}>{item.originalUnitPriceSet.shopMoney.amount}</Text>
                <Text style={[styles.value, styles.col4]}>
                    {(parseFloat(item.originalUnitPriceSet.shopMoney.amount) * item.quantity).toFixed(2)}
                </Text>
            </View>
        );
      })}

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

// 3. THE LOADER (Backend Logic)
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const invoiceId = params.id;

  // A. Fetch Invoice from DB
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Response("Not Found", { status: 404 });

  // B. Fetch Line Items from Shopify (The "Join")
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
    { variables: { id: invoice.orderId } }
  );
  
  const result = await response.json();
  const orderData = result.data.order;

  // C. Generate PDF Stream
  const stream = await renderToStream(<InvoiceDocument invoice={invoice} orderData={orderData} />);

  // D. Return as a PDF File Download
  return new Response(stream as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.orderNumber}.pdf"`,
    },
  });
};
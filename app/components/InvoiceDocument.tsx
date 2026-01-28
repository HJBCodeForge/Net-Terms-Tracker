
import { 
  Document, 
  Page, 
  Text, 
  View, 
  StyleSheet, 
  Image, 
  Font 
} from "@react-pdf/renderer";

// 1. REGISTER PROFESSIONAL FONT (Optional but recommended)
Font.register({
  family: 'Helvetica-Bold',
  src: 'https://fonts.gstatic.com/s/helveticaneue/v70/1Ptsg8zYS_SKggPNyC0IT4ttDfA.ttf' 
});

// 2. DYNAMIC STYLES GENERATOR
// We wrap this in a function so we can pass the user's custom brandColor
const createStyles = (brandColor: string) => StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#333' },
  
  // Header Section
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  logoContainer: { width: 140, height: 60, justifyContent: 'center' },
  logo: { width: '100%', objectFit: 'contain' },
  brandTitle: { fontSize: 20, fontWeight: 'bold', color: brandColor },
  
  // Meta Details (Top Right)
  metaSection: { alignItems: 'flex-end' },
  metaLabel: { fontSize: 8, color: '#888', marginBottom: 2, textTransform: 'uppercase' },
  metaValue: { fontSize: 10, marginBottom: 8, fontWeight: 'bold' },
  statusBadge: { 
    paddingVertical: 4, 
    paddingHorizontal: 8, 
    backgroundColor: '#f4f6f8', 
    borderRadius: 4, 
    fontSize: 9, 
    marginTop: 4 
  },

  // Bill To / From Section
  section: { marginTop: 20, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 },
  billColumn: { width: '45%' },
  billLabel: { fontSize: 8, color: '#999', marginBottom: 4, textTransform: 'uppercase', fontWeight: 'bold' },
  billText: { fontSize: 10, marginBottom: 2, lineHeight: 1.4 },

  // Table
  tableHeader: { 
    flexDirection: 'row', 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee', 
    paddingBottom: 6, 
    marginBottom: 6 
  },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f9f9f9' },
  
  // Columns
  colDesc: { width: '50%' },
  colQty: { width: '10%', textAlign: 'center' },
  colPrice: { width: '20%', textAlign: 'right' },
  colTotal: { width: '20%', textAlign: 'right' },

  // Totals Section
  totalSection: { marginTop: 15, alignItems: 'flex-end' },
  totalRow: { flexDirection: 'row', marginBottom: 4 },
  totalLabel: { width: 100, textAlign: 'right', paddingRight: 10, color: '#666' },
  totalValue: { width: 80, textAlign: 'right' },
  
  grandTotal: { 
    marginTop: 10, 
    paddingTop: 10, 
    borderTopWidth: 2, 
    borderTopColor: brandColor,
    flexDirection: 'row'
  },
  grandTotalValue: { color: brandColor, fontSize: 14, fontWeight: 'bold', width: 80, textAlign: 'right' },
  
  // Footer
  footer: { 
    position: 'absolute', 
    bottom: 30, 
    left: 40, 
    right: 40, 
    textAlign: 'center', 
    fontSize: 8, 
    color: '#aaa',
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    paddingTop: 15
  }
});

// 3. PDF COMPONENT
const InvoiceDocument = ({ invoice, orderData, shopData, settings }: any) => {
  // Use the brand color from DB, or fallback to Shopify Green
  const activeColor = settings?.brandColor || "#008060";
  const styles = createStyles(activeColor);
  
  const lineItems = orderData?.lineItems?.edges || [];
  const currency = invoice.currency || "USD";

  // Helper for formatting currency
  const formatMoney = (val: string | number) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(num || 0);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            {settings?.logoUrl ? (
              <Image src={settings.logoUrl} style={styles.logo} />
            ) : (
              // Fallback to text title if no logo
              <Text style={styles.brandTitle}>{settings?.businessName || shopData.name}</Text>
            )}
          </View>
          <View style={styles.metaSection}>
              <Text style={styles.metaLabel}>Invoice No.</Text>
              <Text style={styles.metaValue}>#{invoice.orderNumber}</Text>
              
              <Text style={styles.metaLabel}>Date Issued</Text>
              <Text style={styles.metaValue}>{new Date(invoice.createdAt).toLocaleDateString()}</Text>
              
              <Text style={styles.metaLabel}>Due Date</Text>
              <Text style={[styles.metaValue, { color: activeColor }]}>
                {new Date(invoice.dueDate).toLocaleDateString()}
              </Text>
          </View>
        </View>

        {/* ADDRESS SECTION */}
        <View style={styles.section}>
          {/* FROM (Merchant) */}
          <View style={styles.billColumn}>
            <Text style={styles.billLabel}>From</Text>
            <Text style={[styles.billText, { fontWeight: 'bold' }]}>
                {settings?.businessName || shopData.name}
            </Text>
            <Text style={styles.billText}>
                {settings?.businessAddress || shopData.shopAddress?.address1 || shopData.billingAddress?.address1 || "Address Not Available"}
            </Text>
            <Text style={styles.billText}>
                {shopData.shopAddress?.city || shopData.billingAddress?.city} {shopData.shopAddress?.zip || shopData.billingAddress?.zip}
            </Text>
            <Text style={styles.billText}>{shopData.email}</Text>
          </View>

          {/* TO (Customer) */}
          <View style={styles.billColumn}>
            <Text style={styles.billLabel}>Bill To</Text>
            <Text style={[styles.billText, { fontWeight: 'bold' }]}>{invoice.customerName}</Text>
            <Text style={styles.billText}>{invoice.customerEmail}</Text>
            <View style={styles.statusBadge}>
                <Text>Status: {invoice.status}</Text>
            </View>
          </View>
        </View>

        {/* TABLE HEADER */}
        <View style={styles.tableHeader}>
          <Text style={[styles.billLabel, styles.colDesc]}>Item Description</Text>
          <Text style={[styles.billLabel, styles.colQty]}>Qty</Text>
          <Text style={[styles.billLabel, styles.colPrice]}>Price</Text>
          <Text style={[styles.billLabel, styles.colTotal]}>Total</Text>
        </View>

        {/* LINE ITEMS (From Your Original Logic) */}
        {lineItems.length > 0 ? (
            lineItems.map((edge: any, i: number) => {
                const item = edge.node;
                const price = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || "0");
                const total = price * item.quantity;
                
                return (
                    <View key={i} style={styles.tableRow}>
                        <Text style={[styles.billText, styles.colDesc]}>{item.title}</Text>
                        <Text style={[styles.billText, styles.colQty]}>{item.quantity}</Text>
                        <Text style={[styles.billText, styles.colPrice]}>{formatMoney(price)}</Text>
                        <Text style={[styles.billText, styles.colTotal]}>{formatMoney(total)}</Text>
                    </View>
                );
            })
        ) : (
            <View style={{ paddingVertical: 20 }}>
                <Text style={{ textAlign: 'center', color: '#999' }}>Order details unavailable</Text>
            </View>
        )}

        {/* TOTALS */}
        <View style={styles.totalSection}>
            <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Subtotal</Text>
                <Text style={styles.totalValue}>{formatMoney(invoice.amount)}</Text>
            </View>
            <View style={styles.grandTotal}>
                <Text style={styles.totalLabel}>Grand Total</Text>
                <Text style={styles.grandTotalValue}>{formatMoney(invoice.amount)}</Text>
            </View>
        </View>

        {/* PAYMENT INSTRUCTIONS & SUPPORT */}
        <View style={{ marginTop: 30, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 20 }}>
            {shopData.metafield?.value ? (
              <View style={{ marginBottom: 20 }}>
                  <Text style={[styles.billLabel, { marginBottom: 8, fontSize: 9 }]}>PAYMENT INSTRUCTIONS</Text>
                  <Text style={styles.billText}>{shopData.metafield.value}</Text>
              </View>
            ) : null}

            <View>
                <Text style={[styles.billLabel, { marginBottom: 8, fontSize: 9 }]}>QUESTIONS?</Text>
                <Text style={styles.billText}>
                    Contact us at {shopData.contactEmail || shopData.email}
                </Text>
            </View>
        </View>

        {/* FOOTER */}
        <View style={styles.footer}>
            <Text>Thank you for your business. Please ensure payment is made by the due date.</Text>
            {/* Branding removed for all users who can access this (PRO) */}
        </View>

      </Page>
    </Document>
  );
};

export default InvoiceDocument;

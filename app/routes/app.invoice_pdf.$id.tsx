import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { 
  renderToStream, 
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
                {settings?.businessAddress || shopData.billingAddress?.address1 || "Address Not Available"}
            </Text>
            <Text style={styles.billText}>
                {shopData.billingAddress?.city} {shopData.billingAddress?.zip}
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

        {/* FOOTER */}
        <View style={styles.footer}>
            <Text>Thank you for your business. Please ensure payment is made by the due date.</Text>
            {/* Branding removed for all users who can access this (PRO) */}
        </View>

      </Page>
    </Document>
  );
};

// 4. LOADER
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const invoiceId = params.id;

  // A. FETCH SETTINGS & CHECK PLAN
  const shopRecord = await db.shop.findUnique({
    where: { shop: session.shop },
  });

  if (shopRecord?.plan !== "PRO") {
    return new Response("Upgrade to Pro Required", { status: 403 });
  }

  // B. FETCH FALLBACK SHOP DATA (From Shopify API)
  const shopifyResponse = await admin.graphql(
    `#graphql
    query {
      shop {
        name
        email
        billingAddress {
          address1
          city
          zip
          country
        }
      }
    }`
  );
  const shopifyJson = await shopifyResponse.json();
  const shopData = shopifyJson.data?.shop || {};

  // B2. FETCH ONLINE STORE BRANDING (THEME OR CHECKOUT BRANDING)
  // If the user hasn't set a custom logo in the app, try to pull it from the Online Store (Checkout Branding or Theme)
  let remoteBrand = { logo: null as string | null, color: null as string | null };
  const currentBrandColor = shopRecord?.brandColor;
  const currentLogo = shopRecord?.logoUrl;

  // Only fetch if fallback is needed
  if (!currentLogo || currentBrandColor === "#008060") {
    try {
        // STRATEGY 1: CHECKOUT BRANDING (Preferred)
        const profilesResp = await admin.graphql(
            `#graphql
            query GetCheckoutProfiles {
                checkoutProfiles(first: 10) {
                    nodes { id isPublished }
                }
            }`
        );
        const profilesJson = await profilesResp.json();
        const publishedProfile = profilesJson.data?.checkoutProfiles?.nodes?.find((p: any) => p.isPublished);

        if (publishedProfile) {
            const brandingResp = await admin.graphql(
                `#graphql
                query GetBrandingDetails($profileId: ID!) {
                  checkoutBranding(checkoutProfileId: $profileId) {
                    customizations {
                      header {
                        logo {
                          image { url }
                        }
                      }
                    }
                    designSystem {
                      colors {
                        global {
                          brand
                          accent
                        }
                      }
                    }
                  }
                }`,
                { variables: { profileId: publishedProfile.id } }
            );
            const brandingJson = await brandingResp.json();
            const branding = brandingJson.data?.checkoutBranding;
            
            if (branding) {
                if (branding.customizations?.header?.logo?.image?.url) {
                    remoteBrand.logo = branding.customizations.header.logo.image.url;
                }
                const colors = branding.designSystem?.colors?.global;
                if (colors?.brand) remoteBrand.color = colors.brand;
                else if (colors?.accent) remoteBrand.color = colors.accent;
            }
        }

        // STRATEGY 2: THEME SETTINGS (Fallback if Checkout Branding missed)
        if (!remoteBrand.logo || !remoteBrand.color) {
            const themeResp = await admin.graphql(
                `#graphql
                query GetThemeMain {
                    themes(roles: [MAIN], first: 1) {
                        nodes { id }
                    }
                }`
            );
            const themeJson = await themeResp.json();
            const mainThemeId = themeJson.data?.themes?.nodes?.[0]?.id;

            if (mainThemeId) {
                const settingsResp = await admin.graphql(
                    `#graphql
                    query GetThemeSettings($id: ID!) {
                      theme(id: $id) {
                        files(filenames: ["config/settings_data.json"]) {
                          nodes {
                            body {
                              ... on OnlineStoreThemeFileBodyText {
                                content
                              }
                            }
                          }
                        }
                      }
                    }`,
                    { variables: { id: mainThemeId } }
                );
                const settingsJson = await settingsResp.json();
                const content = settingsJson.data?.theme?.files?.nodes?.[0]?.body?.content;
                if (content) {
                    const data = JSON.parse(content);
                    const current = data.current || {};
                    
                    // 1. Find Logo in Header Section (if not found in checkout)
                    if (!remoteBrand.logo) {
                        const sections = current.sections || {};
                        const header = Object.values(sections).find((s:any) => s.type === 'header' || s.type?.includes('header')) as any;
                        const logoRef = header?.settings?.logo; 

                        if (logoRef && typeof logoRef === 'string') {
                            // Resolve shopify://shop_images/foo.png
                            const filename = logoRef.split('/').pop();
                            const fileResp = await admin.graphql(
                                `#graphql
                                query GetFileUrl($query: String!) {
                                  files(first: 1, query: $query) {
                                    nodes {
                                      ... on MediaImage { image { url } }
                                      ... on GenericFile { url }
                                    }
                                  }
                                }`,
                                { variables: { query: `filename:${filename}` } }
                            );
                            const fileBody = await fileResp.json();
                            const node = fileBody.data?.files?.nodes?.[0];
                            if (node) {
                                remoteBrand.logo = node.image?.url || node.url;
                            }
                        }
                    }

                    // 2. Find Brand Color (if not found in checkout)
                    if (!remoteBrand.color) {
                        const colorKeys = [
                            'colors_solid_button_background', 
                            'colors_accent_1', 
                            'color_primary', 
                            'colors_text_link'
                        ];
                        for (const k of colorKeys) {
                            if (current[k] && typeof current[k] === 'string' && current[k].startsWith('#')) {
                                remoteBrand.color = current[k];
                                break;
                            }
                        }
                    }
                }
            }
        }
        
        // STRATEGY 3: SHOP METAFIELDS (Brand Namespace fallback)
        // This is where "Settings -> Brand" settings are often stored if not using Checkout Extensibility
        if (!remoteBrand.logo || !remoteBrand.color) { 
             const metaResp = await admin.graphql(
                `#graphql
                query GetShopBrandMetafields {
                  shop {
                    brandLogo: metafield(namespace: "brand", key: "logo") {
                      reference {
                        ... on MediaImage {
                          image { url }
                        }
                      }
                    }
                    brandColors: metafield(namespace: "brand", key: "colors") {
                      value
                    }
                  }
                }`
             );
             const metaJson = await metaResp.json();
             const brandLogoUrl = metaJson.data?.shop?.brandLogo?.reference?.image?.url;
             const brandColorsVal = metaJson.data?.shop?.brandColors?.value;

             if (!remoteBrand.logo && brandLogoUrl) {
                 remoteBrand.logo = brandLogoUrl;
             }
             if (!remoteBrand.color && brandColorsVal) {
                 try {
                     const parsed = JSON.parse(brandColorsVal);
                     // Format usually: { primary: [{background: "..."}], ... }
                     const primary = parsed.primary?.[0]?.background;
                     if (primary) remoteBrand.color = primary;
                 } catch (e) {
                     // ignore parse error
                 }
             }
        }
    } catch (e) {
        console.warn("Could not fetch remote branding assets", e);
    }
  }

  const finalSettings = {
    ...shopRecord,
    logoUrl: shopRecord?.logoUrl || remoteBrand.logo || null,
    brandColor: (shopRecord?.brandColor !== "#008060") ? shopRecord.brandColor : (remoteBrand.color || "#008060")
  };

  // C. FETCH INVOICE
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw new Response("Not Found", { status: 404 });

  // D. FETCH LINE ITEMS (Using your existing logic)
  let orderGid = invoice.orderId;
  if (!orderGid.startsWith("gid://")) {
    orderGid = `gid://shopify/Order/${orderGid}`;
  }

  const orderResponse = await admin.graphql(
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
  
  const orderResult = await orderResponse.json();
  const orderData = orderResult.data?.order || null;

  // E. RENDER
  const stream = await renderToStream(
    <InvoiceDocument 
        invoice={invoice} 
        orderData={orderData} 
        shopData={shopData} 
        settings={finalSettings} 
    />
  );

  return new Response(stream as any, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Invoice-${invoice.orderNumber}.pdf"`,
    },
  });
};
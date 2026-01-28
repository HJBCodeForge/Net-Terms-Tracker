import { type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { renderToStream } from "@react-pdf/renderer";
import InvoiceDocument from "../components/InvoiceDocument";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  // 1. AUTHENTICATE PROXY
  const { admin, session } = await authenticate.public.appProxy(request);

  if (!session || !admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const invoiceId = params.id;
  
  // A. FETCH SETTINGS (No Plan Check)
  const shopRecord = await db.shop.findUnique({
    where: { shop: session.shop },
  });

  // B. FETCH FALLBACK SHOP DATA (From Shopify API)
  const shopifyResponse = await admin.graphql(
    `#graphql
    query {
      shop {
        name
        email
        contactEmail
        billingAddress {
          address1
          city
          zip
          country
        }
        metafield(namespace: "net_terms", key: "payment_instructions") {
          value
        }
      }
    }`
  );
  const shopifyJson = await shopifyResponse.json();
  const shopData = shopifyJson.data?.shop || {};

  // B2. FETCH ONLINE STORE BRANDING (THEME OR CHECKOUT BRANDING)
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

        // STRATEGY 2: THEME SETTINGS (Fallback)
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
                    
                    if (!remoteBrand.logo) {
                        const sections = current.sections || {};
                        const header = Object.values(sections).find((s:any) => s.type === 'header' || s.type?.includes('header')) as any;
                        const logoRef = header?.settings?.logo; 

                        if (logoRef && typeof logoRef === 'string') {
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
        
        // STRATEGY 3: SHOP METAFIELDS
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
                     const primary = parsed.primary?.[0]?.background;
                     if (primary) remoteBrand.color = primary;
                 } catch (e) {
                     // ignore error
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
  // Use orderId to look up invoice if invoiceId param is actually orderId (common confusion), 
  // but let's assume it IS the invoice UUID from our DB.
  // Wait, the Liquid template has `{{ order.id }}`.
  // Order ID is `gid://shopify/Order/12345` or just `12345`.
  // My DB Invoice has `orderId` (string) and `id` (uuid).
  // The user said: "PDF Invoice button for each specific order."
  // The link I planned was `/apps/net-terms/invoice/{{ order.id | split: '/' | last }}`.
  // So the param is the numeric Shopfiy Order ID.
  // BUT `app.invoice_pdf.$id.tsx` expects `params.id` to be the Invoice **UUID**.
  
  // I need to find the invoice by Order ID.
  const orderIdParam = params.id;
  let invoice = await db.invoice.findFirst({
    where: { orderId: { endsWith: orderIdParam } }
  });
  
  // If not found, maybe try to find by orderNumber? No, orderId is better.
  if (!invoice) {
       // If usage via Order ID fails (invoice not created yet request?), return 404
      return new Response("Invoice Not Found", { status: 404 });
  }

  // D. FETCH LINE ITEMS
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

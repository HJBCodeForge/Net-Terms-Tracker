import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  // 1. Gatekeeper: Check Plan
  // We check the DB directly so your "Force Pro" script works
  const shopRecord = await db.shop.findUnique({
    where: { shop: session.shop },
  });

  // If DB says Free/Growth, block the download
  if (shopRecord?.plan !== "PRO") {
    return new Response("Upgrade to Pro Required", { status: 403 });
  }

  // 2. Fetch Data
  const invoices = await db.invoice.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" }
  });

  // 3. Convert to CSV
  const headers = ["Order Number", "Date", "Customer", "Amount", "Status", "Due Date"];
  const csvRows = [headers.join(",")];

  for (const inv of invoices) {
    // Escape quotes to handle names with commas (e.g., "Doe, John")
    const safeName = inv.customerName ? `"${inv.customerName.replace(/"/g, '""')}"` : '""';
    
    const row = [
      inv.orderNumber,
      new Date(inv.createdAt).toISOString().split('T')[0],
      safeName,
      inv.amount,
      inv.status,
      new Date(inv.dueDate).toISOString().split('T')[0]
    ];
    csvRows.push(row.join(","));
  }

  const csvContent = csvRows.join("\n");

  // 4. Return as Download
  return new Response(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="Invoices_Export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
};
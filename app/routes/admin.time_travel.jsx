import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async () => {
  // 1. Find the most recent invoice
  const lastInvoice = await db.invoice.findFirst({
    orderBy: { createdAt: 'desc' }
  });

  if (!lastInvoice) {
    return json({ status: "error", message: "No invoices found in this store." });
  }

  // 2. Set Due Date to 2 days from now (Inside the 3-day automation window)
  const twoDaysFromNow = new Date();
  twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

  await db.invoice.update({
    where: { id: lastInvoice.id },
    data: { dueDate: twoDaysFromNow }
  });

  return json({ 
    status: "success", 
    message: `Time Travel Active! Invoice #${lastInvoice.orderNumber} is now due on ${twoDaysFromNow.toDateString()}. Run the reminder job now.` 
  });
};
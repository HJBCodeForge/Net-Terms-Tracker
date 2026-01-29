import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function sendInvoiceReminder({ to, customerName, invoiceNumber, amount, dueDate, checkoutUrl }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("⚠️ No RESEND_API_KEY set. Email skipped.");
    return;
  }

  try {
    const data = await resend.emails.send({
      from: 'Net Terms App <onboarding@resend.dev>', // Use this for testing. For prod, verify your domain.
      to: [to], // In 'onboarding' mode, this must be YOUR email.
      subject: `Invoice #${invoiceNumber} is Due Soon`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2>Hello ${customerName},</h2>
          <p>This is a friendly reminder that invoice <strong>#${invoiceNumber}</strong> is due on <strong>${new Date(dueDate).toLocaleDateString()}</strong>.</p>
          
          <div style="background: #f4f4f4; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; font-size: 18px;"><strong>Amount Due: ${amount}</strong></p>
          </div>

          <p>Please ensure payment is made by the due date to maintain your Net Terms status.</p>
          
          <a href="${checkoutUrl}" style="background: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Invoice</a>
        </div>
      `,
    });

    console.log(`[Email] Sent reminder to ${to} for Invoice #${invoiceNumber}`);
    return data;
  } catch (error) {
    console.error('[Email] Failed to send:', error);
    return null;
  }
}
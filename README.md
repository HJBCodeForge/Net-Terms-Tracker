# Net Terms Tracker - Shopify B2B App

A full-stack Shopify Application built with **Remix** that automates B2B Net 30 payment terms. This application acts as a financial gatekeeper, an invoicing system, and an automated compliance enforcer for VIP customers.

![Shopify App Architecture](https://encrypted-tbn2.gstatic.com/licensed-image?q=tbn:ANd9GcTxGssNZXCYs0LA_Mei8qwFPHKrQhKRSY9pEwEBFOkBiKDg9E5mLqLacwwo5gzBgjjHE7JyXa9r6pyugLGjeSg-jluhGc6pL7DBT5hIwDGLmaIBUvM)

---

## 🌟 Key Features

### 1. The Gatekeeper & Manager
* **Access Control:** Dynamically controls who sees "Net Terms" at checkout based on the customer tag `Net30_Approved`.
* **Admin Manager:** A dedicated Polaris UI to Approve or Revoke customer access with a single click (uses GraphQL mutations).

### 2. Automated Invoicing (The Tracker)
* **Webhook Listener:** Listens for `orders/create` events in real-time.
* **Logic:** Filters for "Net Terms" orders and automatically calculates a **Net 30 Due Date**.
* **Persistence:** Stores invoice data in a persistent SQLite database.

### 3. Professional PDF Generation
* **Dynamic PDFs:** Generates professional invoices on-demand using `@react-pdf/renderer`.
* **Secure Download:** Uses App Bridge v4 Authentication (`window.shopify.idToken`) to securely download files without login prompts.
* **Line Items:** Fetches live product data (Titles, SKUs, Prices) from Shopify Admin API during generation.

### 4. The Enforcer (Compliance Automation)
* **Overdue Scanner:** A "Compliance Check" system that scans the database for unpaid invoices past their due date.
* **Auto-Revocation:** Automatically removes the `Net30_Approved` tag from customers with overdue debt, preventing future purchases until they pay.
* **Visual Alerts:** Dashboard warnings indicate when enforcement actions have taken place.

---

## 🛠 Tech Stack

* **Framework:** Remix (Node.js)
* **UI Library:** Shopify Polaris & React
* **Database:** SQLite (Production-ready via Docker Volumes)
* **ORM:** Prisma
* **Infrastructure:** Fly.io (Docker Containerization)
* **PDF Engine:** `@react-pdf/renderer`
* **API:** Shopify Admin GraphQL & Webhooks

---

## 🚀 Quick Start (Local Development)

### Prerequisites
* Node.js (v18 or higher)
* Shopify CLI
* A Shopify Partner Account and Development Store

### Installation

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Setup the database:**
    ```bash
    npx prisma migrate dev
    ```

3.  **Start the local server:**
    ```bash
    npm run dev
    ```
    This will trigger the Shopify CLI to create a Cloudflare tunnel and update your App URL automatically.

---

## 🧪 Testing Utilities

This project includes custom scripts to simulate time-based scenarios (like overdue invoices) for testing the "Enforcer" logic.

### Time Travel Script
Forces the most recent invoice to be marked as "Yesterday" (Overdue).
```bash
node prisma/time_travel.js
```

### Reset Script
Resets the most recent invoice back to "Pending" status to re-test logic.
```bash
node prisma/reset_test.js
```

---

## ☁️ Deployment (Fly.io)
This application is optimized for deployment on Fly.io using persistent storage volumes for the SQLite database.

### 1. Configuration (fly.toml)
Ensure your `fly.toml` mounts the volume to preserve data across restarts and sets the correct host binding:

```toml
[mounts]
  source = "data"
  destination = "/data"

[env]
  PORT = "3000"
  HOST = "0.0.0.0"
```

### 2. Secrets
The following secrets must be set in your Fly.io dashboard or via CLI to ensure the app connects to Shopify and the correct database volume:

```bash
flyctl secrets set \
  SHOPIFY_API_KEY="your_client_id" \
  SHOPIFY_API_SECRET="your_client_secret" \
  SCOPES="write_products,read_payment_customizations,write_payment_customizations,read_customers,write_customers,read_orders" \
  HOST="0.0.0.0" \
  SHOPIFY_APP_URL="https://your-app-name.fly.dev" \
  DATABASE_URL="file:/data/dev.sqlite"
```

### 3. Deploy Command
To deploy changes (ensuring local DB files aren't uploaded, preventing "Ghost Data"):

```bash
flyctl deploy --no-cache
```

### 4. Post-Deployment
After deploying, ensure you update your Shopify App Configuration (Webhooks & URLs) to point to the new Cloud URL:

```bash
npm run deploy
```

---

## 📂 Project Structure

* `/app/routes`: Contains all UI pages and API endpoints.
    * `app._index.tsx`: The Financial Dashboard.
    * `app.net-terms.tsx`: The Customer Manager.
    * `app.invoices.tsx`: The Ledger and PDF download UI.
    * `app.run_compliance.tsx`: The backend logic for "The Enforcer".
    * `webhooks.tsx`: The listener for incoming Shopify orders.
* `/prisma`: Database schema and testing scripts.
* `/app/shopify.server.ts`: Authentication and API setup.

---

## 📚 Resources
* [Shopify App Remix Documentation](https://shopify.dev/docs/api/shopify-app-remix)
* [Fly.io Documentation](https://fly.io/docs/)
* [React PDF](https://react-pdf.org/)
* [Shopify App Bridge v4](https://shopify.dev/docs/api/app-bridge-library)

import type {
  RunInput,
  CartPaymentMethodsTransformRunResult,
} from "../generated/api";

export function run(input: RunInput): CartPaymentMethodsTransformRunResult {
  // WRAP EVERYTHING IN A TRY/CATCH TO PREVENT CRASHES
  try {
    // --- DEBUG LOG START ---
    console.log("[Net Terms] Starting Logic...");

    // 1. Identify the "Net Terms" payment method
    const netTermsMethod = input.paymentMethods.find((method) => {
      const name = method.name.toLowerCase();
      return name.includes("terms") || name.includes("net") || name.includes("wholesale") || name.includes("manual");
    });

    if (!netTermsMethod) {
      console.log("[Net Terms] No target payment method found.");
      return { operations: [] };
    }

    // 2. Check Customer Status
    const customer = input.cart.buyerIdentity?.customer;
    
    // Determine active term
    const isNet15 = customer?.isNet15 ?? false;
    const isNet30 = customer?.isNet30 ?? false;
    const isNet60 = customer?.isNet60 ?? false;
    
    const isApproved = isNet15 || isNet30 || isNet60;

    // RULE 1: If NOT approved, HIDE it
    if (!isApproved) {
      console.log("[Net Terms] Customer not approved. Hiding.");
      return {
        operations: [{
          // REVERTED to 'paymentMethodHide' to match your original working code
          paymentMethodHide: { paymentMethodId: netTermsMethod.id }
        }]
      };
    }

    // Determine Label
    let termLabel = "Net 30 Terms"; // Default
    if (isNet15) termLabel = "Net 15 Terms";
    else if (isNet60) termLabel = "Net 60 Terms";
    
    console.log(`[Net Terms] Renaming method ${netTermsMethod.id} to '${termLabel}'`);

    // 3. THE ENFORCER (Math Logic)
    const limitCents = customer?.credit_limit?.value ? parseInt(customer.credit_limit.value) : 0;
    const outstandingCents = customer?.outstanding?.value ? parseInt(customer.outstanding.value) : 0;
    const availableCents = limitCents - outstandingCents;

    // Get Cart Total
    const cartTotal = parseFloat(input.cart.cost.totalAmount.amount ?? "0");
    const cartTotalCents = Math.round(cartTotal * 100);

    console.log(`[Net Terms] Limit: ${limitCents}, Owed: ${outstandingCents}, Available: ${availableCents}`);
    console.log(`[Net Terms] Cart Total: ${cartTotalCents}`);

    // RULE 2: Block if Broke
    if (cartTotalCents > availableCents) {
      console.log("[Net Terms] BLOCKING: Insufficient funds.");
      return {
        operations: [{
          // REVERTED to 'paymentMethodHide'
          paymentMethodHide: { paymentMethodId: netTermsMethod.id }
        }]
      };
    }

    console.log("[Net Terms] ALLOWING: Sufficient funds.");
    return { 
      operations: [{
        paymentMethodRename: {
          paymentMethodId: netTermsMethod.id,
          name: termLabel
        }
      }] 
    };

  } catch (error) {
    // 4. SAFETY NET: If code crashes, Log it and Allow payment (Fail Open)
    console.error("[Net Terms] CRITICAL CRASH:", error);
    // Return empty operations to keep checkout working
    return { operations: [] };
  }
}
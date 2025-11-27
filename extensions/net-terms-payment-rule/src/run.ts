import type {
  RunInput,
  FunctionRunResult,
} from "../generated/api";

export function run(input: RunInput): FunctionRunResult {
  // We rely on the boolean alias 'isApproved' returned by the GraphQL query (hasAnyTag).
  const isApproved = input.cart.buyerIdentity?.customer?.isApproved ?? false;

  // LOGGING - increment version tag so you can confirm the latest build is deployed.
  console.error("DEBUG [Version 6]: User isApproved:", isApproved);
  console.error("DEBUG [Version 6]: Available methods:", JSON.stringify(input.paymentMethods));

  const netTermsMethod = input.paymentMethods.find((method) => {
    const name = method.name.toLowerCase();
    return name.includes("terms") || name.includes("net") || name.includes("wholesale");
  });

  if (!netTermsMethod) {
    console.error("DEBUG [Version 6]: Net terms method not found.");
    return { operations: [] };
  }

  if (!isApproved) {
    console.error("DEBUG [Version 6]: Hiding method via paymentMethodHide.");
    return {
      operations: [
        {
          // @ts-ignore Shopify API expects paymentMethodHide even though current types lack it.
          paymentMethodHide: {
            paymentMethodId: netTermsMethod.id,
          },
        },
      ],
    };
  }

  console.error("DEBUG [Version 6]: User approved. Leaving methods untouched.");
  return { operations: [] };
}

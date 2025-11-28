import type {
  RunInput,
  CartPaymentMethodsTransformRunResult,
} from "../generated/api";

export function run(input: RunInput): CartPaymentMethodsTransformRunResult {
  // We rely on the boolean alias 'isApproved' returned by the GraphQL query (hasAnyTag).
  const buyerIdentity = input.cart.buyerIdentity;
  const customer = buyerIdentity?.customer;
  const isApproved = customer?.isApproved ?? false;

  const netTermsMethod = input.paymentMethods.find((method) => {
    const name = method.name.toLowerCase();
    return name.includes("terms") || name.includes("net") || name.includes("wholesale");
  });

  if (!netTermsMethod) {
    return { operations: [] };
  }

  if (!isApproved) {
    return {
      operations: [
        {
          paymentMethodHide: {
            paymentMethodId: netTermsMethod.id,
          },
        },
      ],
    };
  }

  return { operations: [] };
}

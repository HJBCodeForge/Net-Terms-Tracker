import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // 1. Query for the Function ID
  const response = await admin.graphql(
    `#graphql
    query {
      shopifyFunctions(first: 25) {
        nodes {
          id
          title
        }
      }
    }`
  );

  const responseJson = await response.json();
  
  // Find the node
  const functionNode = responseJson.data?.shopifyFunctions?.nodes?.find(
    (node: any) => node.title === "net-terms-payment-rule"
  );

  if (!functionNode || !functionNode.id) {
    return json({ 
      status: "error", 
      message: "Could not find the function.",
      data: responseJson 
    });
  }

  // 2. Activate it
  const mutationResponse = await admin.graphql(
    `#graphql
    mutation paymentCustomizationCreate($functionId: String!) {
      paymentCustomizationCreate(paymentCustomization: {
        title: "Net Terms Gatekeeper",
        enabled: true,
        functionId: $functionId
      }) {
        paymentCustomization {
          id
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        functionId: functionNode.id,
      },
    }
  );

  const mutationJson = await mutationResponse.json();

  return json({
    status: "Attempt Completed",
    functionFound: functionNode.id,
    result: mutationJson
  });
};

export default function ActivateRule() {
  const actionData = useLoaderData<typeof loader>();

  return (
    <div style={{ padding: "40px", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
      <h1>Activation Result</h1>
      <hr />
      {JSON.stringify(actionData, null, 2)}
    </div>
  );
}
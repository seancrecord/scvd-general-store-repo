import { buyInputExample, buyInputSchema, buyOutputExample } from "@/lib/bazaar-discovery";
import { SPEC_RETURNS } from "@/store/spec";
import type { SampleEnvelope } from "@/services/sample-artifacts";
import type { MenuItem } from "@/types";

/** Pure discovery data: no environment, network, payment or signing operation. */
export function purchaseExample(item: MenuItem, base: string): SampleEnvelope<unknown> {
  return {
    specimen: true,
    preview_kind: "delivery_outline",
    mark: "DELIVERY OUTLINE",
    what_this_is: "Input/output example: a request and the outer purchase response, with placeholders. The product-specific artifact is described below, not reproduced here.",
    not_signed: "This outline is unsigned and will not verify. Placeholder IDs and signatures are not evidence.",
    not_about_anyone: "No purchase, observation or commissioned work was performed to make this example.",
    of_item: item.id,
    price_of_the_real_thing: `$${item.price_usdc}${item.pricing === "pay_what_it_deserves" ? " minimum" : " fixed"}`,
    buy_url: `${base}/api/buy/${item.id}`,
    sample: {
      full_artifact_provided: false,
      fulfillment: item.fulfillment,
      request: { method: "GET", url: `${base}/api/buy/${item.id}`, arguments: buyInputExample(item), input_schema: buyInputSchema(item) },
      response_outline: buyOutputExample(item),
      deliverable_description: SPEC_RETURNS[item.id] ?? item.description,
      constraints: item.constraints ?? [],
    },
  };
}

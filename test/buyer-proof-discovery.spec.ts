import { expect, it } from "vitest";
import { installBuyerHarness, request, object, tools, type Obj } from "./helpers/buyer-harness";
installBuyerHarness();
it("HTTP and MCP advertise separately verifiable purchased text and human-work evidence", async () => {
  const api = object(await (await request("/openapi.json")).json()), schemas = object(object(api.components).schemas);
  const instant = object(object(schemas.DeliveryEnvelope).properties), queued = object(object(schemas.OrderReceipt).properties);
  const pollOp = object(object(object(api.paths)["/api/order/{order_id}"]).get);
  const pollResponse = object(object(pollOp.responses)["200"]);
  const poll = object(object(object(pollResponse.content)["application/json"]).schema);
  const proofFields = ["signed_payload", "signature", "public_key", "signature_covers"];
  const proof = (schema: unknown) => {
    const shape = object(schema), ref = shape.$ref;
    const resolved = typeof ref === "string" ? object(schemas[ref.split("/").at(-1)!]) : shape;
    expect(Object.keys(object(resolved.properties)).sort()).toEqual([...proofFields].sort());
  };
  proof(instant.purchased_text);
  for (const props of [queued, object(poll.properties)]) { proof(props.commission); proof(props.completion_proof); }
  for (const tool of tools) {
    const members = object(tool.inputSchema.properties.item_id).enum as string[] | undefined;
    const output = object((tool as unknown as Obj).outputSchema), props = object(output.properties);
    if (members?.some(id => ["small_blessing", "daily_fortune"].includes(id))) proof(props.purchased_text);
    if (members?.some(id => ["the_collab", "aura_walk"].includes(id)) || tool.name === "check_order") { proof(props.commission); proof(props.completion_proof); }
  }
});

it("MCP only advertises stock and keeper-absence refusals on shelves that can produce them", async () => {
  const catalog = object(await (await request("/menu.json")).json());
  const menu = catalog.items as Obj[];
  for (const tool of tools) {
    const ids = object(tool.inputSchema.properties.item_id).enum as string[] | undefined;
    if (!ids?.length) continue;
    const members = menu.filter(item => ids.includes(String(item.id)));
    const codes = ((tool as unknown as Obj).errors as Obj[]).map(error => error.code);
    const scarce = members.some(item => item.stocked || item.weekly_inventory !== undefined);
    const human = members.some(item => item.fulfillment === "human_queue");
    expect(codes.includes("sold_out"), tool.name).toBe(scarce);
    expect(codes.includes("shelf_closed"), tool.name).toBe(human);
  }
});

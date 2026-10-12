import { SELF, env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { variantGid } from "@/lib/ucp/ids";
import { ucpCheckoutStore, type StoredCheckout } from "@/services/ucp-checkout-store";
import type { Env } from "@/types";

const BASE = "https://scvd.store";
const PATH = "/ucp/v1/checkout-sessions/{id}/cancel";
type Schema = { required?: string[]; properties?: Record<string, { type: string; enum?: string[] }> };
type Operation = { description: string; parameters: { name: string; in: string; required: boolean }[]; requestBody?: unknown; responses: Record<string, { content: Record<string, { schema: { $ref: string } }> }> };
type Contract = { paths: Record<string, Record<string, Operation>>; components: { schemas: Record<string, Schema> } };

describe("cancellation is discoverable and describes the actual state boundary", () => {
  it("documents the existing cancellation and read operations, with no invented refund endpoint", async () => {
    const doc = await (await SELF.fetch(`${BASE}/openapi.json`)).json<Contract>();
    const op = doc.paths[PATH]?.post;
    expect(op).toBeDefined();
    expect(op!.parameters).toContainEqual(expect.objectContaining({ name: "id", in: "path", required: true }));
    expect(op!.requestBody).toBeUndefined();
    for (const text of ["complete_in_progress", "completed", "canceled", "/rights#refund-policy"]) expect(op!.description).toContain(text);
    expect(Object.keys(op!.responses)).toEqual(expect.arrayContaining(["200", "404", "409"]));
    expect(doc.paths["/ucp/v1/checkout-sessions/{id}"]?.get).toBeDefined();
    expect(doc.paths["/api/refund/{refund_id}"]?.post).toBeUndefined();
  });

  it("checks each documented response against the route, including repeat and refused cancellation", async () => {
    const doc = await (await SELF.fetch(`${BASE}/openapi.json`)).json<Contract>();
    const op = doc.paths[PATH]?.post;
    expect(op).toBeDefined();
    const created = await SELF.fetch(`${BASE}/ucp/v1/checkout-sessions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ line_items: [{ item: { id: variantGid("hello") }, quantity: 1 }] }),
    });
    expect(created.status).toBe(201);
    const { id } = await created.json<{ id: string }>();
    const store = ucpCheckoutStore(env as Env, id);
    for (const [state, status, returned] of [
      ["ready_for_complete", 200, "canceled"], ["canceled", 200, "canceled"],
      ["complete_in_progress", 409, "complete_in_progress"], ["completed", 409, "completed"],
    ] as const) {
      // Seed boundary states without moving money; the public route still
      // decides whether each is cancellable and renders the response.
      await runInDurableObject(store, async (_instance, context) => {
        const checkout = (await context.storage.get<StoredCheckout>("ucp:checkout"))!;
        await context.storage.put("ucp:checkout", { ...checkout, status: state });
      });
      const response = await SELF.fetch(`${BASE}${PATH.replace("{id}", id)}`, { method: "POST" });
      expect(response.status).toBe(status);
      const body = await response.json<Record<string, unknown>>();
      expect(body.status).toBe(returned);
      const ref = op!.responses[String(status)]!.content["application/json"]!.schema.$ref;
      const schema = doc.components.schemas[ref.split("/").at(-1)!]!;
      for (const required of schema.required!) expect(body[required], required).toBeDefined();
      for (const [key, property] of Object.entries(schema.properties!)) {
        if (body[key] === undefined) continue;
        expect(Array.isArray(body[key]) ? "array" : typeof body[key], key).toBe(property.type);
        if (property.enum) expect(property.enum).toContain(body[key]);
      }
    }
    const absent = await SELF.fetch(`${BASE}${PATH.replace("{id}", "chk_absent")}`, { method: "POST" });
    expect(absent.status).toBe(404);
    expect(await absent.json()).toMatchObject({ ucp: { status: "error" }, messages: [{ code: "not_found" }] });
  });

  it("places the cancellation boundary beside the refund policy for human and machine readers", async () => {
    const json = await (await SELF.fetch(`${BASE}/rights`)).json<{ checkout_cancellation?: string }>();
    expect(json.checkout_cancellation).toContain("complete_in_progress");
    const html = await (await SELF.fetch(`${BASE}/rights`, { headers: { Accept: "text/html" } })).text();
    expect(html).toContain('id="checkout-cancellation"');
    expect(html).toContain("/ucp/v1/checkout-sessions/{id}/cancel");
  });
});

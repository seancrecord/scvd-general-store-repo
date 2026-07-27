import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { STORE_CONTACT_EMAIL } from "@/store";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * x402scan's registration check, 2026-07-27: thirty-two endpoints
 * rejected, every one of them a free shelf being probed for a paywall
 * it was never meant to have, plus the one genuinely paid route
 * failing because its path parameter had no value to substitute.
 *
 * The spec has to say which shelves are free. It didn't.
 */
describe("the spec, as a registry reads it", () => {
  it("carries a contact email so ownership can be verified", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;
    const info = body.info;
    expect(isRecord(info)).toBe(true);
    if (!isRecord(info)) return;
    const contact = info.contact;
    expect(isRecord(contact)).toBe(true);
    if (!isRecord(contact)) return;
    expect(contact.email).toBe(STORE_CONTACT_EMAIL);
    // Adding contact must not have cost us the url that was there.
    expect(contact.url).toBe(BASE);
  });

  it("declares every free shelf free, and leaves the paid one probeable", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json();
    if (!isRecord(body) || !isRecord(body.paths)) throw new Error("no paths");

    let free = 0;
    let paid = 0;
    for (const [path, item] of Object.entries(body.paths)) {
      if (!isRecord(item)) continue;
      for (const [method, op] of Object.entries(item)) {
        if (!isRecord(op)) continue;
        const isPaid = "x-payment" in op;
        if (isPaid) {
          paid += 1;
          // A paid route must stay probeable: no security override.
          expect(op.security, `${method} ${path} is paid`).toBeUndefined();
        } else {
          free += 1;
          // "security": [] is how a spec says "no paywall here."
          expect(op.security, `${method} ${path} is free`).toEqual([]);
        }
      }
    }
    // The store is mostly free shelves; that was always the point.
    expect(free).toBeGreaterThan(20);
    expect(paid).toBeGreaterThan(0);
  });

  it("gives the buy route real item ids to substitute, not just prose", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json();
    if (!isRecord(body) || !isRecord(body.paths)) throw new Error("no paths");
    const buy = body.paths["/api/buy/{item_id}"];
    if (!isRecord(buy) || !isRecord(buy.get)) throw new Error("no buy route");
    const params = buy.get.parameters;
    if (!Array.isArray(params)) throw new Error("no parameters");

    const itemId = params.find(
      (param) => isRecord(param) && param.name === "item_id",
    );
    expect(isRecord(itemId)).toBe(true);
    if (!isRecord(itemId)) return;
    expect(itemId.required).toBe(true);
    const schema = itemId.schema;
    expect(isRecord(schema)).toBe(true);
    if (!isRecord(schema)) return;
    // A prober reads the schema, not the description.
    expect(Array.isArray(schema.enum)).toBe(true);
    if (!Array.isArray(schema.enum)) return;
    expect(schema.enum).toContain("hello");
    expect(schema.enum).toContain("small_blessing");
    expect(typeof itemId.example).toBe("string");
  });
});

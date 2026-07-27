import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS, STORE_CONTACT_EMAIL } from "@/store";
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

  it("gives every item its own path instead of one template", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json();
    if (!isRecord(body) || !isRecord(body.paths)) throw new Error("no paths");
    const paths = body.paths;

    // A template is not a resource; a registry probes "{item_id}"
    // literally and gets a 404.
    expect(paths["/api/buy/{item_id}"]).toBeUndefined();
    for (const item of MENU_ITEMS) {
      expect(paths[`/api/buy/${item.id}`], item.id).toBeTruthy();
    }
  });

  it("marks required query parameters required, from the schema the store enforces", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/openapi.json`)
    ).json();
    if (!isRecord(body) || !isRecord(body.paths)) throw new Error("no paths");

    // context_anchor refuses to be bought without a summary. The spec
    // has to say so, or a prober sends nothing and calls us broken.
    const anchor = body.paths["/api/buy/context_anchor"];
    if (!isRecord(anchor) || !isRecord(anchor.get)) throw new Error("no anchor");
    const params = anchor.get.parameters;
    if (!Array.isArray(params)) throw new Error("no parameters");
    const summary = params.find(
      (param) => isRecord(param) && param.name === "summary",
    );
    expect(isRecord(summary)).toBe(true);
    if (!isRecord(summary)) return;
    expect(summary.required).toBe(true);

    // And an optional one stays optional.
    const named = params.find(
      (param) => isRecord(param) && param.name === "agent_name",
    );
    expect(isRecord(named)).toBe(true);
    if (!isRecord(named)) return;
    expect(named.required).toBeUndefined();
  });
});

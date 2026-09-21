import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DOOR_SEAM_DATE, readProtocols } from "@/services/protocol-reading";
import { renderProtocolsPage } from "@/pages/admin/protocols-page";
import { PURCHASE_DOORS } from "@/services/purchase-intent";
import { BUYER_SURFACES } from "@/lib/surfaces";
import { CHECKOUT_STATUSES } from "@/lib/ucp/checkout/state";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const AUTH = {
  Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  Accept: "text/html",
};

/**
 * THE PAGE THAT ANSWERS "WHAT DO WE SPEAK".
 *
 * The office could read MPP in two places, UCP in none and A2A in
 * none, while the store served all of them. This holds the four
 * instruments the page assembles to their separate denominators — the
 * defect it exists to fix is a reader adding them together, so the
 * page must keep saying not to.
 */
describe("the protocols page", () => {
  it("renders every door in the closed list, including the ones with no sales", async () => {
    const html = await (await SELF.fetch(`${BASE}/admin/protocols`, { headers: AUTH })).text();
    for (const door of PURCHASE_DOORS) {
      expect(html, `${door} has no row`).toContain(`<code>${door}</code>`);
    }
    // A door that took no money says so. An absent row would read as
    // "this instrument does not know about that door", which is the
    // state the page was built to end.
    expect(html).toContain("none");
  });

  it("names all six declarable surfaces, off the shared list", async () => {
    const html = await (await SELF.fetch(`${BASE}/admin/protocols`, { headers: AUTH })).text();
    for (const surface of BUYER_SURFACES) {
      expect(html, `${surface} is not named`).toContain(`<code>${surface}</code>`);
    }
  });

  it("refuses to let the sections be added together", async () => {
    const html = await (await SELF.fetch(`${BASE}/admin/protocols`, { headers: AUTH })).text();
    expect(html).toContain("Do not add these sections together");
    // Arrivals are calls, settles are sales, rails are how one sale
    // paid: the reader is told, not trusted to infer it.
    expect(html).toContain("an arrival is a call, a settle is a sale");
  });

  it("states the seam rather than letting an empty row read as a quiet door", async () => {
    const html = await (await SELF.fetch(`${BASE}/admin/protocols`, { headers: AUTH })).text();
    expect(html).toContain(DOOR_SEAM_DATE);
    expect(html).toContain("missing label, never a quiet door");
  });

  it("says the checkout and kit states are unlistable, and why", async () => {
    const reading = await readProtocols(testEnv);
    const notes = reading.notes.join(" ");
    expect(notes).toContain("Durable Object");
    // Derived from the state list, never typed into the prose.
    for (const status of CHECKOUT_STATUSES) {
      expect(notes, `${status} not named`).toContain(status);
    }
  });

  it("names a shelf that failed instead of rendering it as a zero", () => {
    const html = renderProtocolsPage({
      month: "2026-09",
      read_at: "2026-09-21T15:00:00.000Z",
      arrivals: [],
      arrivals_total: 0,
      arrivals_truncated: false,
      till: PURCHASE_DOORS.map((door) => ({ door, settles: 0, networks: {} })),
      till_total: 0,
      operations: null,
      market: null,
      surfaces: [],
      unreadable: ["the porch (who arrived)"],
      notes: ["a note"],
    });
    expect(html).toContain("is therefore not a zero");
    expect(html).toContain("the porch (who arrived)");
  });
});

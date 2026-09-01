import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MENU_ITEMS, getMenuItem } from "@/store/menu";

const BASE = "https://scvd.store";

/**
 * ROADMAP S4 — THE UTILITARIAN PAIR (the keeper's ink, 2026-09-01).
 * The flavorful name stays; a plain subtitle rides beside it on the
 * operator-facing instruments, so a buyer scanning the shelf in their
 * own words finds "seven days of signed daily checks" without first
 * learning what a Conformance Watch is.
 */
const PAIRED = [
  "conformance_watch",
  "standing_watch",
  "service_audit",
  "launch_check",
] as const;

describe("the operator instruments carry a subtitle", () => {
  it("each of the four, in the buyer's words, naming the endpoint", () => {
    for (const id of PAIRED) {
      const item = getMenuItem(id)!;
      expect(item.subtitle, `${id} has no subtitle`).toBeTruthy();
      expect(item.subtitle!.toLowerCase()).toContain("endpoint");
      expect(item.subtitle!.toLowerCase()).toContain("signed");
    }
  });

  it("the novelties do not", () => {
    for (const item of MENU_ITEMS) {
      if (item.price_usdc < 1 && item.id !== "spot_check") {
        expect(item.subtitle, `${item.id} grew a subtitle`).toBeUndefined();
      }
    }
  });
});

describe("the subtitle rides every shelf surface", () => {
  it("menu.json, the item page, the shelf index, the markdown twin and the guide", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as {
      items: Array<Record<string, unknown>>;
    };
    const shelf = await (await SELF.fetch(`${BASE}/menu`, { headers: { Accept: "text/html" } })).text();
    const guide = await (await SELF.fetch(`${BASE}/llms-full.txt`)).text();
    for (const id of PAIRED) {
      const item = getMenuItem(id)!;
      const row = menu.items.find((entry) => entry["id"] === id)!;
      expect(row["subtitle"]).toBe(item.subtitle);
      const page = await (await SELF.fetch(`${BASE}/menu/${id}`, { headers: { Accept: "text/html" } })).text();
      expect(page).toContain(item.subtitle!);
      expect(shelf).toContain(item.subtitle!);
      const md = await (await SELF.fetch(`${BASE}/menu/${id}`, { headers: { Accept: "text/markdown" } })).text();
      expect(md).toContain(`_${item.subtitle}_`);
      expect(guide).toContain(`${item.name} — ${item.subtitle}`);
    }
  });
});

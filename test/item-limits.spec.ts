import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { SAMPLES } from "@/services/sample-artifacts";
import { ARTIFACT_CLASSES, artifactClassForItem } from "@/store/attestation-spec";
import { MENU_ITEMS, getMenuItem } from "@/store/menu";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const HTML = { headers: { Accept: "text/html" } };

function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * ROADMAP N3 — THE SPECIMEN AND THE LIMIT, ON THE ITEM PAGE
 * (2026-09-01). Abstract trust is why humans bounce. The honesty was
 * already computed — every artifact class states what it does not
 * prove, and the free specimens show every field a buyer gets — but
 * neither sat where a buyer decides. Now both do, in the same words
 * as the JSON, and this file is the family guard: if a payload states
 * a limit and an HTML dialect exists, the HTML carries the same words.
 */
describe("every item that mints an artifact class prints the class's limit", () => {
  const classed = MENU_ITEMS.filter((item) => artifactClassForItem(item.id));

  it("covers the flagship five at least", () => {
    for (const id of ["service_audit", "conformance_watch", "standing_watch", "launch_check", "settlement_attestation"]) {
      expect(artifactClassForItem(id), `${id} mints no class`).toBeTruthy();
    }
    expect(classed.length).toBeGreaterThanOrEqual(5);
  });

  it("the family guard: page, JSON and markdown carry the class's exact words", async () => {
    const menu = (await (await SELF.fetch(`${BASE}/menu.json`)).json()) as { items: Array<Record<string, unknown>> };
    for (const item of classed) {
      const cls = artifactClassForItem(item.id)!;
      const row = menu.items.find((entry) => entry["id"] === item.id)!;
      expect(row["attestation_class"], `${item.id} menu.json names no class`).toBe(cls.id);
      expect(row["does_not_prove"], `${item.id} menu.json limit drifted`).toBe(cls.does_not_prove);
      expect(row["signs"]).toBe(cls.signs);
      const page = unescapeHtml(await (await SELF.fetch(`${BASE}/menu/${item.id}`, HTML)).text());
      expect(page, `${item.id} page lacks the limit`).toContain(cls.does_not_prove);
      expect(page).toContain("What the signature covers, and what it does not prove");
      const md = await (await SELF.fetch(`${BASE}/menu/${item.id}`, { headers: { Accept: "text/markdown" } })).text();
      expect(md, `${item.id} markdown lacks the limit`).toContain(cls.does_not_prove);
    }
  });

  it("an item with no class prints no limit it did not earn", async () => {
    const plain = MENU_ITEMS.find((item) => !artifactClassForItem(item.id))!;
    const page = await (await SELF.fetch(`${BASE}/menu/${plain.id}`, HTML)).text();
    expect(page).not.toContain("What the signature covers, and what it does not prove");
  });

  it("every class an item mints is a real class on /attestation", () => {
    const ids = new Set(ARTIFACT_CLASSES.map((entry) => entry.id));
    for (const item of classed) {
      expect(ids.has(artifactClassForItem(item.id)!.id)).toBe(true);
    }
  });
});

describe("the specimen on the page is the JSON, byte for byte", () => {
  it("every specimen, each on its item page, each equal to its JSON", async () => {
    expect(SAMPLES.map((entry) => entry.item).sort()).toEqual(
      ["conformance_watch", "launch_check", "service_audit", "settlement_attestation", "standing_watch", "the_case_file"],
    );
    for (const listing of SAMPLES) {
      const item = getMenuItem(listing.item)!;
      expect(item.sample_url, `${listing.item} has no sample_url`).toBe(`/samples/${listing.slug}.json`);
      const json = (await (await SELF.fetch(`${BASE}${item.sample_url}`)).json()) as Record<string, unknown>;
      expect(json["specimen"]).toBe(true);
      expect(json["of_item"]).toBe(listing.item);
      expect(json["price_of_the_real_thing"]).toBe(`$${item.price_usdc}`);
      const page = await (await SELF.fetch(`${BASE}/menu/${listing.item}`, HTML)).text();
      const match = page.match(new RegExp(`<pre class="menu-desc" data-specimen="${listing.item}"><code>([\\s\\S]*?)</code></pre>`));
      expect(match, `${listing.item} page carries no specimen`).toBeTruthy();
      const onPage = JSON.parse(unescapeHtml(match![1]!)) as Record<string, unknown>;
      expect(onPage).toEqual(json);
      expect(page).toContain("The specimen");
    }
  });

  it("no specimen carries a signature, a key, or an evidence hash, in any row", async () => {
    const forbidden = new Set(["signature", "public_key", "signature_covers", "signature_jcs", "evidence_hash"]);
    for (const listing of SAMPLES) {
      const body = await listing.build(testEnv, 1);
      const found: string[] = [];
      const walk = (node: unknown, path: string): void => {
        if (Array.isArray(node)) return node.forEach((child, i) => walk(child, `${path}[${i}]`));
        if (node && typeof node === "object") {
          for (const [key, value] of Object.entries(node)) {
            if (forbidden.has(key)) found.push(`${path}.${key}`);
            walk(value, `${path}.${key}`);
          }
        }
      };
      walk(body, listing.slug);
      expect(found, `${listing.slug} carries signature material or a hash`).toEqual([]);
      expect(JSON.stringify(body)).toContain(".example");
      expect(body.mark).toBe("SPECIMEN");
    }
  });

  it("the watch specimens show the instrument finding something, and our gaps", async () => {
    const cw = (await (await SELF.fetch(`${BASE}/samples/conformance-watch.json`)).json()) as Record<string, any>;
    expect(cw.sample.complete).toBe(true);
    expect(cw.sample.summary.days_unchecked).toBe(1);
    expect(cw.sample.summary.drift_detected).toBe(true);
    expect(cw.sample.summary.not_ready).toBe(2);
    const nw = (await (await SELF.fetch(`${BASE}/samples/night-watch.json`)).json()) as Record<string, any>;
    expect(nw.sample.summary.hours_unprobed).toBe(4);
    expect(nw.sample.summary.unreachable).toBe(3);
    expect(nw.sample.summary.not_ready).toBe(1);
    expect(nw.sample.summary.ticks_burst_disagreed).toBe(1);
    const sa = (await (await SELF.fetch(`${BASE}/samples/settlement-attestation.json`)).json()) as Record<string, any>;
    expect(sa.sample.status).toBe("SETTLED");
    expect(sa.sample.amount_usdc).toBe(0.005);
    expect(String(sa.sample.scope)).toContain("does not attest that goods or services were delivered");
    const lc = (await (await SELF.fetch(`${BASE}/samples/launch-check.json`)).json()) as Record<string, any>;
    expect(lc.sample.verdict).toBe("settled");
    expect(lc.sample.stages.length).toBe(7);
  });

  it("an unknown specimen name lists the ones that exist", async () => {
    const response = await SELF.fetch(`${BASE}/samples/nope.json`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as { samples: string[] }).samples.length).toBe(SAMPLES.length);
  });
});

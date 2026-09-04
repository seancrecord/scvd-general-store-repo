import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  API_PATHS_BEFORE_RULE_60,
  FEATURES,
  GENERATED_API_FAMILIES_BEFORE_RULE_60,
  ROOMS_BEFORE_RULE_60,
  roomsNeedingAFeature,
} from "@/store/features";
import { ROOMS, SITEMAP_ROOMS } from "@/store/rooms";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";
const HTML = { Accept: "text/html" };
const JSON_ACCEPT = { Accept: "application/json" };

/**
 * HOUSE RULE 60's GUARD. Walks the feature register against the
 * served surfaces: the room earns its page and its schema, the five
 * answers ride its JSON twin, the proposition and the money sentence
 * read identically on the page, the twin and llms.txt, every door is
 * in openapi.json, and every page on the row's list links the room.
 * Then the ratchet: nothing newer than the rule exists without a row.
 *
 * Watched RED before it was trusted (rule 46): with the trade
 * counter's proposition changed on one surface only, 60.2 failed by
 * name; with /developers' entry removed, 60.5 failed by name.
 */

async function text(path: string, headers: Record<string, string>): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers });
  expect(response.status, `${path} answers`).toBe(200);
  return response.text();
}

function jsonLdNodes(page: string): Record<string, unknown>[] {
  const nodes: Record<string, unknown>[] = [];
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(page)) !== null) {
    try {
      const parsed: unknown = JSON.parse(match[1] ?? "");
      if (isRecord(parsed)) nodes.push(parsed);
    } catch {
      // A malformed block is its own failure below.
    }
  }
  return nodes;
}

function escapeLikeThePage(sentence: string): string {
  return sentence
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

describe("the register itself", () => {
  it("has a row for every room newer than the rule, and none for a room that does not exist", () => {
    const missing = roomsNeedingAFeature().filter(
      (path) => !FEATURES.some((feature) => feature.room === path),
    );
    expect(missing, `rooms without a feature row (house rule 60.1): ${missing.join(", ")}`).toEqual([]);
    for (const feature of FEATURES) {
      expect(ROOMS.some((room) => room.path === feature.room), `${feature.id}'s room ${feature.room} is not in ROOMS`).toBe(true);
    }
  });

  it("keeps its frozen lists honest: every frozen room still stands", () => {
    const gone = ROOMS_BEFORE_RULE_60.filter((path) => !ROOMS.some((room) => room.path === path));
    expect(gone, "frozen rooms that no longer exist — remove them from ROOMS_BEFORE_RULE_60").toEqual([]);
  });

  it("carries one plain sentence for the proposition and one for the money, with no quotes to escape", () => {
    for (const feature of FEATURES) {
      for (const sentence of [feature.proposition, feature.for_money, feature.free_first]) {
        expect(sentence.length, `${feature.id}: a sentence`).toBeGreaterThan(40);
        expect(sentence, `${feature.id}: no quotes — the page escapes them and the match dies`).not.toMatch(/["']/);
        expect(sentence.trim().endsWith("."), `${feature.id}: ends like a sentence`).toBe(true);
      }
    }
  });
});

describe.each(FEATURES.map((feature) => [feature.id, feature] as const))(
  "%s, on every surface it owes",
  (_id, feature) => {
    it("60.3 — the room earns its page: title, description, one h1, canonical, WebPage AND a typed node", async () => {
      const page = await text(feature.room, HTML);
      expect(page).toMatch(/<title>[^<]{10,}<\/title>/);
      expect(page).toMatch(/<meta name="description" content="[^"]{50,}"/);
      expect((page.match(/<h1[\s>]/g) ?? []).length, "exactly one h1").toBe(1);
      expect(page).toContain(`<link rel="canonical" href="${BASE}${feature.room}">`);
      const nodes = jsonLdNodes(page);
      const types = nodes.map((node) => String(node["@type"]));
      expect(types, "a WebPage node").toContain("WebPage");
      const typed = types.filter((type) => type !== "WebPage" && type !== "BreadcrumbList");
      expect(typed.length, `a typed schema.org node for what ${feature.id} IS, not only a page (found: ${types.join(", ")})`).toBeGreaterThan(0);
    });

    it("60.2 — the proposition and the money sentence read identically on the page, the twin and llms.txt", async () => {
      const page = await text(feature.room, HTML);
      const twin = await text(feature.room, JSON_ACCEPT);
      const guide = await text("/llms-full.txt", {});
      for (const sentence of [feature.proposition, feature.for_money]) {
        expect(page, `page carries: ${sentence}`).toContain(escapeLikeThePage(sentence));
        expect(twin, `JSON twin carries: ${sentence}`).toContain(JSON.stringify(sentence).slice(1, -1));
        expect(guide, `llms.txt carries: ${sentence}`).toContain(sentence);
      }
    });

    it("60.4 — the five answers ride the JSON twin", async () => {
      const twin: unknown = JSON.parse(await text(feature.room, JSON_ACCEPT));
      expect(isRecord(twin)).toBe(true);
      if (!isRecord(twin)) return;
      for (const key of ["what_this_is", "price", "how_to_call", "errors", "security"]) {
        expect(twin[key], `${feature.room} JSON answers ${key}`).toBeDefined();
      }
    });

    it("60.5 — named where its reader looks: every listed page links the room, every door is in openapi.json, the sitemap and llms.txt carry it", async () => {
      for (const path of feature.named_on) {
        const page = await text(path, HTML);
        expect(page, `${path} links ${feature.room}`).toContain(`href="${feature.room}"`);
      }
      const openapi: unknown = JSON.parse(await text("/openapi.json", {}));
      const paths = isRecord(openapi) && isRecord(openapi["paths"]) ? openapi["paths"] : {};
      for (const door of feature.doors) {
        expect(paths[door], `openapi.json carries ${door}`).toBeDefined();
      }
      expect(SITEMAP_ROOMS.some((room) => room.path === feature.room), "on the sitemap").toBe(true);
      const index = await text("/llms.txt", {});
      expect(index, "llms.txt index names the room").toContain(`${BASE}${feature.room}`);
      const room = ROOMS.find((candidate) => candidate.path === feature.room);
      if (room && room.on_storefront !== false) {
        const front = await text("/", HTML);
        expect(front, "the storefront links the room").toContain(`href="${feature.room}"`);
      }
    });
  },
);

describe("the ratchet on API doors", () => {
  it("every openapi.json path newer than the rule belongs to a feature", async () => {
    const openapi: unknown = JSON.parse(await text("/openapi.json", {}));
    const paths = isRecord(openapi) && isRecord(openapi["paths"]) ? Object.keys(openapi["paths"]) : [];
    const doors = new Set(FEATURES.flatMap((feature) => feature.doors));
    const orphans = paths.filter(
      (path) =>
        !GENERATED_API_FAMILIES_BEFORE_RULE_60.some((family) => path.startsWith(family)) &&
        !API_PATHS_BEFORE_RULE_60.includes(path) &&
        !doors.has(path),
    );
    expect(orphans, `API paths with no feature row (house rule 60.1): ${orphans.join(", ")}`).toEqual([]);
    const stale = API_PATHS_BEFORE_RULE_60.filter((path) => !paths.includes(path));
    expect(stale, "frozen API paths that no longer exist — remove them from API_PATHS_BEFORE_RULE_60").toEqual([]);
  });
});

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * THE FREE INSTRUMENTS, NAMED WHERE THE READER STANDS (2026-09-06).
 *
 * /openapi-tools.json has existed since 2026-09-03: the store's free
 * read-only doors as function-calling definitions, ~13 KB, one worked
 * call each. The atlas, the developers page and the small-context
 * quick start named it. The catalog a planning agent reads, and the
 * x402 document a paying client arrives at, did not — the first
 * pointed only at the ~650 KB contract and the second at no contract
 * at all.
 *
 * Two things are held here, and the second is the one that matters.
 *
 * 1. THE POINTERS EXIST, AND ARE URLS. Not "the string mentions the
 *    path" — resolve the value and the door opens. The first cut of
 *    this change shipped `<url> (explanation)`, which a prose reader
 *    would have coped with and an SDK would have 404'd on. That is
 *    the exact defect this line of work is about, reintroduced by its
 *    own fix.
 *
 * 2. THE POINTER DOES NOT OVERSELL WHAT IT POINTS AT. The tempting
 *    summary — "the same doors, smaller" — is FALSE: no paid door
 *    appears in that document. An agent that believed it would go
 *    looking for the shelf in a file that has no shelf, and conclude
 *    the store sells nothing. So the note must say so, and the shape
 *    of the two documents must actually differ in the way claimed.
 */

const BASE = "https://scvd.store";
const AS_AGENT = { "User-Agent": "small-door-spec/1.0", Accept: "application/json" };

async function json(path: string): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: AS_AGENT });
  expect(response.status, `${path} did not answer`).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

async function bytesOf(path: string): Promise<number> {
  const response = await SELF.fetch(`${BASE}${path}`, { headers: AS_AGENT });
  expect(response.status, `${path} did not answer`).toBe(200);
  return (await response.text()).length;
}

/** A pointer is a URL a client can fetch, and nothing else. */
async function pointerOpens(value: unknown, where: string): Promise<void> {
  const url = String(value ?? "");
  expect(url, `${where} does not name the free instruments at all`).toContain("/openapi-tools.json");
  const response = await SELF.fetch(url, { headers: AS_AGENT });
  expect(response.status, `${where} carries a value that is not a fetchable URL: ${url}`).toBe(200);
}

/**
 * The note has one job: stop a reader concluding this is a cheaper
 * copy of the whole contract. It has to SAY the paid doors are absent
 * and it has to send the reader somewhere for them.
 */
function noteIsHonest(note: unknown, where: string): void {
  const text = String(note ?? "").toLowerCase();
  expect(text, `${where} names the free instruments and says nothing about them`).not.toBe("");
  expect(text, `${where}'s note does not say the doors in it are free`).toContain("free");
  expect(
    text.includes("no paid door") || text.includes("not a smaller copy"),
    `${where}'s note does not warn that the paid doors are absent — a reader can take it for a cheaper catalog: ${text}`,
  ).toBe(true);
}

describe("the free instruments are named where a buyer stands", () => {
  it("is named in the catalog a planning agent reads", async () => {
    const menu = await json("/menu.json");
    const store = menu["store"] as Record<string, unknown>;
    expect(String(store["openapi"])).toContain("/openapi.json");
    await pointerOpens(store["openapi_tools"], "the catalog");
    noteIsHonest(store["openapi_tools_note"], "the catalog");
  });

  it("is named in the x402 document a paying client arrives at", async () => {
    const found = await json("/.well-known/x402");
    await pointerOpens(found["openapi_tools"], "the x402 discovery document");
    noteIsHonest(found["openapi_tools_note"], "the x402 discovery document");
    expect(String(found["openapi"]), "the full contract is still unnamed there").toContain(
      "/openapi.json",
    );
  });

  it("is worth naming: an order of magnitude smaller, measured, not asserted", async () => {
    const [small, full] = await Promise.all([
      bytesOf("/openapi-tools.json"),
      bytesOf("/openapi.json"),
    ]);
    expect(small).toBeLessThan(full / 10);
  });

  /**
   * THE CLAIM THE NOTE MAKES, CHECKED AGAINST THE DOCUMENT.
   *
   * If a paid door ever does appear in the tools list, the note
   * becomes a lie the same deploy, and this fails rather than the
   * store telling buyers something untrue about its own shelf.
   */
  it("really does carry no paid door, which is what the note promises", async () => {
    const tools = await json("/openapi-tools.json");
    const list = tools["tools"] as {
      function?: { name?: string };
      "x-scvd"?: { read_only?: boolean };
    }[];
    expect(Array.isArray(list) && list.length > 0, "the tools list is empty").toBe(true);

    /*
     * The paid tools on the MCP door are named buy_simple,
     * buy_observation and so on — a handful of grouped tools that
     * take an item_id, NOT one tool per shelf item. An earlier draft
     * of this test looked for `buy_<item id>` and could therefore
     * never have matched anything: a guard that passes whatever
     * happens. These two conditions are the ones the derivation
     * actually turns on (webmcpTools drops anything carrying an
     * itemId and anything not marked read-only), so either of them
     * going false is a paid door arriving in a free list.
     */
    const paid = list.filter((tool) => String(tool.function?.name ?? "").startsWith("buy_"));
    expect(paid.map((t) => t.function?.name), "a buy_* tool appears in the free instruments").toEqual(
      [],
    );

    const notReadOnly = list
      .filter((tool) => tool["x-scvd"]?.read_only !== true)
      .map((tool) => tool.function?.name);
    expect(notReadOnly, "a tool here is not marked read-only; free and read-only is the claim").toEqual(
      [],
    );
  });

  it("sends a reader who wants the whole contract somewhere real", async () => {
    const tools = await json("/openapi-tools.json");
    expect(String(tools["openapi"])).toContain("/openapi.json");
  });
});

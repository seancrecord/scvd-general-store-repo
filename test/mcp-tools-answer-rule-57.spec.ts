import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { MCP_REFUSAL_CODES } from "@/store/surface-contract";
import { MENU_ITEMS } from "@/store";
import MCP_SOURCE from "../src/routes/mcp.ts?raw";

const BASE = "https://scvd.store";

/**
 * RULE 57 ON THE MCP TOOL SURFACE — the sweep's last door class.
 *
 * POST /mcp is a third front door beside the HTTP API and the reading
 * rooms, and rule 57 binds "anything on this site". Measured
 * 2026-08-30 before anything was built: all thirteen served tools
 * carried an outputSchema and annotations, and NOT ONE carried an
 * error catalogue or a security block.
 *
 * The wire told the same story twice over. `error.data` was null on
 * every refusal, so "nothing was charged" lived only in the English
 * message — the defect the buy doors carried until the sweep's second
 * stop, unfixed here, and sharper because that commit named this
 * store's own MCP till as a client of those doors. And -32602 was
 * doing four different jobs: a caller could not tell "you asked the
 * wrong shelf" from "your URL was not a URL" without parsing prose.
 *
 * The roster is the SERVED tool list, not a list written here. A tool
 * added tomorrow is held tomorrow.
 */

async function tools(): Promise<Record<string, any>[]> {
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as Record<string, any>;
  return body.result.tools as Record<string, any>[];
}

async function rpc(method: string, params: unknown): Promise<Record<string, any>> {
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return (await response.json()) as Record<string, any>;
}

describe("every served tool answers 57.4 and 57.5", () => {
  it("serves a catalogue at all, or the check is vacuous", async () => {
    expect((await tools()).length).toBeGreaterThan(10);
  });

  it("names what it can refuse, and only what it can", async () => {
    const published = new Set(MCP_REFUSAL_CODES.map((refusal) => refusal.code));
    for (const tool of await tools()) {
      const errors = (tool.errors ?? []) as Record<string, any>[];
      expect(errors.length, `${tool.name} names no error categories`).toBeGreaterThan(1);
      for (const error of errors) {
        expect(published, `${tool.name} invents ${error.code}`).toContain(error.code);
        expect(typeof error.jsonrpc).toBe("number");
        expect(String(error.means).length).toBeGreaterThan(20);
        expect(
          String(error.what_to_do).length,
          `${error.code} on ${tool.name} says what it is and not what to do`,
        ).toBeGreaterThan(30);
      }
      /*
       * A free instrument sells nothing, so the shelf refusals cannot
       * arise on it. Publishing one would tell a client to handle a
       * branch that never fires, which is as misleading as omitting
       * one it will meet.
       */
      const paid = tool.itemId !== undefined || (tool.itemIds ?? []).length > 0;
      const codes = errors.map((error) => String(error.code));
      expect(codes.includes("sold_out"), `${tool.name} free/paid mismatch`).toBe(paid);
      expect(codes).toContain("bad_request");
    }
  });

  it("says what it does in your name, what it stores, and what we hold to", async () => {
    for (const tool of await tools()) {
      const security = tool.security as Record<string, string> | undefined;
      expect(security, `${tool.name} has no security block`).toBeTruthy();
      expect(String(security!.what_this_does_in_your_name).length).toBeGreaterThan(80);
      expect(String(security!.what_it_stores_about_you).length).toBeGreaterThan(60);
      expect(security!.what_we_never_do).toContain("No account");
      expect(security!.standards).toContain("private-first");
      expect(security!.reporting).toContain("security.txt");
      // Never, on any tool, a request for something that could spend.
      expect(security!.what_this_does_in_your_name).toContain(
        "never asks for a credential",
      );
    }
  });

  it("tells a mixed shelf's buyer that the answer depends on the item", async () => {
    /*
     * The first draft concatenated one sentence per class, producing
     * "No request is made to any endpoint of yours" directly followed
     * by "One unauthenticated outbound GET to the endpoint you name".
     * Each true of some item; together a contradiction, aimed at the
     * reader least able to resolve it.
     */
    for (const tool of await tools()) {
      const ids = (tool.itemIds ?? []) as string[];
      const classes = new Set(
        ids
          .map((id) => MENU_ITEMS.find((item) => item.id === id)?.reads)
          .filter(Boolean),
      );
      const sentence = String(tool.security.what_this_does_in_your_name);
      if (classes.size <= 1) continue;
      expect(sentence, `${tool.name} sells ${classes.size} classes and blurs them`).toContain(
        "IT DEPENDS ON THE item_id YOU BUY",
      );
      // And every class names the ids it covers, so a caller can match.
      for (const id of ids) {
        expect(sentence, `${tool.name} never says what ${id} does`).toContain(id);
      }
      // The money warning is derived: present only where a walk is sold.
      const walks = ids.filter(
        (id) => MENU_ITEMS.find((item) => item.id === id)?.reads === "subject_purchase",
      );
      expect(sentence.includes("spends real money")).toBe(walks.length > 0);
    }
  });
});

describe("a refusal on the wire carries the code and the charge", () => {
  beforeAll(() => {
    installFacilitatorMock();
  });

  it("publishes every code the door can send, and sends nothing it did not publish", () => {
    const emitted = new Set(
      [...MCP_SOURCE.matchAll(/rpcRefusal\(\s*id,\s*-?\d+,\s*"([a-z_]+)"/g)].map(
        (match) => match[1]!,
      ),
    );
    // Plus the one branch that picks its code from a ternary.
    if (/sells \? "wrong_shelf" : "unknown_item"/.test(MCP_SOURCE)) {
      emitted.add("wrong_shelf");
      emitted.add("unknown_item");
    }
    expect(emitted.size, "found no refusals in the source — the check is vacuous").toBeGreaterThan(3);
    const published = new Set(MCP_REFUSAL_CODES.map((refusal) => refusal.code));
    expect(
      [...emitted].filter((code) => !published.has(code)),
      "the MCP door sends a code no tool publishes",
    ).toEqual([]);
    expect(
      [...published].filter((code) => !emitted.has(code)),
      "a tool publishes a code the MCP door never sends",
    ).toEqual([]);
  });

  /**
   * THE CHECK THAT CAUGHT THIS FILE'S OWN BLIND SPOT.
   *
   * The first draft verified each CODE was reachable, then proved
   * itself by removing one of the two sites that emit `bad_request`
   * — and passed, because the other site still emitted it and the
   * wire test happened to exercise that one. A guard that cannot see
   * a refusal go bare is not guarding the refusals, it is guarding
   * the vocabulary.
   *
   * So the source is walked instead: every rpcError call site is
   * either rpcRefusal's own, or one of the four named below with the
   * reason it is not a refusal. A new bare rpcError fails here.
   */
  it("routes every refusal through the helper that carries the fields", () => {
    const NOT_REFUSALS: Record<string, string> = {
      "402":
        "the payment challenge itself — not a refusal but the door working, and it already carries the terms in data",
      "-32601": "method not found: a JSON-RPC transport fault, not a shelf decision",
      "-32603": "an internal error; nothing about the caller's request was wrong",
      "-32602 prompts":
        "prompts/list is unsupported at the protocol level, not a purchase refused",
    };
    const bare = [
      ...MCP_SOURCE.matchAll(/return rpcError\(\s*(?:id|null),\s*(-?\d+),\s*(.*)/g),
    ]
      .map((match) => ({ code: match[1]!, tail: match[2]! }))
      .filter((call) => call.code !== "jsonrpc")
      .filter((call) => {
        if (call.code === "-32700") return false; // parse error, same class as -32601
        if (call.code === "-32602" && /prompts/i.test(call.tail)) return false;
        return NOT_REFUSALS[call.code] === undefined;
      });
    expect(
      bare.map((call) => `${call.code} ${call.tail.slice(0, 60)}`),
      "an rpcError that is not one of the named non-refusals must go through rpcRefusal, so it carries a stable code and charged",
    ).toEqual([]);
  });

  it("refuses a malformed tool input with a code and charged: false", async () => {
    const body = await rpc("tools/call", {
      name: "preflight_endpoint",
      arguments: {},
    });
    expect(body.error.code).toBe(-32602);
    expect(body.error.data.code).toBe("bad_request");
    expect(body.error.data.charged).toBe(false);
  });

  it("distinguishes an unknown item from one on another shelf", async () => {
    const unknown = await rpc("tools/call", {
      name: "buy_observation",
      arguments: { item_id: "not_a_real_item" },
    });
    expect(unknown.error.data.code).toBe("unknown_item");
    expect(unknown.error.data.charged).toBe(false);

    // small_blessing is real and sold by a different cluster.
    const elsewhere = await rpc("tools/call", {
      name: "buy_observation",
      arguments: { item_id: "small_blessing" },
    });
    expect(
      elsewhere.error.data.code,
      "an item on another shelf reads the same as one that does not exist",
    ).toBe("wrong_shelf");
  });

  it("refuses bad PURCHASE arguments too, which is a different code path", async () => {
    /*
     * The generic tool-input check and callPurchaseTool's own check
     * are two sites emitting the same code. Removing either used to
     * leave this file green; both are exercised now.
     */
    /*
     * standing_watch is one of the items validatePurchaseArgs checks
     * by name, mirroring the HTTP door's standingWatchCheck: no
     * target, no charge. service_audit takes its url later, so it
     * reaches the challenge instead — which is why the first draft of
     * this test proved nothing.
     */
    const body = await rpc("tools/call", {
      name: "buy_observation",
      arguments: { item_id: "standing_watch", url: "not-a-url-at-all" },
    });
    expect(body.error.data.code).toBe("bad_request");
    expect(body.error.data.charged).toBe(false);
    // The English is unchanged and still served: additive, always.
    expect(String(body.error.message)).toContain("no charge");
  });

  it("names the tool that does not exist", async () => {
    const body = await rpc("tools/call", { name: "buy_a_pony", arguments: {} });
    expect(body.error.data.code).toBe("unknown_tool");
    expect(body.error.data.charged).toBe(false);
  });
});

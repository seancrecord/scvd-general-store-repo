import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { MENU_ITEMS } from "@/store";
import { mcpToolCatalog } from "@/lib/mcp-tools";
/**
 * THE WORKED EXAMPLE, NOT A BARE item_id (2026-09-04). The MCP door
 * refuses a call missing a schema-required argument BEFORE quoting
 * terms — that is how the buyer who paid $5 for a launch check of an
 * empty string stops being possible — so the challenge this spec
 * compares has to come from a call that could actually be fulfilled.
 * Both doors get the same arguments, so the comparison stays
 * like-for-like.
 */
import { buyInputExample } from "@/lib/bazaar-discovery";
import { getMenuItem } from "@/store";

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE MCP DOOR MUST QUOTE WHAT THE HTTP DOOR QUOTES.
 *
 * The keeper, 2026-08-29, on a month of 12,280 MCP handshakes and no
 * purchases: we have been asking agents to LEARN instead of making it
 * as easy as possible for them to pay. This spec is that instruction
 * pointed at the one payload an agent must read before it can spend a
 * cent — the 402 challenge — and it compares the two doors to EACH
 * OTHER rather than to a written-down shape, so the day either one
 * moves, the other has to follow.
 *
 * WHAT IT FOUND WHEN IT WAS FIRST RUN, both live on scvd.store:
 *
 *   The MCP challenge was MOJIBAKE. `decodeChallengeHeader` read the
 *   base64 with atob(), which returns one character per BYTE, so
 *   every non-ASCII character in the offer arrived as its raw UTF-8
 *   bytes: the em-dashes and the ellipsis in the description came out
 *   as "â€"" and "â€¦". The HTTP door's header decodes as clean UTF-8.
 *   Same challenge, same store, garbled on the way to the buyer.
 *
 *   The MCP challenge was MISSING THE SIGNED OFFER. The HTTP door
 *   carries extensions {bazaar, offer-receipt}; MCP carried {bazaar}
 *   alone. offer-receipt is the store COMMITTING to its quoted terms
 *   before money moves — the exact discipline this business sells
 *   other issuers — and the channel we most want to sell through was
 *   the one channel that never got it. The splice lives inside the
 *   HTTP gate's handler and the MCP door calls the payment stack
 *   directly, so it never ran.
 *
 * The second one is a repeat. mcp-payment.ts already carries this
 * note above its preflight: "this door had its own copy of the
 * pipeline and therefore none of the diagnosis... a fix that looks
 * shared and isn't." The preflight got shared. The offer did not.
 */

interface Challenge {
  accepts?: { amount?: string; network?: string }[];
  extensions?: Record<string, unknown>;
  resource?: { description?: string };
}

/** The cheapest item on the menu that any MCP shelf actually sells. */
function cheapestSellableByMcp(): { itemId: string; tool: string } {
  const shelves = mcpToolCatalog(BASE).filter(
    (tool) => tool.itemId || tool.itemIds,
  );
  const reachable = [...MENU_ITEMS]
    .sort((a, b) => a.price_usdc - b.price_usdc)
    .map((item) => ({
      item,
      tool: shelves.find(
        (shelf) =>
          shelf.itemId === item.id || shelf.itemIds?.includes(item.id),
      ),
    }))
    .find((entry) => entry.tool);
  expect(reachable, "no menu item is reachable from any MCP shelf").toBeTruthy();
  return { itemId: reachable!.item.id, tool: reachable!.tool!.name };
}

async function mcpChallenge(
  tool: string,
  itemId: string,
): Promise<Challenge> {
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: tool,
        arguments: { item_id: itemId, ...buyInputExample(getMenuItem(itemId)!) },
      },
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  const error = payload["error"] as Record<string, unknown> | undefined;
  const data = error?.["data"] as Record<string, unknown> | undefined;
  const challenge = data?.["x402/payment-required"];
  expect(
    challenge,
    `no x402 challenge came back from ${tool}/${itemId}: ${JSON.stringify(payload).slice(0, 300)}`,
  ).toBeTruthy();
  return challenge as Challenge;
}

async function httpChallenge(itemId: string): Promise<Challenge> {
  const query = new URLSearchParams(
    Object.entries(buyInputExample(getMenuItem(itemId)!)).map(
      ([key, value]): [string, string] => [key, String(value)],
    ),
  );
  const response = await SELF.fetch(`${BASE}/api/buy/${itemId}?${query}`);
  const header = response.headers.get("PAYMENT-REQUIRED");
  expect(header, `/api/buy/${itemId} served no PAYMENT-REQUIRED`).toBeTruthy();
  /*
   * Decoded the way a correct client decodes it: base64 to BYTES,
   * bytes to UTF-8. This is the decode the MCP door was missing, so
   * doing it here rather than reaching for atob() is deliberate.
   */
  const bytes = Uint8Array.from(atob(header!), (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Challenge;
}

describe("the challenge an MCP buyer reads before paying", () => {
  it("carries text, not raw UTF-8 bytes wearing a string", async () => {
    const { itemId, tool } = cheapestSellableByMcp();
    const description = (await mcpChallenge(tool, itemId)).resource
      ?.description;
    expect(description, "the challenge names no resource").toBeTruthy();
    /*
     * The mojibake signature, derived rather than spelled: a correctly
     * decoded string never contains the lone bytes that a UTF-8
     * sequence read as Latin-1 leaves behind. U+00C2/U+00C3 are the
     * lead bytes of every two- and three-byte sequence in this range,
     * so their presence is the defect itself.
     */
    const mangled = [...description!].filter(
      (ch) => ch === "Â" || ch === "Ã" || ch === "â",
    );
    expect(
      mangled.join(" "),
      `the MCP challenge's description is mojibake: ...${description!.slice(-60)}`,
    ).toBe("");
  });

  it("quotes the same terms and the same commitments as the HTTP door", async () => {
    const { itemId, tool } = cheapestSellableByMcp();
    const [viaMcp, viaHttp] = await Promise.all([
      mcpChallenge(tool, itemId),
      httpChallenge(itemId),
    ]);

    // Same price, same rails. Two doors quoting one shelf.
    expect(viaMcp.accepts?.map((a) => `${a.network}:${a.amount}`)).toEqual(
      viaHttp.accepts?.map((a) => `${a.network}:${a.amount}`),
    );

    /*
     * Derived from the HTTP door rather than from a list typed here:
     * whatever commitments that door makes, this one makes too. A new
     * extension added there and forgotten here fails on the day it
     * ships, which is the only day the fix is cheap.
     */
    expect(
      Object.keys(viaMcp.extensions ?? {}).sort(),
      "the MCP door drops commitments the HTTP door makes",
    ).toEqual(Object.keys(viaHttp.extensions ?? {}).sort());
  });
});

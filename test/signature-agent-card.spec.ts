import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { CLIENT_CAP_USD } from "@/lib/client-spend-cap";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import { performSignatureAgentCard } from "@/services/bot-auth-card";
import { signedDirectory } from "@/lib/web-bot-auth";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * A THIRD ed25519 seed (RFC 8032 TEST 3), distinct from both the
 * artifact key and the store's egress key in vitest.config.ts, so a
 * card that verifies the agent's directory against one of OUR keys
 * by mistake fails instead of passing on a shared key.
 */
const AGENT_SEED =
  "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7";
const AGENT_ORIGIN = "https://agent.example";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * The agent's own valid directory, minted with the same machinery the
 * store serves its own from — signedDirectory signs whatever authority
 * its base URL names, so pointing it at the agent's origin yields a
 * proof-of-possession the battery must accept.
 */
async function agentDirectoryResponse(): Promise<Response> {
  const directory = await signedDirectory({
    WBA_SIGNING_KEY: AGENT_SEED,
    STORE_BASE_URL: AGENT_ORIGIN,
  });
  return new Response(JSON.stringify(directory!.body), {
    status: 200,
    headers: directory!.headers,
  });
}

/** Serve the agent's directory; everything else falls through. */
function stubAgentOrigin(response: () => Promise<Response>): void {
  const inner = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      let origin = "";
      try {
        origin = new URL(url).origin;
      } catch {
        origin = "";
      }
      // Exact origin, never a prefix — the same law as every other
      // fetch stub in this suite.
      if (origin === AGENT_ORIGIN) {
        return response();
      }
      return inner(input as never, init as never);
    },
  );
}

/**
 * THE CALLING CARD — the WBA line's demand test: the Once-Over's
 * shape pointed at an agent's key directory. Testable: the shelf
 * listing, the free refusals before money, proof-of-possession
 * actually verified (and actually failed when tampered), the
 * evidence binding, and the card surviving at its URL.
 */
describe("the calling card", () => {
  it("sits on the shelf under the client ceiling, with url as its one required input", () => {
    const item = MENU_ITEMS.find(
      (entry) => entry.id === "signature_agent_card",
    );
    /*
     * NOT A TYPED PRICE, AND NOT A TAUTOLOGY EITHER — the second draft
     * of this line was `item.price_usdc` against `getMenuItem(...)`,
     * which is the same object compared to itself and passes forever.
     *
     * What is worth asserting is the PROPERTY the reprice bought: this
     * door is reachable by a stock x402 client. It dropped from $2 to
     * $0.99 on 2026-08-28 because @x402/core refuses anything over its
     * default ceiling locally, before signing, and the refusal is
     * invisible to us. Putting it back over that line would make the
     * card unbuyable again without a single test noticing — so the
     * line reads the ceiling, not the price.
     */
    const price = item?.price_usdc ?? Number.POSITIVE_INFINITY;
    expect(
      price,
      "the calling card is back above the stock client's spend ceiling — unbuyable by an unconfigured buyer, and silently so",
    ).toBeLessThanOrEqual(CLIENT_CAP_USD);
    expect(item?.fulfillment).toBe("instant");
    // The free door is named on the listing, and the listing never
    // claims more than the document: no endorsement, no identity.
    expect(item?.description).toContain("/api/bot-auth/check");
    expect(item?.description).toContain("Not an endorsement");
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("url");
  });

  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses a missing url before money, naming the free door", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/signature_agent_card`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("/api/bot-auth/check");
  });

  it("refuses plain http plainly", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/signature_agent_card?url=${encodeURIComponent("http://agent.example")}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("https");
  });

  it("refuses a card on the store's own directory, with the reason", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/signature_agent_card?url=${encodeURIComponent(BASE)}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("vouching for itself");
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/signature_agent_card`);
    expect(response.status).toBe(402);
  });

  it("delivers a signed ready card, evidence bound into the cert, served forever, paid", async () => {
    stubAgentOrigin(agentDirectoryResponse);

    const target = encodeURIComponent(AGENT_ORIGIN);
    const challenge = await SELF.fetch(
      `${BASE}/api/buy/signature_agent_card?url=${target}`,
    );
    expect(challenge.status).toBe(402);
    const headerName = [...challenge.headers.keys()].find(
      (name) => name.toLowerCase() === "payment-required",
    )!;
    const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
      accepts: Array<Record<string, unknown>>;
    };
    const paid = await SELF.fetch(
      `${BASE}/api/buy/signature_agent_card?url=${target}`,
      {
        headers: {
          "PAYMENT-SIGNATURE": buildPaymentSignature(
            required.accepts[0] as never,
          ),
        },
      },
    );
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;

    expect(body.verdict).toBe("directory_ready");
    expect(body.card_id).toMatch(/^sacard_/);
    expect(body.card_url).toBe(`/api/bot-auth-card/${body.card_id}`);
    expect(body.card.subject).toBe(AGENT_ORIGIN);
    expect(body.card.directory_url).toBe(
      `${AGENT_ORIGIN}/.well-known/http-message-signatures-directory`,
    );
    expect(body.card.signature).toBeTruthy();
    expect(body.card.evidence_hash).toBeTruthy();
    expect(body.card.criteria).toBe("signature-agent-directory-v1");
    const pop = body.card.checks.find(
      (check: { name: string }) => check.name === "proof-of-possession",
    );
    // The battery VERIFIED the directory's signature over its own
    // authority against the listed key — not just noted its presence.
    expect(pop?.ok).toBe(true);

    // The certificate's attests field IS the card's evidence hash.
    const verify = (await (
      await SELF.fetch(`${BASE}/api/verify/${body.certificate.cert_id}`)
    ).json()) as Record<string, any>;
    expect(verify.valid).toBe(true);
    expect(verify.certificate.attests).toBe(body.card.evidence_hash);

    // The card URL serves the record with its honest boundaries.
    const report = (await (
      await SELF.fetch(`${BASE}${body.card_url}`)
    ).json()) as Record<string, any>;
    expect(report.card.evidence_hash).toBe(body.card.evidence_hash);
    expect(report.cert_id).toBe(body.certificate.cert_id);
    expect(report.what_this_is_not).toContain("Not an endorsement");

    vi.unstubAllGlobals();
    installFacilitatorMock();
  });
});

describe("the free desk at POST /api/bot-auth/check", () => {
  it("runs the paid battery unsigned and names the signed version", async () => {
    stubAgentOrigin(agentDirectoryResponse);
    const response = await SELF.fetch(`${BASE}/api/bot-auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: AGENT_ORIGIN }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, any>;
    expect(body.verdict).toBe("directory_ready");
    expect(body.criteria).toBe("signature-agent-directory-v1");
    expect(body.signed_version).toContain("/api/buy/signature_agent_card");
    expect(body.what_this_is_not).toContain("Not an endorsement");
    vi.unstubAllGlobals();
    installFacilitatorMock();
  });

  it("catches a directory signed by a key it does not list", async () => {
    // The agent publishes the RIGHT document but signs with the WRONG
    // key: proof-of-possession must fail on verification, not vibes.
    stubAgentOrigin(async () => {
      const honest = await signedDirectory({
        WBA_SIGNING_KEY: AGENT_SEED,
        STORE_BASE_URL: AGENT_ORIGIN,
      });
      const imposter = await signedDirectory({
        // The store's own test egress seed — a different key.
        WBA_SIGNING_KEY:
          "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
        STORE_BASE_URL: AGENT_ORIGIN,
      });
      return new Response(JSON.stringify(honest!.body), {
        status: 200,
        headers: imposter!.headers,
      });
    });
    const response = await SELF.fetch(`${BASE}/api/bot-auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: AGENT_ORIGIN }),
    });
    const body = (await response.json()) as Record<string, any>;
    expect(body.verdict).toBe("not_ready");
    const pop = body.checks.find(
      (check: { name: string }) => check.name === "proof-of-possession",
    );
    expect(pop?.ok).toBe(false);
    expect(pop?.detail).toContain("verifies against none of the listed keys");
    vi.unstubAllGlobals();
    installFacilitatorMock();
  });

  it("refuses a non-JSON body with the shape it wants", async () => {
    const response = await SELF.fetch(`${BASE}/api/bot-auth/check`, {
      method: "POST",
      body: "not json",
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain('{"url"');
  });

  it("refuses to read its own directory and says how to do it yourself", async () => {
    const response = await SELF.fetch(`${BASE}/api/bot-auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: BASE }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain(
      "/.well-known/http-message-signatures-directory",
    );
  });

  it("refuses plain http before any fetch", async () => {
    const response = await SELF.fetch(`${BASE}/api/bot-auth/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "http://agent.example" }),
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error.toLowerCase()).toContain("https");
  });
});

describe("the card's honest boundaries", () => {
  it("signs an unreachable moment as exactly that, never a throw", async () => {
    const card = await performSignatureAgentCard(testEnv, AGENT_ORIGIN, {
      fetch: (async () => {
        throw new Error("connection refused");
      }) as unknown as typeof fetch,
    });
    expect(card.verdict).toBe("unreachable");
    // Still a complete artifact: signed, dated, hashed — the buyer
    // paid for the dated record of the knock, and got it.
    expect(card.signature).toBeTruthy();
    expect(card.evidence_hash).toBeTruthy();
    expect(card.checks[0]?.name).toBe("reachable");
    expect(card.checks[0]?.detail).toContain(
      "does not prove the directory is down",
    );
  });

  it("marks a shaped-wrong directory not_ready with the failing check named", async () => {
    const card = await performSignatureAgentCard(testEnv, AGENT_ORIGIN, {
      fetch: (async () =>
        new Response(JSON.stringify({ keys: [] }), {
          status: 200,
          headers: {
            "Content-Type":
              "application/http-message-signatures-directory+json",
          },
        })) as unknown as typeof fetch,
    });
    expect(card.verdict).toBe("not_ready");
    const jwks = card.checks.find((check) => check.name === "jwks-parses");
    expect(jwks?.ok).toBe(false);
  });
});

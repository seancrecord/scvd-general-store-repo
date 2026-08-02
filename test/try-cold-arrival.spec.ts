import { describe, expect, it, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { Env } from "@/types";

/**
 * THE COLD ARRIVAL: walk /try the way an agent that has never heard of
 * this store walks it, and follow the page's own instructions
 * literally, with nothing brought from outside.
 *
 * The practice counter is the one page whose entire promise is "your
 * client will work against this." Every other surface can afford a
 * stale line — a builder reading this one is at eleven at night with a
 * failing payment client, and a URL that 404s or a step that omits the
 * thing you actually need costs them the evening.
 *
 * WHAT THIS SPEC DOES NOT CHECK, said out loud (AT_SCALE rule 5b): it
 * follows the page against THIS worker, not against the deployed one.
 * A route that exists here and is broken in production would pass. It
 * catches the page describing a store that this code is not — which is
 * the drift that actually happens, since the copy is hand-written and
 * the routes are not.
 */

interface TryPayload {
  cheapest_settlement?: { item_id: string; price_usdc: number; buy: string };
  flow: string[];
  cheap_door: { id: string; buy: string; price_usdc: number }[];
  verification: Record<string, string>;
  mcp: { endpoint: string; free_methods: string[] };
  honest_notes: string[];
  when_you_are_stuck: { buy: string };
  when_your_context_ends: { buy: string };
  mailbox: string;
}

async function arrive(): Promise<TryPayload> {
  const res = await SELF.fetch("https://scvd.store/try", {
    headers: { Accept: "application/json" },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as TryPayload;
}

describe("a cold agent can follow /try without knowing anything else", () => {
  beforeEach(() => {
    installFacilitatorMock();
  });

  /**
   * Every GET the page hands out, fetched. Not a spot check: the whole
   * set, harvested from the payload rather than listed here, so a URL
   * added to the copy tomorrow is covered without anybody remembering
   * to add it below (AT_SCALE rule 1).
   */
  it("resolves every free URL it names", async () => {
    const page = await arrive();
    const urls = new Set<string>();
    for (const [field, value] of Object.entries(page.verification)) {
      // The block mixes URLs with the bare artifact id they point at,
      // and a template ("{cert_id}") is a shape rather than a door.
      if (
        typeof value !== "string" ||
        !value.startsWith("http") ||
        value.includes("{")
      ) {
        continue;
      }
      // The sample artifact is a LIVE cert minted in production; this
      // worker's KV has never seen it, so a 404 here is a fact about
      // the test fixture and not about the store. Whether the real one
      // still resolves is the registrar's round's job — it runs against
      // production on a schedule and alerts, which is the only place
      // that question can honestly be asked.
      if (field === "sample_verify_url") {
        continue;
      }
      urls.add(value);
    }
    const broken: string[] = [];
    for (const url of urls) {
      const res = await SELF.fetch(url);
      if (res.status >= 400) {
        broken.push(`${url} → ${res.status}`);
      }
    }
    expect(
      broken,
      "the practice counter points a builder at a door that does not open",
    ).toEqual([]);
  });

  it("offers a cheapest settlement that takes no arguments", async () => {
    // The distinction the route already documents: the cheapest ITEM
    // needs a tx_hash, so recommending it would hand a builder who
    // wants to exercise the payment path a homework problem first.
    const page = await arrive();
    expect(page.cheapest_settlement).toBeDefined();
    const res = await SELF.fetch(page.cheapest_settlement!.buy);
    expect(
      res.status,
      "the recommended first buy did not answer 402 — either it needs an argument the page did not mention, or it is not for sale",
    ).toBe(402);
  });

  /**
   * Step 2 of the flow makes four specific claims about the 402. Each
   * one is a thing a client author will code against before ever
   * seeing a response, so each one is checked against a real response.
   */
  it("answers the 402 exactly as step 2 describes it", async () => {
    const page = await arrive();
    const res = await SELF.fetch(page.cheapest_settlement!.buy);
    expect(res.status).toBe(402);

    const header = res.headers.get("PAYMENT-REQUIRED");
    expect(header, "step 2 promises terms on the PAYMENT-REQUIRED header").toBeTruthy();
    const terms = JSON.parse(atob(header!)) as {
      accepts: { scheme: string; network: string; asset?: string }[];
    };
    expect(terms.accepts.length).toBeGreaterThan(0);
    expect(terms.accepts[0]?.scheme).toBe("exact");
    expect(terms.accepts[0]?.network).toBe("eip155:8453");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body["spec"], "step 2 promises the item's spec in the body").toBeDefined();
    const verification = body["verification"] as Record<string, unknown>;
    expect(
      verification?.["key_fingerprint"],
      "step 2 promises the signing key in the body, so a client needs no second round trip",
    ).toBeTruthy();
  });

  /**
   * The page's fourth reason to practice here is "every purchase ends
   * in a signed artifact with a stable URL, so your test has something
   * to assert on besides a 200." That is a claim about the VERIFY
   * PATH, which this worker can be held to: mint one, ask the URL
   * template the page published, and read the verdict back.
   */
  it("hands back an artifact that verifies at the URL template it published", async () => {
    const page = await arrive();
    const { mintCertificate } = await import("@/services/certificates");
    const minted = await mintCertificate(env as unknown as Env, {
      itemId: "hello",
    });
    const url = page.verification["verify_url_template"]!.replace(
      "{cert_id}",
      minted.certificate.cert_id,
    );
    const res = await SELF.fetch(url);
    expect(res.status).toBe(200);
    const verdict = (await res.json()) as { valid?: boolean };
    expect(
      verdict.valid,
      "a freshly minted artifact does not verify at the template this page hands to builders",
    ).toBe(true);
  });

  it("keeps tools/list free on the MCP endpoint it advertises", async () => {
    const page = await arrive();
    const res = await SELF.fetch(page.mcp.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    expect(
      res.status,
      "the page says tools/list is free and unauthenticated",
    ).toBe(200);
  });

  /**
   * THE FINDING THIS SPEC WAS WRITTEN FOR.
   *
   * /try is the page where somebody writes a retry loop pointed at a
   * real till with real money in it. Its honest section carried a
   * paragraph for exactly that accident — "if a test spends money you
   * didn't mean to spend, write to the mailbox" — while the mechanism
   * that PREVENTS it went unmentioned on this page alone.
   *
   * Offering a human refund in place of a guard we already ship is the
   * wrong order. The guard belongs beside the flow, before the loop is
   * written; the mailbox stays for what the guard cannot catch.
   */
  it("names the double-charge guard on the page where retry loops are written", async () => {
    const page = await arrive();
    const prose = JSON.stringify(page);
    expect(prose).toContain("Idempotency-Key");
    expect(prose).toContain("suggested_key");
  });

  /**
   * AT_SCALE rule 5b on the honest section: a published account of how
   * this store fails must state the failure that costs a buyer money,
   * not only the clean one.
   *
   * "A payment that fails to settle mints nothing" is true and is the
   * EASY case — nobody is out anything. The case worth naming is the
   * one the delivery audit and the chain walk exist for: settlement
   * succeeded and delivery did not.
   */
  it("admits the failure that costs a buyer money, not only the clean one", async () => {
    const page = await arrive();
    const honest = page.honest_notes.join(" ");
    expect(honest).toContain("settled and nothing came back");
    expect(honest.toLowerCase()).toContain("/corrections");
    // AND it must not sell that loop as self-driving. The first
    // version of this copy said findings are "published at
    // /corrections and refunded"; /corrections is a hand-written list
    // and both audits only raise an alert. A buyer deciding whether to
    // trust the safety net needs to know which half is which.
    //
    // The second version said so using the word "automatic", and
    // test/claim-chain.spec.ts caught it: that guard fails any
    // readable surface with "automatic" within 140 characters of
    // "refund", and it exists because this store once published an
    // auto-refund promise it could not keep. The guard could not tell
    // my disclaimer from the defect, and the right move was to reword
    // rather than widen the guard.
    expect(honest).toContain("FINDING IT IS MACHINERY, WRITING IT UP IS A PERSON");
  });
});

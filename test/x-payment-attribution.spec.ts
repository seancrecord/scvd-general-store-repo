import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { metricsMonth } from "@/lib/metrics";
import {
  SETTLEMENT_UNKNOWN_PREFIX,
  listSettlementUnknowns,
} from "@/services/settlement-unknown";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import type { FacilitatorMockState } from "./helpers/facilitator-mock";
import {
  buildPaymentSignature,
  decodePaymentRequired,
} from "./helpers/payment";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE DIALECT SHIM FIXED ACCEPTANCE AND NOTHING ABOVE IT (task #50).
 *
 * DialectTolerantAdapter (payment-gate.ts) let a v1-dialect client
 * settle under X-PAYMENT — the fix Cairn's cold walk paid half a cent
 * to earn. But the GATE around that adapter went on reading only
 * `PAYMENT-SIGNATURE`, in nine places, so an X-PAYMENT buyer now takes
 * the door and loses everything the door is supposed to learn about
 * them:
 *
 *   - the local preflight never runs, so a malformed envelope gets the
 *     facilitator's truncated union-type error instead of the named
 *     field this store built the preflight to give;
 *   - the payer is never read off the envelope, so a settle whose
 *     facilitator response omits the payer books with NO payer — and
 *     the house-vs-organic flag is decided by wallet;
 *   - the ambiguous-settle rescue and Machine 1's row get no envelope,
 *     so there is no nonce and no payer to ask the chain with. An
 *     X-PAYMENT buyer whose settle dies in transport gets no rescue,
 *     and their settlement_unknown row can never be resolved by
 *     anything.
 *
 * That last one is the sharp end: the two machines built to make
 * 2026-08-07 impossible are blind to a dialect this store already
 * accepts.
 *
 * THE SAME CORRECTION APPLIES TO THIS SPEC AS TO THE BUG. On
 * 2026-08-26 the store read call sites and mistook them for
 * behaviour. So every assertion below drives a REAL request under the
 * old header name and reads what the store actually recorded.
 */

let facilitator: FacilitatorMockState;
beforeAll(() => {
  facilitator = installFacilitatorMock();
});

function nonceHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function envelopeFor(path: string): Promise<string> {
  const challenge = await SELF.fetch(`${BASE}${path}`);
  expect(challenge.status).toBe(402);
  const accepted = decodePaymentRequired(challenge).accepts[0];
  if (!accepted) throw new Error("no tier offered");
  return buildPaymentSignature(accepted, nonceHex());
}

/** A valid envelope with one definitively-wrong field, re-encoded. */
function corrupt(envelope: string): string {
  const payload = JSON.parse(atob(envelope)) as Record<string, any>;
  payload.payload.signature = "not-hex-at-all";
  return btoa(JSON.stringify(payload));
}

describe("the local preflight reaches the older dialect too", () => {
  it("names the wrong field for an X-PAYMENT client, as it does for v2", async () => {
    const path = "/api/buy/hello";
    const declined = await SELF.fetch(`${BASE}${path}`, {
      headers: { "X-PAYMENT": corrupt(await envelopeFor(path)) },
    });
    expect(declined.status).toBe(402);
    const body = (await declined.json()) as Record<string, any>;
    expect(
      body.payment_declined?.reason,
      "an X-PAYMENT client got no local diagnosis — the preflight never ran",
    ).toContain("local:preflight:");
    expect(body.payment_declined.message).toContain("payload.signature");
  });

  it("still names it for a PAYMENT-SIGNATURE client, so neither name is fixed by breaking the other", async () => {
    const path = "/api/buy/hello";
    const declined = await SELF.fetch(`${BASE}${path}`, {
      headers: { "PAYMENT-SIGNATURE": corrupt(await envelopeFor(path)) },
    });
    expect(declined.status).toBe(402);
    const body = (await declined.json()) as Record<string, any>;
    expect(body.payment_declined?.reason).toContain("local:preflight:");
  });
});

describe("payer attribution survives the older dialect", () => {
  /**
   * The facilitator is made to answer WITHOUT a payer — a shape real
   * settles have arrived in, which is why the `nopayer` counter
   * exists. That leaves the envelope as the only place the payer can
   * come from, which is exactly the read this task is about.
   */
  async function settleWithoutFacilitatorPayer(
    header: "X-PAYMENT" | "PAYMENT-SIGNATURE",
  ): Promise<number> {
    const path = "/api/buy/hello";
    const key = KV_KEYS.metric(metricsMonth(), "nopayer", "hello");
    const before = Number((await testEnv.COUNTERS.get(key)) ?? "0");
    facilitator.settleOmitsPayer = true;
    try {
      const paid = await SELF.fetch(`${BASE}${path}`, {
        headers: { [header]: await envelopeFor(path) },
      });
      expect(paid.status).toBe(200);
    } finally {
      facilitator.settleOmitsPayer = false;
    }
    return Number((await testEnv.COUNTERS.get(key)) ?? "0") - before;
  }

  it("books an X-PAYMENT settle WITH its payer, not as payerless", async () => {
    expect(
      await settleWithoutFacilitatorPayer("X-PAYMENT"),
      "the payer was on the envelope and the till did not look — the house flag is decided by wallet",
    ).toBe(0);
  });

  it("books a PAYMENT-SIGNATURE settle with its payer, unchanged", async () => {
    expect(await settleWithoutFacilitatorPayer("PAYMENT-SIGNATURE")).toBe(0);
  });
});

describe("the chain machines can ask about an X-PAYMENT buyer", () => {
  /** Both instruments dark: the transport dies and the RPC dies too. */
  function chainDark(): void {
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
        if (origin === "https://mainnet.base.org") {
          return new Response("bad gateway", { status: 502 });
        }
        return inner(input as never, init as never);
      },
    );
  }

  async function clearRows(): Promise<void> {
    const listed = await testEnv.COUNTERS.list({
      prefix: SETTLEMENT_UNKNOWN_PREFIX,
    });
    for (const k of listed.keys) await testEnv.COUNTERS.delete(k.name);
  }

  it("writes a settlement_unknown row carrying the join keys the resolver needs", async () => {
    await clearRows();
    chainDark();
    const path = "/api/buy/small_blessing";
    const envelope = await envelopeFor(path);
    facilitator.settleTransient502s = 2;
    const declined = await SELF.fetch(`${BASE}${path}`, {
      headers: { "X-PAYMENT": envelope },
    });
    expect(declined.status).toBe(402);

    const { rows } = await listSettlementUnknowns(testEnv);
    expect(rows).toHaveLength(1);
    const row = rows[0]!.row;
    // Without these the hourly resolver has nothing to ask the chain,
    // and the row can only ever age out unresolved.
    expect(
      row.nonce,
      "an X-PAYMENT buyer's ambiguous settle was recorded with no nonce — unresolvable forever",
    ).toMatch(/^0x[0-9a-f]{64}$/);
    expect(row.payer).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(row.valid_before).toBeGreaterThan(0);
  }, 30_000);
});

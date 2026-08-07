import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { MENU_ITEMS } from "@/store";
import { buyInputSchema } from "@/lib/bazaar-discovery";
import {
  canonicalizeConformancePass,
  readConformanceWatch,
  startConformanceWatch,
  sweepConformanceWatches,
} from "@/services/conformance-watch";
import { verifyMessageSignature } from "@/lib/signing";
import type { Env } from "@/types";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature } from "./helpers/payment";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/** A target that answers a well-formed x402 v2 challenge. */
function wellFormed402(): Response {
  const challenge = {
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "5000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0x1111111111111111111111111111111111111111",
      },
    ],
  };
  return new Response(JSON.stringify({ error: "payment required" }), {
    status: 402,
    headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
  });
}

/** Route probes of the watched host to an answerer; the rest falls through. */
function answerTarget(answer: () => Response): void {
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
      // Exact origin, never a prefix — the CodeQL lesson, kept.
      if (origin === "https://merchant.example") {
        return answer();
      }
      return inner(input as never, init as never);
    },
  );
}

/**
 * THE CONFORMANCE WATCH — the Night Watch's shape pointed at drift,
 * under the 23a carve-out as codified. What is testable: the free
 * refusals, the daily pacing (a doubled tick must not double-bill the
 * day), each pass signed alone and verifiable, drift as recomputable
 * arithmetic, and the gaps counted against us.
 */
describe("the conformance watch", () => {
  it("sits on the shelf at $5 with url as its one required input", () => {
    const item = MENU_ITEMS.find((entry) => entry.id === "conformance_watch");
    expect(item?.price_usdc).toBe(5);
    expect(item?.fulfillment).toBe("instant");
    // Bounded and prepaid, said on the listing (the 23a carve-out).
    expect(item?.description).toContain("seven days");
    expect(item?.description.toLowerCase()).toContain("renews only if you buy");
    const schema = buyInputSchema(item!);
    expect(schema.required).toContain("url");
  });

  const buying = { "PAYMENT-SIGNATURE": "not-a-real-signature" };

  it("refuses a missing url before any money is asked for", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/conformance_watch`, {
      headers: buying,
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("No target, no charge");
  });

  it("refuses to watch the store itself, with the reason", async () => {
    const response = await SELF.fetch(
      `${BASE}/api/buy/conformance_watch?url=${encodeURIComponent(`${BASE}/api/buy/hello`)}`,
      { headers: buying },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("vouching for itself");
  });

  it("answers a bare probe with a price — the probe rule", async () => {
    const response = await SELF.fetch(`${BASE}/api/buy/conformance_watch`);
    expect(response.status).toBe(402);
  });

  it("sells a week that starts on the next rounds, paid", async () => {
    const target = encodeURIComponent("https://merchant.example/api/buy/thing");
    const challenge = await SELF.fetch(
      `${BASE}/api/buy/conformance_watch?url=${target}`,
    );
    expect(challenge.status).toBe(402);
    const headerName = [...challenge.headers.keys()].find(
      (name) => name.toLowerCase() === "payment-required",
    )!;
    const required = JSON.parse(atob(challenge.headers.get(headerName)!)) as {
      accepts: Array<Record<string, unknown>>;
    };
    const paid = await SELF.fetch(
      `${BASE}/api/buy/conformance_watch?url=${target}`,
      {
        headers: {
          "PAYMENT-SIGNATURE": buildPaymentSignature(required.accepts[0] as never),
        },
      },
    );
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as Record<string, any>;
    expect(body.watch_id).toMatch(/^cwatch_/);
    expect(body.history_url).toContain(`/api/conformance-watch/${body.watch_id}`);

    // The history is readable immediately, empty and honest.
    const history = (await (
      await SELF.fetch(`${BASE}/api/conformance-watch/${body.watch_id}`)
    ).json()) as Record<string, any>;
    expect(history.summary.passes_recorded).toBe(0);
    expect(history.complete).toBe(false);
    expect(history.what_this_is_not).toContain("not uptime");
  });
});

describe("the watch's week, swept", () => {
  it("passes once per sweep day, signs each day alone, and refuses to double-bill a doubled tick", async () => {
    answerTarget(wellFormed402);
    const { record } = await startConformanceWatch(
      testEnv,
      "https://merchant.example/api/buy/thing",
    );

    const first = await sweepConformanceWatches(testEnv);
    expect(first).toBeGreaterThanOrEqual(1);
    // The doubled cron tick: same day, no second pass for this watch.
    await sweepConformanceWatches(testEnv);
    const history = await readConformanceWatch(testEnv, record.watch_id);
    expect(history?.passes[0]?.verdict).toBe("ready");
    const passesForWatch = history?.passes.length ?? 0;
    expect(passesForWatch).toBe(1);

    // The day's page verifies alone, against the declared canonical
    // form — the artifact contract the namespace spec publishes.
    const pass = history!.passes[0]!;
    const verified = await verifyMessageSignature(
      canonicalizeConformancePass(record.watch_id, record.url, pass),
      pass.signature,
      pass.public_key,
    );
    expect(verified).toBe(true);
  });

  it("derives drift from the signed rows when the readout changes mid-week", async () => {
    answerTarget(wellFormed402);
    const { record } = await startConformanceWatch(
      testEnv,
      "https://merchant.example/api/buy/thing",
    );
    await sweepConformanceWatches(testEnv);

    // The deploy that breaks the door: day two answers 200, the
    // "listed but functionally absent" shape. Backdate day one so the
    // sweep sees a stale pass and takes day two.
    const stored = await testEnv.ORDERS.get<Record<string, any>>(
      `cwatch:${record.watch_id}`,
      "json",
    );
    stored!.passes[0].at = new Date(Date.now() - 24 * 3600_000).toISOString();
    await testEnv.ORDERS.put(`cwatch:${record.watch_id}`, JSON.stringify(stored));

    answerTarget(() => new Response("ok", { status: 200 }));
    await sweepConformanceWatches(testEnv);

    const history = await readConformanceWatch(testEnv, record.watch_id);
    expect(history?.summary.passes_recorded).toBe(2);
    expect(history?.passes[1]?.verdict).toBe("not_ready");
    expect(history?.passes[1]?.failed).toContain("status-402");
    // The week's story, as arithmetic: the readout changed.
    expect(history?.summary.drift_detected).toBe(true);
  });

  it("counts the days WE missed against us, and ends terminal", async () => {
    const { record } = await startConformanceWatch(
      testEnv,
      "https://merchant.example/api/buy/thing",
    );
    // Rewind the whole watch so it started nine days ago and ended two
    // days ago, with no passes ever recorded: seven unchecked days.
    const stored = await testEnv.ORDERS.get<Record<string, any>>(
      `cwatch:${record.watch_id}`,
      "json",
    );
    stored!.started_at = new Date(Date.now() - 9 * 24 * 3600_000).toISOString();
    stored!.ends_at = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    await testEnv.ORDERS.put(`cwatch:${record.watch_id}`, JSON.stringify(stored));

    // An ended watch is left exactly as it finished — the sweep must
    // not touch it (bounded means bounded).
    answerTarget(wellFormed402);
    await sweepConformanceWatches(testEnv);

    const history = await readConformanceWatch(testEnv, record.watch_id);
    expect(history?.complete).toBe(true);
    expect(history?.summary.passes_recorded).toBe(0);
    expect(history?.summary.days_unchecked).toBe(7);
  });
});

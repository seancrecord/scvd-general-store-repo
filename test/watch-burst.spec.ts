import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BURST_PROBES,
  canonicalizeProbe,
  startWatch,
} from "@/services/standing-watch";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE INTRA-TICK BURST (ledger B5; the keeper's ruling 2026-08-28,
 * "yes paid" — paid watches only).
 *
 * Until today every observation was one GET on a predictable phase,
 * so a door that answers two ways could never be caught disagreeing
 * with itself: there was never a second look inside the tick to
 * disagree with.
 *
 * The load-bearing test is the disagreement one. The rest guard the
 * things a burst could quietly break — the verdict's meaning (this
 * series has always been "what one probe at the top of the hour
 * saw"), the signature covering the new field, and a budget that
 * says when it bound instead of downgrading in silence.
 */

const WATCH_URL = "https://burst.example/api/buy/thing";

function challenge(): string {
  return btoa(
    JSON.stringify({
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x0000000000000000000000000000000000000001",
          amount: "5000",
        },
      ],
    }),
  );
}

/** Answers each successive probe from the given script. */
function stubDoor(script: ("ready" | "dead")[]): { calls: () => number } {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown) => {
      const url = String(input);
      if (!url.startsWith("https://burst.example")) {
        return new Response("{}", { status: 200 });
      }
      const answer = script[Math.min(call, script.length - 1)]!;
      call += 1;
      if (answer === "dead") {
        return new Response("nope", { status: 500 });
      }
      return new Response("{}", {
        status: 402,
        headers: { "PAYMENT-REQUIRED": challenge() },
      });
    }),
  );
  return { calls: () => call };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Drive one tick through the real sweep and hand back its row. */
async function oneTick(script: ("ready" | "dead")[]) {
  const door = stubDoor(script);
  const { record } = await startWatch(testEnv, WATCH_URL, "0xtestpayer");
  const { sweepStandingWatches, readWatch } = await import(
    "@/services/standing-watch"
  );
  await sweepStandingWatches(testEnv);
  const history = await readWatch(testEnv, record.watch_id);
  return { history, door };
}

describe("the burst catches what one look never could", () => {
  it("a door answering two ways inside one tick is recorded as DISAGREEING", async () => {
    // Ready on the first look, dead on the next two: exactly the flap
    // 168 single probes a week would have published as a clean hour.
    const { history } = await oneTick(["ready", "dead", "dead"]);
    const probe = history!.probes[0]!;
    expect(probe.burst, "the tick took no burst").toBeTruthy();
    expect(probe.burst!.length).toBe(BURST_PROBES);
    expect(probe.burst_agreed).toBe(false);
    expect(history!.summary.ticks_burst).toBe(1);
    expect(history!.summary.ticks_burst_disagreed).toBe(1);
  });

  it("a door answering the same way three times agrees, and says so", async () => {
    const { history } = await oneTick(["ready", "ready", "ready"]);
    const probe = history!.probes[0]!;
    expect(probe.burst_agreed).toBe(true);
    expect(history!.summary.ticks_burst).toBe(1);
    expect(history!.summary.ticks_burst_disagreed).toBe(0);
  });

  it("the VERDICT still means what it always meant: the first probe", async () => {
    /*
     * The frozen-series law. This row's verdict has meant "what one
     * probe at the top of the hour saw" for the life of the product;
     * a burst that quietly redefined it would break every stored
     * row's comparability. The disagreement is published BESIDE the
     * verdict, never folded into it.
     */
    const { history } = await oneTick(["ready", "dead", "dead"]);
    const probe = history!.probes[0]!;
    expect(probe.verdict).toBe("ready");
    expect(probe.burst![0]!.verdict).toBe("ready");
    /*
     * not_ready, NOT unreachable: a 500 is a door that answered and
     * served the wrong status. The distinction is the one this store
     * refuses to blur anywhere else, and the burst inherits it by
     * running the same battery rather than a cheaper guess.
     */
    expect(probe.burst!.slice(1).every((p) => p.verdict === "not_ready")).toBe(
      true,
    );
    expect(probe.burst!.slice(1).every((p) => p.status === 500)).toBe(true);
  });

  it("the burst rides INSIDE the signature, not beside it", async () => {
    /*
     * A disagreement a buyer can show somebody has to be as
     * un-editable as the verdict it qualifies. The recipe published
     * in how_to_verify must reproduce the exact signed bytes.
     */
    const { history } = await oneTick(["ready", "dead", "dead"]);
    const probe = history!.probes[0]!;
    const preimage = canonicalizeProbe(history!.watch_id, history!.url, probe);
    expect(preimage).toContain('"burst"');
    expect(preimage).toContain('"burst_agreed":false');
    // And the published recipe names the field, in its order.
    expect(history!.how_to_verify).toContain("burst");
  });

  it("takes three looks, not one — the cost is real and paid for", async () => {
    const { door } = await oneTick(["ready", "ready", "ready"]);
    expect(door.calls()).toBe(BURST_PROBES);
  });
});

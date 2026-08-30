import { SELF } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BATTERY_ADDS,
  PREFLIGHT_VERSION,
  PREFLIGHT_VERSIONS,
  PREFLIGHT_VERSION_NEXT,
  PREFLIGHT_V2_SINCE,
  runChecks,
} from "@/services/preflight";

/**
 * TWO BATTERIES, AND THE OLD ONE KEPT RUNNING.
 *
 * v1 reported the Solana rail-receivability read as an advisory, which
 * meant a door whose payTo owns no token account for the mint it asked
 * for — a door literally nobody can pay — was still called `ready`.
 * Wrong on the merits, and the published vocabulary at /defects says so.
 *
 * The fix is NOT to change v1. An observatory's most valuable asset is
 * a comparable series: if the battery moves under the same name, a
 * `ready` recorded in week 34 stops meaning what a `ready` recorded in
 * week 36 means, and six weeks of hash-chained rounds quietly lose the
 * property that made them worth keeping. Every artifact this store has
 * signed names the criteria it was rendered under; renaming those
 * retroactively would make a signature cover a claim nobody made.
 *
 * So both run through an overlap — what an observatory does when it
 * upgrades an instrument, so the records join up. These tests defend
 * the two properties that make the overlap honest: v1 NEVER MOVES, and
 * one probe scores both.
 */

/**
 * THE v1 STRUCTURAL BATTERY, BY NAME.
 *
 * Frozen deliberately. v1 has not changed since July and must not:
 * every artifact this store signed under v1 names the criteria it was
 * rendered under, so a `ready` recorded today has to mean what one
 * recorded in week 34 meant. Adding a name here is the same act as
 * changing what those artifacts said, which is what v2 exists for.
 *
 * These are the checks a well-formed 402 exercises. runChecks emits a
 * subset on a malformed response (it stops where it cannot proceed),
 * so the assertion is subset-plus-no-strangers rather than equality.
 */
const V1_CHECK_NAMES = [
  "status-402",
  "payment-required-header",
  "x402-version",
  "accepts",
] as const;

/** A 402 well-formed enough to run the whole structural battery. */
function wellFormed402(): Response {
  return new Response("{}", {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": btoa(
        JSON.stringify({
          x402Version: 2,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:8453",
              amount: "10000",
              asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
              payTo: "0x1111111111111111111111111111111111111111",
            },
          ],
        }),
      ),
    },
  });
}


describe("v1 is frozen, which is the whole point", () => {
  it("adds nothing to the battery that has been running since July", () => {
    /*
     * THE LOAD-BEARING ASSERTION. The day this list is non-empty, every
     * verdict v1 ever rendered means something different from what it
     * meant when it was signed. If a future change needs a new check,
     * it needs a new VERSION — that is what v2 is for.
     */
    expect(BATTERY_ADDS[PREFLIGHT_VERSION]).toEqual([]);

    /*
     * AND THE NOTE IS NOT THE BATTERY — found 2026-08-25.
     *
     * The line above compares a hand-typed [] in BATTERY_ADDS against
     * a hand-typed []. It tests the NOTE about v1, not v1: nothing
     * here derived anything from runChecks(), which is what actually
     * decides a v1 verdict.
     *
     * Proven: pushing an always-ok check into runChecks left this
     * file AND preflight.spec.ts green at 26 passed — a check v1
     * never had, silently deciding what every signed `ready` since
     * July means. (An ok:false addition is caught elsewhere; an
     * always-green one was not, and that is the realistic shape.)
     *
     * So pin the membership itself. A new check in the v1 battery now
     * fails here by name, which is the moment to ask whether it wants
     * to be v3 instead.
     */
    const v1 = runChecks(wellFormed402(), false);
    const ran = v1.checks.map((check) => check.name);
    const strangers = ran.filter(
      (name) => !(V1_CHECK_NAMES as readonly string[]).includes(name),
    );
    expect(
      strangers,
      "a check v1 never had is now deciding v1 verdicts — it belongs in a new version, not this one",
    ).toEqual([]);
    // And the battery has not quietly emptied out either.
    expect(ran.length).toBe(V1_CHECK_NAMES.length);
  });

  it("keeps the structural battery synchronous and offline", () => {
    // runChecks() is what CI aims at the store's own 402 on every
    // build. A battery that needs the network cannot prove we live
    // under our own law, so the network read stays outside it.
    const response = new Response("{}", { status: 200 });
    const ran = runChecks(response, false);
    expect(ran.checks.length).toBeGreaterThan(0);
    expect(ran.checks.every((check) => typeof check.ok === "boolean")).toBe(true);
  });

  it("serves the unversioned door under v1, so existing callers stay comparable", async () => {
    const res = await SELF.fetch("https://scvd.store/api/preflight");
    const body = (await res.json()) as { version: string };
    expect(body.version).toBe(PREFLIGHT_VERSION);
  });
});

describe("v2 exists, is served, and says what it added", () => {
  it("serves a document for every battery, each naming itself", async () => {
    for (const battery of PREFLIGHT_VERSIONS) {
      const res = await SELF.fetch(
        `https://scvd.store/api/preflight/${battery}`,
      );
      expect(res.status, battery).toBe(200);
      const body = (await res.json()) as {
        version: string;
        batteries: { served: string[]; this_one: string; v2_adds: string[] };
      };
      expect(body.version).toBe(battery);
      expect(body.batteries.this_one).toBe(battery);
      // Every document lists every battery, so a reader landing on the
      // old one is never unaware a newer reading exists.
      expect(body.batteries.served).toEqual([...PREFLIGHT_VERSIONS]);
    }
  });

  it("names exactly what v2 folds into the verdict, from the code that folds it", async () => {
    const res = await SELF.fetch(
      `https://scvd.store/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
    );
    const body = (await res.json()) as {
      batteries: { v2_adds: string[]; v2_series_begins: string };
    };
    // Derived, not typed: the criteria page cannot drift from the code.
    expect(body.batteries.v2_adds).toEqual([
      ...BATTERY_ADDS[PREFLIGHT_VERSION_NEXT],
    ]);
    expect(body.batteries.v2_adds).toContain("solana-rail-receivable");
    // A series with no stated start is not a series.
    expect(body.batteries.v2_series_begins).toBe(PREFLIGHT_V2_SINCE);
  });

  it("points at the published vocabulary rather than redefining the defect", async () => {
    const res = await SELF.fetch(
      `https://scvd.store/api/preflight/${PREFLIGHT_VERSION_NEXT}`,
    );
    const body = (await res.json()) as {
      batteries: { defect_vocabulary: string };
    };
    expect(body.batteries.defect_vocabulary).toContain("/defects");
  });
});

describe("one probe, both verdicts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A door that answers a well-formed 402 offering only an EVM rail. */
  function stubDoor(): void {
    const challenge = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "5000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1111111111111111111111111111111111111111",
          maxTimeoutSeconds: 300,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            status: 402,
            headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
          }),
      ),
    );
  }

  it("carries the other battery's verdict on every completed probe", async () => {
    stubDoor();
    const { preflightUrl } = await import("@/services/preflight");
    const { env } = await import("cloudflare:test");
    const result = await preflightUrl(
      "https://good.example/api/x",
      env as never,
    );
    const body = result.body as {
      version: string;
      also_under?: { version: string; verdict: string; difference: string };
    };
    expect(body.version).toBe(PREFLIGHT_VERSION);
    /*
     * THE REASON THE OVERLAP IS HONEST. A reader comparing a v1 report
     * to a v2 one must never have to guess whether the DOORS differed
     * or the RULES did. One probe produced both verdicts, so they
     * cannot disagree about what was seen — only about what counts.
     */
    expect(body.also_under?.version).toBe(PREFLIGHT_VERSION_NEXT);
    expect(body.also_under?.difference).toBeTruthy();
  });

  it("says plainly when the rail read did not apply, instead of inventing a distinction", async () => {
    // This door offers only an EVM rail, where USDC is an ERC-20 and
    // any address can be credited. The rail read has no opinion, so
    // both batteries scored the identical checks and the report says
    // exactly that rather than implying a difference that was not there.
    stubDoor();
    const { preflightUrl } = await import("@/services/preflight");
    const { env } = await import("cloudflare:test");
    const result = await preflightUrl(
      "https://good.example/api/x",
      env as never,
    );
    const body = result.body as { also_under?: { difference: string } };
    expect(body.also_under?.difference).toContain("did not apply");
  });

  /**
   * THE KEEPER'S RULING, 2026-08-30, and the test that makes it real.
   *
   * Folding transfer-method-signable into v2 was a ruling rather than
   * a build decision for exactly one reason: it MOVES READY on doors
   * this battery has already published rows about. So the property
   * worth pinning is the shape of that move — v2 refuses, v1 does not
   * budge, and one probe produced both.
   */
  it("an unbuildable transfer method costs a door its v2 ready and leaves v1 alone", async () => {
    const challenge = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "5000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1111111111111111111111111111111111111111",
          maxTimeoutSeconds: 300,
          extra: {
            name: "USD Coin",
            version: "2",
            assetTransferMethod: "gokite-aa",
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            status: 402,
            headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
          }),
      ),
    );
    const { preflightUrl } = await import("@/services/preflight");
    const { env } = await import("cloudflare:test");
    const result = await preflightUrl(
      "https://unbuildable.example/api/x",
      env as never,
    );
    const body = result.body as {
      verdict: string;
      also_under?: { verdict: string };
    };
    // v1 is served here and is frozen: structurally this door is fine.
    expect(body.verdict).toBe("ready");
    // v2 counts the field and refuses.
    expect(body.also_under?.verdict).toBe("not_ready");
  });

  it("a door asking for permit2 keeps its ready under BOTH batteries", async () => {
    // The line the ruling drew: a real standard named in the place the
    // spec provides is not a defect, and scoring it would charge an
    // operator for telling the truth about themselves.
    const challenge = {
      x402Version: 2,
      accepts: [
        {
          scheme: "exact",
          network: "eip155:8453",
          amount: "5000",
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          payTo: "0x1111111111111111111111111111111111111111",
          maxTimeoutSeconds: 300,
          extra: {
            name: "USD Coin",
            version: "2",
            assetTransferMethod: "permit2",
          },
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("{}", {
            status: 402,
            headers: { "PAYMENT-REQUIRED": btoa(JSON.stringify(challenge)) },
          }),
      ),
    );
    const { preflightUrl } = await import("@/services/preflight");
    const { env } = await import("cloudflare:test");
    const result = await preflightUrl(
      "https://permit2.example/api/x",
      env as never,
    );
    const body = result.body as {
      verdict: string;
      also_under?: { verdict: string };
      advisories?: { name: string }[];
    };
    expect(body.verdict).toBe("ready");
    expect(body.also_under?.verdict).toBe("ready");
    // Still told to the buyer, just never scored against the door.
    expect(body.advisories?.map((a) => a.name)).toContain(
      "nonstandard-transfer-method",
    );
  });

  it("claims no comparison for a probe that never completed", async () => {
    /*
     * An unreachable door produced no observation, so there is nothing
     * for a second battery to score. Reporting "both agreed" here would
     * be a comparison of two readings that do not exist — the same
     * dishonesty the census avoids by counting its own missed rounds
     * against itself rather than as passes.
     */
    const res = await SELF.fetch("https://scvd.store/api/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://nothing-here.invalid/api/x" }),
    });
    const body = (await res.json()) as { also_under?: unknown };
    expect(body.also_under).toBeUndefined();
  });
});

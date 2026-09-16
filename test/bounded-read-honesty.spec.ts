import { describe, expect, it } from "vitest";

/**
 * HOUSE RULE: A LOOKUP THAT CANNOT SEE EVERYTHING MUST NOT ANSWER "NO".
 *
 * This file is the check behind that rule, because rule 35 says a rule
 * with no check gets retracted in public.
 *
 * SIX INSTANCES IN ONE DAY, 2026-08-25, every one the same shape — a
 * measurement that could not see everything reporting as though it
 * could:
 *
 *   1. The census published `ready` for doors it never pay-checked;
 *      ward-round calls the offline battery and checkRailReceivable is
 *      reachable only from preflight.
 *   2. /rails published `rail_not_recorded: 0` — the field that exists
 *      to say "we do not know" answering zero.
 *   3. /pulse published 33 organic settlements while /stats and /rails
 *      said 14; the house reclassification was applied in one reader
 *      and not the other.
 *   4. test/offer-receipt.spec.ts asserted `offer.payload.*`, so
 *      passing REQUIRED the spec violation it should have caught.
 *   5. Two drafts of the header-budget guard went green against a live
 *      defect, because this test worker cannot reach production's
 *      challenge size.
 *   6. The published latency histogram timed only successful 402s, so
 *      its percentiles excluded our own failures without saying so.
 *
 * The mechanical form is always a BOUNDED READ whose incompleteness is
 * never asked about. `listKeys` takes a cap and returns `truncated`
 * beside its names; a caller that never reads that flag has answered a
 * question it did not ask.
 *
 * WHAT THIS CHECK CANNOT SEE, stated here because the rule applies to
 * its own enforcement first. It works per FILE, not per call site: a
 * file that handles truncation for one `listKeys` call and silently
 * drops it for a second passes this check. Catching that needs a
 * parser and a scope analysis, which is a bigger claim than this file
 * makes. The baseline below is therefore a floor on the problem, not a
 * census of it — exactly the distinction the rule is about.
 */

const SOURCES = import.meta.glob("../src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** The escape hatch, and it has to be said in the code to count. */
const SAFE_MARKER = "BOUNDED-READ-SAFE:";

/**
 * Files that call `listKeys` and never mention `truncated`, as of
 * 2026-08-25. Recorded rather than fixed: some of these caps are
 * provably above any possible key count, and some results never reach
 * a published figure. Calling all of them defects would be its own
 * overclaim — the point of writing them down is that the question now
 * has to be answered once, in the code, per file.
 *
 * THIS LIST ONLY SHRINKS. A new entry means somebody added a bounded
 * read without deciding what happens when it truncates.
 */
const KNOWN_UNACKNOWLEDGED = [
  "../src/lib/alerts.ts",
  "../src/lib/bazaar-observer.ts",
  "../src/lib/referrals.ts",
  "../src/services/almanac-store.ts",
  "../src/services/bounty-board.ts",
  "../src/services/closers.ts",
  "../src/services/confessions.ts",
  /*
   * corpus.ts CAME OFF THIS LIST ON 2026-09-05: its one bounded read,
   * listCorpus, moved to services/corpus-list.ts so the doors Worker
   * could import it without the rest of the observatory, and the new
   * file says why its cap is safe (one record a week, a cap of a
   * thousand) instead of staying quiet about it.
   */
  "../src/services/gazette.ts",
  "../src/services/grudges.ts",
  /*
   * guestbook.ts CAME OFF THIS LIST ON 2026-08-27, and this comment is
   * here because the list shrinking is the only thing that makes it
   * mean anything.
   *
   * It was here for the reason most of these are: the register was
   * listed with a cap and the cap's `truncated` flag was dropped on
   * the floor, so a reading of the first twenty-five entries was
   * published as though it were the book. It now walks — the page
   * carries `has_more`, and a `next_cursor` when and only when there
   * is a next page. See lib/collection-semantics.ts for why it is the
   * one collection here that genuinely needed a cursor, and why the
   * others declare themselves bounded instead of growing one.
   */
  "../src/services/letters.ts",
  /*
   * orders.ts CAME OFF THIS LIST ON 2026-09-07, and all three of its
   * bounded reads had to answer before it could, because this check
   * works per file and would have taken one of them as the whole
   * file's answer.
   *
   * soldInventory refuses a truncated sale scan rather than guess how
   * much inventory is left. listOrders refuses too, for the same
   * reason and a worse consequence: nothing deletes an `order:` key,
   * so its cap is a ceiling the store reaches, and the SLA guard, the
   * digest, /admin, the fulfillment log and the claims door all
   * publish figures off that list — the oldest queued orders would
   * have been the first to vanish from it. resetWeeklyInventory
   * clears its prefix, so it walks the cursor to the end instead of
   * stopping at the cap and calling the reset done.
   */
  "../src/services/patron-anchors.ts",
  "../src/services/phantom.ts",
  "../src/services/refunds.ts",
  "../src/services/requests.ts",
  /*
   * stats.ts CAME OFF THIS LIST ON 2026-09-13, and both of its bounded
   * reads had to answer before it could — this check works per file,
   * and would otherwise have taken the new one's answer for the whole
   * file's.
   *
   * The NEW read is the customer list behind the patron gauge, which
   * returns null rather than a short count: a wallet tally that could
   * not see every wallet is not a number of patrons. The OLD one is
   * the paid-counter scan, one key per item per month against a cap
   * two orders of magnitude above the catalog — so it still publishes
   * when it truncates, and names the months it truncated on the
   * diagnostics, where the invariant sweep pages a person. Either way
   * the question is answered in the code instead of left open.
   */
  "../src/services/stock.ts",
  "../src/services/tips.ts",
  "../src/services/train.ts",
  "../src/services/trust-profile.ts",
  "../src/services/watch-sweep.ts",
];

function callSites(source: string): number {
  return source.split("listKeys(").length - 1;
}

describe("a lookup that cannot see everything must not answer no", () => {
  /**
   * THE NON-VACUITY CLAUSE, and it exists because three guards written
   * on the same day as this one went green having measured nothing. A
   * check whose walker silently found no files would report a clean
   * sheet, which is the precise failure this rule names. So the walk
   * proves itself before it judges anything.
   */
  it("actually walked the source it claims to have walked", () => {
    const files = Object.keys(SOURCES);
    expect(files.length, "the source glob found nothing").toBeGreaterThan(150);
    const total = Object.values(SOURCES).reduce(
      (sum, source) => sum + callSites(source),
      0,
    );
    expect(
      total,
      "found no bounded reads at all — the pattern this file matches must have changed",
    ).toBeGreaterThan(40);
  });

  it("every file with a bounded read has decided what truncation means", () => {
    const unacknowledged = Object.entries(SOURCES)
      .filter(([, source]) => callSites(source) > 0)
      .filter(
        ([, source]) =>
          !source.includes("truncated") && !source.includes(SAFE_MARKER),
      )
      .map(([path]) => path)
      .sort();

    /*
     * Reported as a set difference in both directions, on purpose. A
     * plain subset assertion would let the list rot: a file that got
     * fixed would sit here forever, and the next reader would trust a
     * baseline describing a repo that no longer exists.
     */
    const added = unacknowledged.filter(
      (path) => !KNOWN_UNACKNOWLEDGED.includes(path),
    );
    expect(
      added,
      "a new bounded read that never asks whether it saw everything — read the flag, or mark the call BOUNDED-READ-SAFE: <reason>",
    ).toEqual([]);

    const fixed = KNOWN_UNACKNOWLEDGED.filter(
      (path) => !unacknowledged.includes(path),
    );
    expect(
      fixed,
      "these are acknowledged now — take them out of KNOWN_UNACKNOWLEDGED so the baseline keeps meaning something",
    ).toEqual([]);
  });
});

/**
 * THE SEVENTH INSTANCE, AND IT WAS NOT A KV READ (2026-09-04).
 *
 * Rule 52 was written for BOUNDED READS — a listKeys that stops at a
 * cap. The same rule governs BOUNDED KNOWLEDGE, and nothing here was
 * checking it: a lookup TABLE that cannot see every chain must not
 * answer "no" about a chain it has never heard of.
 *
 * payto-payable resolved every unrecognised CAIP-2 namespace to the
 * EVM branch and failed it. An XRPL classic address is base58 inside
 * the Solana window, so a correct payTo was published as "a base58
 * Solana address ... no buyer on this rail can pay this offer";
 * Stellar and Algorand are base32 and matched nothing at all. In
 * round 2026-W36 that flipped 61 hosts from ready to not_ready and
 * moved published tiers — agent402.tools was reading "broken" on a
 * door that answered a clean 402.
 *
 * The rule already said this. The enforcement only walked KV. So the
 * enforcement now walks the readers that judge strangers, and the
 * property is the rule stated exactly: never "no" outside competence.
 */
describe("a lookup that cannot see every chain must not answer no", () => {
  /** Real namespaces we do not read, plus ones nobody has invented. */
  const UNREADABLE = [
    "xrpl:0",
    "stellar:pubnet",
    "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73k",
    "animica:1",
    "cosmos:cosmoshub-4",
    "bip122:000000000019d6689c085ae165831e93",
    "someledger-nobody-has-built:7",
    "",
  ];

  it("never calls a payTo unpayable on a chain it does not read", async () => {
    const { readPayTo } = await import("@/lib/pay-to");
    // Values chosen to look like nothing this desk knows, so any
    // "false" would be the table guessing rather than reading.
    const values = ["rsnHPZjBSastxz1BE38WqKBR3sgpATvreL", "GDNJXCKW7ZM7GEEVP674TWPU26YJNBQ2FI4ZIPRKTPTNUEJMDHFJWWRL", "zzz-not-an-address", "1"];
    for (const network of UNREADABLE) {
      for (const value of values) {
        const verdict = readPayTo(value, network);
        if (network === "") continue; // no network named is its own finding
        expect(
          verdict.payable,
          `readPayTo(${value}, ${network}) answered "no" about a rail this desk does not read`,
        ).not.toBe(false);
      }
    }
  });

  it("never fails a verdict check on a chain it does not read", async () => {
    const { l3bChecks } = await import("@/lib/value-checks");
    const { readPayTo } = await import("@/lib/pay-to");
    for (const network of UNREADABLE.filter((n) => n !== "")) {
      const checks = l3bChecks(
        [
          {
            network,
            // A decimal amount and a method nobody publishes: on a rail
            // we cannot read, neither is ours to call wrong.
            amount: "0.01",
            asset: "SOMETHING",
            payTo: "whatever-this-chain-uses",
            extra: { assetTransferMethod: "a-method-we-have-never-seen" },
          },
        ],
        readPayTo,
      );
      const failed = checks.filter((c) => !c.ok).map((c) => c.name);
      expect(failed, `${network} produced findings this desk cannot support`).toEqual([]);
    }
  });

  /**
   * THIS TEST USED TO BE `expect(true).toBe(true)` (fixed 2026-09-06).
   *
   * It carried the right comment — "a guard that cleared everything
   * would be the same defect wearing the fix's clothes" — and then
   * asserted nothing, so the thing it warned about could happen
   * freely. readPayTo could have regressed to returning null for
   * every input and this whole describe would still have gone green,
   * because every other case here only forbids `false`.
   *
   * A check that examines nothing and reports pass, inside the guard
   * for the rule against exactly that. It is the seventh instance's
   * twin and it was ours, in this file, for twelve days.
   */
  it("still says no, loudly, on the rails it does read", async () => {
    const { readPayTo } = await import("@/lib/pay-to");
    const readable: [string, string][] = [
      ["not-a-base58-address!!", "eip155:8453"],
      ["0xdeadbeef", "eip155:8453"],
      ["", "eip155:1"],
    ];
    for (const [value, network] of readable) {
      expect(
        readPayTo(value, network).payable,
        `readPayTo(${value}, ${network}) declined to judge a rail this desk DOES read`,
      ).toBe(false);
    }
  });
});

/**
 * THE "OK" HALF OF RULE 52 (2026-09-06).
 *
 * The rule's title covered the wrongful "no" until this week, and its
 * enforcement still does: every property above forbids a `false` the
 * desk cannot support. Nothing forbade the flattering direction — a
 * check reporting a PASS about something it never examined.
 *
 * WE WERE HANDED THE CLASS BY THE PARTY WHOSE PRODUCT HAD IT.
 * 0200project disclosed, unprompted on issue #188, that their
 * decoder returned `drainer_blacklist: ok` for a payee that was never
 * in the set it screened — on every facilitator-relayed settlement,
 * which is the whole shape of x402. The coverage was real and lived
 * only in the summary prose.
 *
 * AND THEN THIS FILE'S OWN SUBJECT WAS DOING IT. `payto-payable`
 * returned `ok: true` with its unjudged entries named inside an
 * English sentence in `detail`. A consumer reading the boolean got a
 * clean pass; in the limit, every entry unjudged and the check still
 * true. The fix is the one we recommended to them: publish what was
 * examined as data. `not_judged` is that field, and this is its
 * guard.
 */
describe("a check that judged nothing must not report a clean pass", () => {
  /*
   * A chain nobody has built, chosen deliberately over xrpl:0 — which
   * this desk READS now, and returns payable: true for. A fixture
   * that is quietly judged would make every assertion below vacuous,
   * which is the failure this whole file is about.
   */
  const UNJUDGEABLE = { network: "animica:1", amount: "0.01", asset: "X", payTo: "whatever-this-chain-uses" };

  it("names its unjudged entries as data, not only in prose", async () => {
    const { l3bChecks } = await import("@/lib/value-checks");
    const { readPayTo } = await import("@/lib/pay-to");
    const checks = l3bChecks([UNJUDGEABLE], readPayTo);
    const payTo = checks.find((c) => c.name === "payto-payable")!;
    expect(payTo.ok, "an unreadable rail is not a failure").toBe(true);
    expect(
      payTo.not_judged,
      "payto-payable passed having judged nothing, and said so only in prose",
    ).toHaveLength(1);
    expect(payTo.not_judged![0]).toContain("animica:1");
    // The prose still says it too — the field is an addition, not a
    // replacement, so a human reading `detail` loses nothing.
    expect(payTo.detail).toContain("Not judged");
  });

  it("a pass that judged everything carries no coverage field at all", async () => {
    // The other half of the property. A `not_judged: []` on every
    // check would satisfy a careless test and tell a reader nothing;
    // absent means "nothing was skipped", present means "read me".
    const { l3bChecks } = await import("@/lib/value-checks");
    const { readPayTo } = await import("@/lib/pay-to");
    const checks = l3bChecks(
      [{ network: "eip155:8453", amount: "1000", asset: "USDC", payTo: "0x404018C829a4e5AC5F703D1eB0B942Ae7852017F" }],
      readPayTo,
    );
    for (const check of checks) {
      if (!check.ok) continue;
      expect(
        check.not_judged,
        `${check.name} carries an empty coverage field, which is noise`,
      ).toBeUndefined();
    }
  });

  it("every passing check with a coverage field is non-empty", async () => {
    // A structural property over both shapes above: the field exists
    // to carry names. Present-and-empty is the failure mode that
    // would let this whole guard pass while saying nothing.
    const { l3bChecks } = await import("@/lib/value-checks");
    const { readPayTo } = await import("@/lib/pay-to");
    for (const entry of [UNJUDGEABLE, { network: "eip155:8453", amount: "1000", asset: "USDC", payTo: "0x404018C829a4e5AC5F703D1eB0B942Ae7852017F" }]) {
      for (const check of l3bChecks([entry], readPayTo)) {
        if (check.not_judged === undefined) continue;
        expect(check.not_judged.length, `${check.name} published an empty not_judged`).toBeGreaterThan(0);
        expect(check.ok, `${check.name} carries coverage on a FAILING check`).toBe(true);
      }
    }
  });
});

/**
 * A PROBE THAT ASKED THE WRONG QUESTION MUST NOT ANSWER "NO" EITHER
 * (2026-09-16).
 *
 * The third face of rule 52 in this file, and it arrived the way the
 * other two did: from outside. An operator asked why his endpoint was
 * published `not_ready`. It answers 405 to GET — the verb every probe
 * this store runs hard-coded — and a flawless x402 v2 challenge to
 * POST, the method his own OpenAPI declares. The battery scored the
 * 405 as a failed `status-402` check, the census published it on his
 * passport page, and the outreach desk mailed his security contact
 * naming the check that failed.
 *
 * The 2026-09-04 correction extended this file rather than starting a
 * new one, on the grounds that rule 52 already forbade the defect and
 * only its ENFORCEMENT was too narrow. Same here, so same file. What
 * the guard below actually holds:
 *
 *   1. A method refusal produces NO checks — not a failing one.
 *   2. The fallback finds a door that only answers POST.
 *   3. `method_unresolved` never reads as `ready` through the
 *      `failed.length === 0` idiom every caller of runChecks uses.
 *      That idiom over an EMPTY check list is the flattering answer
 *      in one ternary, and it is the specific way this fix could be
 *      undone without anybody noticing.
 *   4. The census — not the free preflight — is walked, because the
 *      census is the surface that published the wrong verdict and it
 *      carries its own fetch.
 */
describe("a probe that asked the wrong question must not answer no", () => {
  /** The door that caught us, reduced to its two observed behaviours. */
  const postOnlyDoor = (challenge: string) =>
    (async (_url: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "POST"
        ? new Response(challenge, {
            status: 402,
            headers: {
              "PAYMENT-REQUIRED": btoa(challenge),
              "content-type": "application/json",
            },
          })
        : // 405 with NO Allow header — RFC 9110 §15.5.6 makes it
          // mandatory and the real door omits it, so a fallback that
          // required Allow would have failed this operator too.
          new Response(null, { status: 405 })) as unknown as typeof fetch;

  const CHALLENGE = JSON.stringify({
    x402Version: 2,
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        amount: "1000000",
        payTo: "0xb5a05466712fd5bcdf2883f43cC6B1799428032d",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        maxTimeoutSeconds: 60,
      },
    ],
  });

  it("finds the challenge on a door that answers only POST", async () => {
    const { probeOnce, runChecks } = await import("@/services/preflight");
    const outcome = await probeOnce(
      "https://agents.example/api/gateway/topup",
      postOnlyDoor(CHALLENGE),
    );
    expect(outcome.method.attempted).toEqual(["GET", "POST"]);
    expect(outcome.method.used).toBe("POST");
    expect(outcome.method.unresolved).toBe(false);
    const ran = runChecks(outcome.response, false, outcome.body, "", outcome.method);
    expect(ran.method_unresolved).toBeUndefined();
    expect(
      ran.checks.find((check) => check.name === "status-402")?.ok,
      "a door serving a valid challenge to POST was still scored as serving none",
    ).toBe(true);
  });

  it("emits NO checks when every method is refused, rather than a failing one", async () => {
    const { probeOnce, runChecks } = await import("@/services/preflight");
    const refusesEverything = (async () =>
      new Response(null, { status: 405 })) as unknown as typeof fetch;
    const outcome = await probeOnce("https://agents.example/door", refusesEverything);
    expect(outcome.method.attempted).toEqual(["GET", "POST"]);
    expect(outcome.method.unresolved).toBe(true);
    const ran = runChecks(outcome.response, false, outcome.body, "", outcome.method);
    expect(ran.method_unresolved).toBe(true);
    expect(
      ran.checks,
      "a method refusal produced a check, which is an observation nobody made",
    ).toEqual([]);
    expect(
      ran.checks.some((check) => check.name === "status-402"),
      "status-402 was scored against a door we never reached",
    ).toBe(false);
  });

  it("never lets an empty check list read as ready", async () => {
    const { probeOnce, runChecks } = await import("@/services/preflight");
    const refusesEverything = (async () =>
      new Response(null, { status: 501 })) as unknown as typeof fetch;
    const outcome = await probeOnce("https://agents.example/door", refusesEverything);
    const ran = runChecks(outcome.response, false, outcome.body, "", outcome.method);
    /*
     * THE IDIOM, REPRODUCED EXACTLY as every caller of runChecks
     * writes it. If `method_unresolved` ever stops being set, this
     * line computes "ready" for a door nobody knocked on and the
     * assertion below is what catches it.
     */
    const naive = ran.checks.filter((c) => !c.ok).length === 0 ? "ready" : "not_ready";
    expect(naive).toBe("ready");
    expect(
      ran.method_unresolved,
      "the flattering answer is reachable: an empty battery scores ready and nothing says otherwise",
    ).toBe(true);
  });

  it("a document read does not grow a POST fallback", async () => {
    const { probeOnce } = await import("@/services/preflight");
    const sent: string[] = [];
    const impl = (async (_url: string, init?: RequestInit) => {
      sent.push(init?.method ?? "GET");
      return new Response(null, { status: 405 });
    }) as unknown as typeof fetch;
    await probeOnce("https://agents.example/.well-known/x402", impl, "", undefined, {
      fallback: false,
    });
    expect(
      sent,
      "a fixed catalog path was POSTed at; a 405 there is an answer about the document",
    ).toEqual(["GET"]);
  });

  it("the census — which carries its own fetch — resolves the method too", async () => {
    /*
     * THE POINT OF THIS CASE. The brief that opened this work said one
     * function backed every probing surface. It did not: probeHost
     * imports the battery and not the fetch, and probeHost is what
     * published the wrong verdict. A fix proven only through
     * preflight.probeOnce would have left the census exactly as it
     * was, so the guard walks the census.
     */
    const ward = await import("@/services/ward-round");
    expect(
      typeof ward.carriesVerdict,
      "the shared non-verdict predicate is gone; ready fractions are counting rows nobody read",
    ).toBe("function");
    expect(
      ward.carriesVerdict({ verdict: "method_unresolved" }),
      "a door whose verb we never found is being counted in a ready denominator",
    ).toBe(false);
    expect(
      ward.carriesVerdict({ verdict: "not_ready" }),
      "a real verdict stopped counting",
    ).toBe(true);
  });

  it("no probe at a stranger's x402 door hard-codes its verb", () => {
    /*
     * THE STRUCTURAL HALF (rule 46: a guard that cannot fail argues
     * for the lie). The probes below are the ones that knock on
     * strangers' PAYMENT DOORS. Each carried its own verb until
     * today — three by hard-coding `method: "GET"` and the fourth by
     * omitting the field, which defaults to the same thing and is
     * why grepping for the string alone was not enough to find them.
     * That is how a fix to any single one would have been mistaken
     * for a fix to all of them.
     */
    /*
     * COMMENTS ARE STRIPPED FIRST, and the first draft of this guard
     * did not strip them — it failed on the prose that explains the
     * fix, which is a guard reporting the cure as the disease. Rule 46
     * cuts both ways: a check that fires on its own documentation is
     * as useless as one that cannot fire at all.
     */
    const code = (source: string): string =>
      source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const DOOR_PROBES = [
      "../src/services/preflight.ts",
      "../src/services/ward-round.ts",
      "../src/services/standing-watch.ts",
      /*
       * THE FOURTH, found while fixing the other three and not in the
       * scoping that opened this work: the paid launch check walks a
       * door to actual settlement and its unpaid approach stage was
       * GET-only too. A POST-only door was not merely reported as
       * serving no challenge — it was reported as unpayable by an
       * instrument that never asked it to sell anything.
       */
      "../src/services/launch-check.ts",
    ];
    for (const path of DOOR_PROBES) {
      const raw = SOURCES[path];
      expect(raw, `${path} is not in the walked source set`).toBeTruthy();
      const source = code(raw!);
      expect(
        source.includes('method: "GET"'),
        `${path} hard-codes GET at a stranger's payment door; the verb is resolved in lib/probe-method.ts`,
      ).toBe(false);
      expect(
        source.includes("probeWithMethod"),
        `${path} probes a payment door without the shared method law`,
      ).toBe(true);
    }
  });
});

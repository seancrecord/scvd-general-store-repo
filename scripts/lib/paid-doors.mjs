/**
 * HAS ANYONE PAID THIS DOOR — the pure half.
 *
 * The measurement definition is StillOS Notary's, supplied on
 * 2026-09-15 after they withdrew their own implementation: "Take the
 * definition instead and build your own." The code here is ours on
 * purpose. Two operators running one reader share its bugs, and the
 * whole value of a second operator is that they do not.
 *
 * WHAT IT COUNTS: inbound USDC to a door's advertised payTo, across a
 * BLOCK WINDOW NAMED PER READ rather than "all time". Both ends are
 * named because neither is free: a public RPC caps eth_getLogs at a
 * couple of thousand blocks, so an all-time index is tens of thousands
 * of requests per address, and a reading nobody can afford to reproduce
 * is not evidence. A window costs a scope, and the scope is carried on
 * every row rather than rounded off.
 *
 * A distinct counterparty is a unique SENDING ADDRESS, so a facilitator
 * settling for ten buyers counts once: this measures settling
 * addresses, not customers, and says so wherever it reports a number.
 *
 * WHAT IT NEVER DOES: rank. Rule 43 forbids ordering one host against
 * another, and the instrument this definition came from did exactly
 * that until its author removed it. It also never says never_paid; the
 * strongest negative available is ZERO_OBSERVED over a named window,
 * and only the nonce-zero path widens that window to all of history.
 */

import { EVM_RAILS, railFor } from "./evm-chains.mjs";

/**
 * KEPT, and no longer the only rail. This constant was the whole of
 * this reader's chain knowledge until 2026-09-16, beside a seven-chain
 * registry the store had been using for months. Exported still because
 * callers and tests name it; new code should ask railFor(caip2).
 */
export const USDC_BASE = EVM_RAILS["eip155:8453"].usdc;

/** Every rail this instrument can read, by CAIP-2. */
export const READABLE_RAILS = Object.freeze(Object.keys(EVM_RAILS));

/**
 * The USDC contract for a rail, or null when the rail is out of reach.
 * A rail we cannot read is named UNKNOWN rather than skipped: that is
 * the rail rule, and skipping is how a gap becomes a confident answer.
 */
export function usdcFor(caip2) {
  return railFor(caip2)?.usdc ?? null;
}
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** The three verdicts, and nothing else. */
export const PAID_VERDICTS = Object.freeze(["PAID", "ZERO_OBSERVED", "UNKNOWN"]);

/**
 * The residuals this reading cannot close, named rather than implied
 * shut. The first is StillOS's and theirs; carrying it is ours. The
 * second we found by running this instrument: see SETTLEMENT_RESIDUAL.
 */
export const PAID_RESIDUAL =
  "EIP-3009 lets a relayer move funds on a signed authorization without the recipient's nonce moving, and an atomic receive-and-forward in one transaction is invisible to any state read. A ZERO_OBSERVED established from state alone does not exclude either.";

/**
 * FOUND BY RUNNING THIS, 2026-09-15, and the most useful thing the
 * first run produced. A door advertising a scheme other than `exact`
 * may be paid without a single direct USDC Transfer to its advertised
 * payTo ever appearing on chain: a batch or escrow settlement scheme
 * moves buyer funds into a contract, and the payTo in the challenge is
 * a destination the scheme credits rather than an address buyers send
 * to. The shape to watch for is an address holding a non-zero USDC
 * balance with no inbound transfer anywhere in a window read complete.
 *
 * The door that produced this, and the reading it produced, are held:
 * they sit inside an exercise whose answers are under commitment, and
 * writing the worked example into the instrument would publish part of
 * an answer this store has promised not to publish yet. This paragraph
 * is the record that they are being held, not that they are missing.
 *
 * So a ZERO_OBSERVED on a door whose challenge advertises a settlement
 * scheme is a fact about WHERE WE LOOKED, and calling it a fact about
 * the door would be the same error we published a correction for on
 * 2026-09-15. Any row for such a door carries this beside its verdict.
 */
export const SETTLEMENT_RESIDUAL =
  "This reads direct USDC Transfer events to the advertised payTo. A door whose challenge advertises a scheme other than `exact` — a batch or escrow settlement, typically carrying a receiverAuthorizer and a withdrawDelay — can be paid without any such transfer existing, because buyer funds move into the scheme's contract instead. On those doors ZERO_OBSERVED means this instrument found no DIRECT payment, never that the door was not paid.";

/**
 * A rail this instrument can actually settle a ZERO on. It reads direct
 * USDC Transfer events, so it can only report an empty result as a
 * finding where a payment WOULD be such a transfer. Under a batch or
 * escrow scheme the money moves into the scheme's contract, and looking
 * at the payTo's transfers is looking in the wrong place.
 *
 * ADDED 2026-09-15, after StillOS Notary pinned the rule: ZERO_OBSERVED
 * requires every advertised rail to resolve empty, and any rail out of
 * reach makes the door UNKNOWN. We already carried SETTLEMENT_RESIDUAL
 * saying a zero on such a door was "a fact about where we looked" — and
 * then let the verdict read ZERO_OBSERVED anyway, with the caveat
 * printed beside it. A caveat beside a verdict gets quoted without the
 * caveat. This makes it structural.
 */
/**
 * THE HORIZON RULE (2026-09-19, from StillOS Notary's third failure mode).
 *
 * A provider that prunes logs past a horizon answers an EMPTY ARRAY,
 * not an error, for any range older than it keeps. Nothing throws, so
 * no retry and no catch can see it, and the result is byte-identical
 * to a door nobody paid.
 *
 * The defence is a canary: ask the same range whether it holds ANY
 * transfer of this asset. A mainnet USDC contract moves thousands per
 * hundred blocks, so an empty answer THERE is the provider declining
 * to serve the range. This function is the decision; the request that
 * feeds it lives in the CLI.
 *
 * `canary` is `null` when no canary was needed — a window that found
 * transfers is self-evidently being served.
 */
export function windowTrustworthy({ logs = [], canary = null } = {}) {
  if ((logs ?? []).length > 0) {
    return { trustworthy: true, canary_needed: false };
  }
  if (!canary) {
    return {
      trustworthy: false,
      canary_needed: true,
      because: "the window came back empty and no horizon canary was run, so this instrument cannot tell an unpaid door from a range the provider does not serve",
    };
  }
  if (canary.served === true) {
    return { trustworthy: true, canary_needed: true, canary };
  }
  return {
    trustworthy: false,
    canary_needed: true,
    canary,
    because: `the window returned no transfers, and a horizon canary over blocks ${canary.probed ?? "unnamed"} found no transfers of this asset of ANY kind${canary.error ? ` (${canary.error})` : ""}. A mainnet USDC contract is never that quiet, so this provider is not serving this range rather than the door being unpaid.`,
  };
}

/**
 * A 0x ADDRESS IS NOT A PERMISSION TO READ IT HERE (2026-09-19).
 *
 * Every EVM chain uses one address format, and this reader holds one
 * rail per run. So a pinned Polygon payTo read against Base's USDC
 * contract SUCCEEDS — the address exists there too, the call returns,
 * and the row looks like a reading of Polygon. It is a well-formed
 * wrong value, the same shape as an address re-typed from a truncated
 * display, and it was live in this CLI until a nine-rail door in the
 * next blind key walked into it.
 *
 * A rail is read only when the door pinned it to the rail this run is
 * reading. Anything else is named and returned UNKNOWN.
 */
export function railCoveredByRun(doorRail, runRail) {
  if (doorRail === null || doorRail === undefined) return true;
  return doorRail === runRail;
}

export function railInReach(scheme) {
  return scheme === null || scheme === undefined || scheme === "exact";
}

/** A unique SENDING address is one counterparty, however many buyers it settles for. */
export function distinctPayers(logs) {
  return [...new Set((logs ?? []).map((l) => String(l.from ?? "").toLowerCase()).filter(Boolean))];
}

export function totalReceived(logs) {
  return (logs ?? []).reduce((sum, l) => sum + BigInt(l.value ?? 0n), 0n);
}

/**
 * THE READING. Every answer says what established it, and the three
 * verdicts are not interchangeable:
 *
 *   PAID           at least one inbound settlement was observed
 *   ZERO_OBSERVED  the named window was readable and contained none
 *   UNKNOWN        the window was not readable, or the rail is out of
 *                  this instrument's reach
 *
 * A ZERO OFF A TRUNCATED PAGE IS REFUSED, which is the whole reason
 * `logsComplete` is a separate argument from `logs`: an empty array
 * from a capped query and an empty array from a complete one are the
 * same bytes and opposite facts. The denominator is a population, not
 * a page.
 *
 * The state path is the one that lets a zero stand without an index:
 * USDC leaves an address only by a transaction FROM it, which
 * increments its nonce, so at nonce 0 the balance is monotonically
 * non-decreasing and the balance at head is the maximum ever held.
 * Zero at head with nonce 0 is zero at every block in history. That
 * argument is StillOS's; it is better than the question we asked.
 */
export function readDoorRail({
  rail,
  payTo,
  atBlock,
  fromBlock = null,
  scheme = null,
  balance = null,
  nonce = null,
  logs = null,
  logsComplete = null,
} = {}) {
  const window = fromBlock === null ? null : `${fromBlock}-${atBlock}`;
  const base = {
    rail, pay_to: payTo ?? null, at_block: atBlock ?? null,
    window_from_block: fromBlock, window: window, residual: PAID_RESIDUAL,
    ...(scheme && scheme !== "exact"
      ? { advertised_scheme: scheme, settlement_residual: SETTLEMENT_RESIDUAL }
      : {}),
  };
  const inWindow = window ? `in blocks ${window}` : `in the full history ending at block ${atBlock}`;
  if (!payTo) {
    return { ...base, verdict: "UNKNOWN", established_by: "no advertised payTo was resolved for this rail, so nothing was read" };
  }
  if (Array.isArray(logs) && logsComplete === true) {
    if (logs.length > 0) {
      const payers = distinctPayers(logs);
      return {
        ...base,
        verdict: "PAID",
        established_by: `${logs.length} inbound USDC transfer(s) observed ${inWindow}, read complete`,
        scope: window ? "window" : "all_time",
        distinct_payers: payers.length,
        distinct_payers_means: "unique sending addresses, not customers: a facilitator settling for many buyers counts once",
        total_received_atomic: totalReceived(logs).toString(),
      };
    }
    if (!railInReach(scheme)) {
      return {
        ...base,
        verdict: "UNKNOWN",
        established_by: `the transfer window to this address ${inWindow} was read complete and contained no inbound USDC — but this door advertises the ${scheme} scheme, under which a payment need not be a direct transfer to the advertised payTo at all. An empty result here is a fact about where this instrument looked, not about the door, so it is UNKNOWN rather than a zero.`,
        distinct_payers: null,
      };
    }
    // THE STRONGER ARGUMENT WINS (2026-09-16). A complete empty window
    // and the nonce argument are two independent reasons for the same
    // zero, and the nonce one reaches further: it covers all of
    // history rather than the window. Reporting `window` here because
    // the window branch happened to run first UNDER-CLAIMS a zero we
    // can actually prove outright — found by reading a counterparty's
    // five, where two doors we could prove empty for all history were
    // being handed back as merely empty since the floor.
    const allTimeToo = balance !== null && BigInt(balance) === 0n && nonce === 0;
    if (allTimeToo) {
      return {
        ...base,
        verdict: "ZERO_OBSERVED",
        established_by: `the transfer window to this address ${inWindow} was read complete and contained no inbound USDC, AND the balance is zero at a transaction count of zero: nothing can ever have left, so the balance is monotonically non-decreasing and this zero holds at every block in this address's history, not only inside the window`,
        scope: "all_time",
        scope_caveat: null,
        established_twice: "a complete empty window and the nonce argument, independently",
        distinct_payers: 0,
        total_received_atomic: "0",
      };
    }
    return {
      ...base,
      verdict: "ZERO_OBSERVED",
      established_by: `the transfer window to this address ${inWindow} was read complete and contained no inbound USDC`,
      scope: window ? "window" : "all_time",
      scope_caveat: window
        ? `this is a zero IN blocks ${window} and says nothing about any block before ${fromBlock}. The nonce argument does not apply here: this address has moved funds out at some point, so its balance is not monotonically non-decreasing.`
        : null,
      distinct_payers: 0,
      total_received_atomic: "0",
    };
  }
  // No complete log window. State can still settle a positive, and can
  // settle a zero ONLY under the nonce argument.
  const truncated = Array.isArray(logs) && logsComplete === false;
  if (balance !== null && BigInt(balance) > 0n) {
    return {
      ...base,
      verdict: "PAID",
      established_by: `a USDC balance of ${BigInt(balance).toString()} atomic units at block ${atBlock}; a balance can only have arrived, so at least one inbound settlement happened`,
      distinct_payers: null,
      distinct_payers_unknown_because: truncated
        ? "the transfer window was truncated, so senders could not be counted"
        : "no transfer window was read, so senders could not be counted",
    };
  }
  if (balance !== null && BigInt(balance) === 0n && nonce === 0 && railInReach(scheme)) {
    return {
      ...base,
      verdict: "ZERO_OBSERVED",
      established_by: `a USDC balance of zero at block ${atBlock} with a transaction count of zero: nothing can have left this address, so its balance is monotonically non-decreasing and zero at this height is zero at every height before it`,
      scope: "all_time",
      distinct_payers: 0,
      total_received_atomic: "0",
    };
  }
  // THE REASON ON THE ROW MUST BE THE ACTUAL REASON (2026-09-17). A
  // zero balance at nonce zero on a door whose scheme is out of reach
  // used to be handed back with the nonce sentence, which names a
  // transaction count that is zero. Found reading 43 Arbitrum doors:
  // one row said "non-zero transaction count" beside nonce: 0. A
  // caveat that misnames its cause is worse than none, because it gets
  // believed.
  const schemeBlocksZero = balance !== null && BigInt(balance) === 0n && nonce === 0 && !railInReach(scheme);
  return {
    ...base,
    verdict: "UNKNOWN",
    established_by: truncated
      ? `the transfer window to this address was truncated ${inWindow}, and a zero off a truncated page is refused`
      : balance === null
        ? "neither a transfer window nor a balance was read for this rail"
        : schemeBlocksZero
          ? `a zero balance at block ${atBlock} at a transaction count of zero — which would be an all-time zero — but this door advertises the ${scheme} scheme, under which a payment need not be a direct transfer to the advertised payTo at all. The nonce argument settles what arrived at this address; it cannot settle whether the door was paid, so this is UNKNOWN rather than a zero.`
          : `a zero balance at block ${atBlock} with a non-zero transaction count: funds may have arrived and left, and this instrument did not read the window that would say`,
  };
}

/**
 * THE DOOR, from its rails. StillOS Notary's rule, pinned on issue #622
 * on 2026-09-15 and taken as written:
 *
 *   "ZERO_OBSERVED requires every advertised rail to resolve empty.
 *    Any rail out of reach makes the door UNKNOWN."
 *
 * PAID is the one verdict that survives an unreadable neighbour,
 * because it is monotone: an observed settlement on any rail means
 * somebody paid this door, and no rail we failed to read can undo that.
 * A zero is the opposite — it is a claim about ALL the ways money could
 * have arrived, so a single rail we could not read collapses it.
 *
 * This is why a door verdict is not the same object as a rail verdict
 * and is computed rather than picked. A reader quoting one rail of a
 * multi-rail door is quoting a page again.
 */
export function readDoor({ name = null, rails = [] } = {}) {
  const verdicts = rails.map((r) => r?.verdict ?? "UNKNOWN");
  const base = {
    name,
    rails_read: rails.length,
    rail_verdicts: verdicts,
    rule: "ZERO_OBSERVED requires every advertised rail to resolve empty; any rail out of reach makes the door UNKNOWN. PAID survives an unreadable rail because an observed settlement cannot be undone by one we did not read. StillOS Notary, 2026-09-15.",
  };
  if (rails.length === 0) {
    return { ...base, verdict: "UNKNOWN", established_by: "no rails were read for this door" };
  }
  if (verdicts.includes("PAID")) {
    return {
      ...base,
      verdict: "PAID",
      established_by: `${verdicts.filter((v) => v === "PAID").length} of ${rails.length} advertised rail(s) showed an observed settlement`,
    };
  }
  if (verdicts.every((v) => v === "ZERO_OBSERVED")) {
    return {
      ...base,
      verdict: "ZERO_OBSERVED",
      established_by: `every one of this door's ${rails.length} advertised rail(s) was read and resolved empty`,
    };
  }
  return {
    ...base,
    verdict: "UNKNOWN",
    established_by: `${verdicts.filter((v) => v === "UNKNOWN").length} of ${rails.length} advertised rail(s) could not be resolved, and a zero is a claim about every way money could have arrived`,
  };
}

/**
 * THE KNOWN-ANSWER RUN (2026-09-19, StillOS Notary's seventh term).
 *
 * "Disclosure covers what an operator knows it could not see. Every
 *  defect this thread produced was the other kind — my field name, my
 *  page cap, your swallowed rate limit, your proxy trap, both our loose
 *  rails — confident, well-formed, wrong, and invisible to the
 *  instrument that made it. Declaring scope catches none of them. An
 *  input whose answer is fixed in advance catches all of them, because
 *  each one moves a number that is not allowed to move."
 *
 * Taken as written. Before this reader is allowed to publish a run, it
 * reads two addresses whose answers were settled before the run began,
 * on the same rail, at the same height, through the same code path as
 * every door. If either comes back other than its fixed answer, the run
 * is refused rather than annotated: a caveat beside a wrong number gets
 * quoted without the caveat, and we have the correction on file that
 * proves it.
 *
 * THE PAIR IS CHOSEN SO THAT EACH RAIL'S POSITIVE IS ANOTHER RAIL'S
 * NEGATIVE. Aave V3's USDC aToken on Base holds millions on Base and
 * is an untouched address — zero balance, zero nonce — on Arbitrum,
 * and the Arbitrum aToken is the mirror of that. So reading Arbitrum
 * doors against Base's USDC contract does not merely go unnoticed: the
 * positive control reads zero and the run refuses to publish. That is
 * the cross-rail defect both operators shipped, turned into a tripwire
 * instead of a paragraph.
 *
 * WHAT EACH CONTROL CATCHES, and it is the whole family this thread
 * found rather than a single bug:
 *   - positive reads ZERO   → a wrong field name, selector or decode
 *                             (27 of 27 false zeros, StillOS, 08-21)
 *   - positive read failed  → a swallowed rate limit or a proxy trap
 *                             (107 of 132 rows, ours, 09-15)
 *   - positive on wrong rail→ a pinned address read against another
 *                             chain's asset (both of us, 09-19)
 *   - negative reads PAID   → a decode returning non-zero garbage
 *   - negative loses all_time → the nonce argument path is broken
 *
 * WHAT IT DOES NOT CATCH, said here rather than discovered later: it
 * reads state, so it says nothing about a pruned LOG horizon — that is
 * the horizon canary's job, above — and it exercises one address at a
 * time, so it cannot see an aggregation defect like a page cap
 * published as a population count. Two controls are not a test suite.
 *
 * The expected balance is a FLOOR, not a pin. A pinned balance would
 * have to name a height, and Arbitrum's public node already refuses
 * state older than a few million blocks, so an exact pin quietly
 * becomes an unrunnable control — which is the failure this term exists
 * to prevent. A floor of one million USDC is far below either pool and
 * far above anything a decode error produces. If a pool ever falls
 * through it the run refuses and a human re-pins it, loudly.
 */
/**
 * AN EMPTY RETURN IS NOT A ZERO (found 2026-09-19 by the known-answer
 * run, on its first live outing, which is the argument for the term).
 *
 * `eth_call` to an address holding no code returns `0x` — no revert,
 * no error, HTTP 200. Read that as a balance and every wrong-chain
 * read becomes a confident ZERO_OBSERVED: the asset contract is absent
 * on the chain being asked, so EVERY door reads empty and the run
 * publishes a page of well-formed zeros. It is StillOS's `address_hash`
 * defect, arrived at from the other direction.
 *
 * So empty return data is a READ FAILURE, named, and it sits inside
 * UNKNOWN with the reason on the row. `0x0` and a padded word are real
 * answers; `0x` is the absence of one.
 */
export function balanceFromCallResult(result) {
  if (result === null || result === undefined) {
    return { balance: null, error: "the balance call returned nothing" };
  }
  if (typeof result !== "string" || !result.startsWith("0x")) {
    return { balance: null, error: `the balance call returned ${JSON.stringify(result)}, which is not hex quantity data` };
  }
  if (result === "0x") {
    return {
      balance: null,
      error: "the balance call returned empty data (`0x`), which is what an address holding no code answers. There is no asset contract at the address this run is reading on this chain, so this is a gap in the reader — very often the wrong chain — and never a zero balance.",
    };
  }
  try {
    return { balance: BigInt(result), error: null };
  } catch {
    return { balance: null, error: `the balance call returned ${result}, which is not a readable quantity` };
  }
}

export const KNOWN_ANSWER_METHOD =
  "Before any door is read, this reader reads addresses whose answers were settled before the run began, on the same rail, at the same height, through the same function every door goes through. Each rail's funded control is another rail's untouched one, so a read against the wrong chain's asset fails the control rather than passing unnoticed. Every control returns its settled answer or the run publishes nothing. StillOS Notary's seventh term, issue #622, 2026-09-19. It checks state reads only: a pruned log horizon is the canary's job, and an aggregation defect is beyond what two addresses can see.";

export const KNOWN_ANSWER_FLOOR_ATOMIC = 1_000_000_000_000n; // 1,000,000 USDC

export const KNOWN_ANSWERS = Object.freeze({
  "eip155:8453": Object.freeze([
    Object.freeze({
      name: "aave-v3-ausdc-base",
      address: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
      what: "Aave V3's USDC aToken on Base, which custodies the pool's USDC",
      expect_verdict: "PAID",
      expect_balance_at_least: KNOWN_ANSWER_FLOOR_ATOMIC.toString(),
    }),
    Object.freeze({
      name: "aave-v3-ausdcn-arbitrum-seen-from-base",
      address: "0x724dc807b04555b71ed48a6896b6F41593b8C637",
      what: "the Arbitrum aToken's address, untouched on Base: zero balance at zero transaction count",
      expect_verdict: "ZERO_OBSERVED",
      expect_scope: "all_time",
    }),
  ]),
  "eip155:42161": Object.freeze([
    Object.freeze({
      name: "aave-v3-ausdcn-arbitrum",
      address: "0x724dc807b04555b71ed48a6896b6F41593b8C637",
      what: "Aave V3's USDC aToken on Arbitrum One, which custodies the pool's USDC",
      expect_verdict: "PAID",
      expect_balance_at_least: KNOWN_ANSWER_FLOOR_ATOMIC.toString(),
    }),
    Object.freeze({
      name: "aave-v3-ausdc-base-seen-from-arbitrum",
      address: "0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB",
      what: "the Base aToken's address, untouched on Arbitrum: zero balance at zero transaction count",
      expect_verdict: "ZERO_OBSERVED",
      expect_scope: "all_time",
    }),
  ]),
});

/**
 * The controls for a rail, or an empty list where none are pinned. An
 * empty list is NOT a pass — see knownAnswerRun, which refuses it.
 */
export function knownAnswersFor(caip2) {
  return KNOWN_ANSWERS[caip2] ?? [];
}

/**
 * One control against the row this reader produced for it. The row
 * comes from readDoorRail, the same function every door goes through,
 * because a control read by a private code path proves that path
 * works and nothing else.
 */
export function checkKnownAnswer(control, row) {
  const seat = { control: control.name, address: control.address, what: control.what, expected: control.expect_verdict };
  if (!row) {
    return { ...seat, ok: false, observed: null, because: "the control was never read, and a control that did not run is not a control that passed" };
  }
  if (row.read_failed) {
    return { ...seat, ok: false, observed: row.verdict ?? null, because: `the control's own state read failed (${row.read_error ?? "no reason recorded"}), so this run cannot show that it can read an address it already knows the answer for` };
  }
  if (row.verdict !== control.expect_verdict) {
    return { ...seat, ok: false, observed: row.verdict, because: `this address is known to read ${control.expect_verdict} on this rail and read ${row.verdict} instead. The instrument is wrong about an answer settled before the run began, so every other row it produced is suspect.` };
  }
  if (control.expect_scope && row.scope !== control.expect_scope) {
    return { ...seat, ok: false, observed: `${row.verdict} scope ${row.scope ?? "none"}`, because: `the verdict is right and its reach is not: this control is an all-time zero under the nonce argument and came back scoped ${row.scope ?? "none"}` };
  }
  if (control.expect_balance_at_least !== undefined) {
    const floor = BigInt(control.expect_balance_at_least);
    const seen = row.balance_atomic === undefined || row.balance_atomic === null ? null : BigInt(row.balance_atomic);
    if (seen === null) {
      return { ...seat, ok: false, observed: row.verdict, because: "the verdict is right and no balance was recorded beside it, so the number this run would publish was never checked against one that is known" };
    }
    if (seen < floor) {
      return { ...seat, ok: false, observed: `${seen} atomic`, because: `this pool holds well above ${floor} atomic units and read ${seen}. Either the decode is wrong or the control is stale; both are a human's to settle before anything is published.` };
    }
    return { ...seat, ok: true, observed: `${row.verdict}, ${seen} atomic` };
  }
  return { ...seat, ok: true, observed: row.scope ? `${row.verdict} scope ${row.scope}` : row.verdict };
}

/**
 * THE GATE. Every control passes, or nothing is published.
 *
 * A rail with no pinned controls fails too. The alternative is that
 * adding a rail silently opts it out of the check that makes the other
 * rails believable, and a guard that disappears when the reader is
 * extended is the guard failing exactly when it is needed.
 */
export function knownAnswerRun({ rail, controls = [], rows = [] } = {}) {
  const checked = controls.map((c, i) => checkKnownAnswer(c, rows[i] ?? null));
  if (controls.length === 0) {
    return {
      rail, ran: 0, passed: false, controls: checked,
      because: `no known-answer controls are pinned for ${rail}. A rail whose reader has never been shown to read a settled answer correctly publishes nothing: pin a funded address and an untouched one in KNOWN_ANSWERS first.`,
      method: KNOWN_ANSWER_METHOD,
    };
  }
  const failed = checked.filter((c) => !c.ok);
  return {
    rail,
    ran: checked.length,
    passed: failed.length === 0,
    controls: checked,
    because: failed.length === 0
      ? null
      : `${failed.length} of ${checked.length} known-answer control(s) did not return their settled answer: ${failed.map((f) => `${f.control} — ${f.because}`).join(" | ")}`,
    method: KNOWN_ANSWER_METHOD,
  };
}


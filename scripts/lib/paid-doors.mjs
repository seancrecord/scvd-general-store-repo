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

export const USDC_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
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
  return {
    ...base,
    verdict: "UNKNOWN",
    established_by: truncated
      ? `the transfer window to this address was truncated ${inWindow}, and a zero off a truncated page is refused`
      : balance === null
        ? "neither a transfer window nor a balance was read for this rail"
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

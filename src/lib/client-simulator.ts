import { DEFAULT_MAX_AMOUNT_PER_PAYMENT } from "@x402/core/client";
import { findDefaultAsset as findEvmDefaultAsset } from "@x402/evm";
import { findDefaultAsset as findSvmDefaultAsset } from "@x402/svm";

/**
 * THE PAYMENT DRY RUN (#96, 2026-08-28).
 *
 * THE QUESTION NOTHING HERE WAS ASKING. The free preflight asks
 * whether a door serves a well-formed x402 challenge — a question
 * about the DOOR. This module asks the other one: given the challenge
 * that door just served, WILL THE BUYER'S OWN CLIENT PAY IT, and what
 * will it pick? That is a question about the buyer standing in front
 * of the door, and every finding of 2026-08-28 was of that kind — the
 * `$1` ceiling that throws before a signature exists, the signing
 * window nobody chose, the client that takes accepts[0] and never
 * tries the other two rails.
 *
 * A door can pass every structural check this store publishes and
 * still be unpayable by the agent reading the verdict. Nothing free
 * anywhere told that agent so before it spent the round trip.
 *
 * THE SIMULATION IS A REPLAY, NOT A DESCRIPTION. Every step below
 * mirrors `x402Client.selectPaymentRequirements` in
 * `@x402/core/dist/cjs/client/index.js` as installed, in its order:
 *
 *   1. `applySpendControls` (line 576, ALWAYS called — the only
 *      escape is `spendControls === false` at line 606):
 *        a. the default-asset filter. An accept survives if the
 *           scheme's own `findDefaultAsset` knows its token, or if
 *           the buyer listed it in `allowedAssets`. All rejected and
 *           the client THROWS.
 *        b. the amount cap. `usdLimit` falls back to
 *           `DEFAULT_MAX_AMOUNT_PER_PAYMENT` at line 642 — `{}` is
 *           not "off", it is "on with the default". Compared as
 *           `amount <= maxAtomic`, inclusive.
 *   2. `policies` — none on a stock client.
 *   3. PREFER AUTHORIZATION: if any accept has no `paymentFlow` or
 *      `"authorization"`, the upfront/escrow ones are dropped whole.
 *   4. `paymentRequirementsSelector` — the default takes the FIRST
 *      survivor. Not the cheapest, not the best: the first.
 *
 * THE TABLE IS IMPORTED, NEVER RETYPED. `findDefaultAsset` comes
 * from `@x402/evm` and `@x402/svm` themselves, and the ceiling from
 * `@x402/core/client`, for the same reason `client-spend-cap.ts`
 * imports the cap: a simulation of a library that keeps its own copy
 * of that library's constants is a description, and descriptions
 * drift. This one can only be wrong by being out of date in lockstep
 * with the package it models.
 *
 * WHAT IT CANNOT SEE IS PUBLISHED WITH THE ANSWER (rule 52). We
 * model the version WE have installed, and a buyer's may differ; we
 * assume the stock scheme registrations; we cannot see their wallet
 * balance, their custom selector, or a policy they added. Every one
 * of those is named in the reading rather than left for them to
 * discover, because a dry run trusted past its evidence is worse
 * than no dry run at all.
 */

/** The cap as the client package writes it, e.g. "$1". */
export const SIMULATED_CAP_LABEL = String(DEFAULT_MAX_AMOUNT_PER_PAYMENT);

/**
 * An accept as it appears in a decoded PAYMENT-REQUIRED challenge.
 * Everything is optional because this reads a STRANGER's bytes: a
 * field the spec requires may simply not be there, and a simulator
 * that assumed otherwise would throw on exactly the malformed doors
 * a buyer most needs warning about.
 */
export interface ReadAccept {
  scheme?: unknown;
  network?: unknown;
  asset?: unknown;
  /** v2 spelling. */
  amount?: unknown;
  /** v1 spelling; the client reads this one when x402Version is 1. */
  maxAmountRequired?: unknown;
  maxTimeoutSeconds?: unknown;
  payTo?: unknown;
  extra?: unknown;
}

/** Where in the client's own pipeline an accept fell out. */
export type DropStage =
  | "asset-allowlist"
  | "amount-cap"
  | "prefer-authorization"
  | "not-selected";

export interface DroppedAccept {
  index: number;
  network: string;
  asset: string;
  stage: DropStage;
  why: string;
}

export interface ChosenAccept {
  index: number;
  network: string;
  asset: string;
  amount_atomic: string;
  /** Null when the asset is not one whose decimals we can resolve. */
  amount_usd: number | null;
  /** Seconds the buyer has to sign, as the door served it. */
  signing_window_seconds: number | null;
}

export interface SimulatedPayment {
  /**
   * would_sign — a stock client reaches a signature at the named
   * accept. would_throw — it refuses on the buyer's own machine,
   * before any signature exists, and the door sees a request for a
   * price followed by nothing. cannot_simulate — the challenge did
   * not parse into accepts we can walk, which is a finding about the
   * door, and the preflight is the instrument for it.
   */
  outcome: "would_sign" | "would_throw" | "cannot_simulate";
  chosen: ChosenAccept | null;
  /** The library's own error, quoted, when it throws. */
  throws_with: string | null;
  dropped: DroppedAccept[];
  /** True and worth knowing about the accept it picked. */
  hazards: { name: string; detail: string }[];
  cap_applied: string;
  what_this_cannot_see: string[];
}

/**
 * What the buyer says their client is configured to do. Everything
 * optional: the whole point is that an agent that has configured
 * NOTHING gets the honest answer for that, which is the case that
 * loses money.
 */
export interface ClientProfile {
  /**
   * `maxAmountPerPayment`. A number is dollars; `false` is the
   * buyer's deliberate "no ceiling". Absent means the default, which
   * is what an unconfigured client has.
   */
  max_amount_per_payment_usd?: number | false;
  /** `spendControls: false` — the one escape from the whole filter. */
  spend_controls_disabled?: boolean;
}

/**
 * `convertToTokenAmount` from the client package, mirrored exactly —
 * including the truncation. It pads the decimal part out to the
 * token's precision and then SLICES, so a cap with more decimals
 * than the token has is cut, not rounded. Getting that wrong by one
 * atomic unit would put our answer on the other side of an inclusive
 * comparison, which is the whole finding for a door priced at the
 * ceiling exactly.
 */
function toAtomic(decimalAmount: string, decimals: number): bigint | null {
  if (!/^\d+(?:\.\d+)?$/.test(decimalAmount)) {
    return null;
  }
  const [intPart, decPart = ""] = decimalAmount.split(".");
  const padded = decPart.padEnd(decimals, "0").slice(0, decimals);
  const digits = `${intPart}${padded}`.replace(/^0+/, "") || "0";
  return BigInt(digits);
}

/** `parseMoneyString`: strips one leading `$`, refuses anything else. */
function moneyDigits(label: string): string | null {
  const cleaned = label.replace(/^\$/, "").trim();
  return /^\d+(?:\.\d+)?$/.test(cleaned) ? cleaned : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The default-asset lookup, asked of BOTH scheme packages because
 * this store's own rails span EVM and Solana and a stranger's door
 * may be on either. Neither package throws on an unknown network —
 * both resolve the network key first and return undefined — so
 * asking both and taking whichever answers is exactly what a client
 * with both schemes registered does.
 */
function defaultAssetFor(
  asset: string,
  network: string,
): { symbol: string; decimals: number } | null {
  /*
   * Both packages type the network as a CAIP-2 template literal, and
   * this reads a stranger's bytes — so the shape is CHECKED here
   * rather than asserted away at the call. A network string that is
   * not CAIP-2 is not a lookup we can make, and saying so is the
   * honest answer; casting it would have us hand a malformed key to
   * someone else's resolver and report whatever fell out.
   */
  if (asset === "" || !/^[a-z0-9-]+:[a-zA-Z0-9._-]+$/.test(network)) {
    return null;
  }
  const caip2 = network as `${string}:${string}`;
  for (const lookup of [findEvmDefaultAsset, findSvmDefaultAsset]) {
    try {
      const found = lookup(asset, caip2) as
        | { symbol?: unknown; decimals?: unknown }
        | undefined;
      if (
        found != null &&
        typeof found.symbol === "string" &&
        typeof found.decimals === "number"
      ) {
        return { symbol: found.symbol, decimals: found.decimals };
      }
    } catch {
      // A lookup that cannot answer must not make us answer either;
      // the accept falls through to "not a default asset we can see",
      // which the reading states rather than hides.
    }
  }
  return null;
}

/**
 * Atomic units back to a dollar figure for the human reading over
 * the agent's shoulder. Divided as a STRING first, because an
 * 18-decimal token's atomic amount runs past 2^53 and
 * `Number(raw) / 10 ** decimals` would quietly round a real price
 * before anyone saw it. Null when the token's precision is unknown —
 * a number we cannot compute is omitted, never approximated.
 */
function atomicToUsd(
  raw: string,
  known: { decimals: number } | null,
): number | null {
  if (known === null || !/^\d+$/.test(raw)) {
    return null;
  }
  const padded = raw.padStart(known.decimals + 1, "0");
  const cut = padded.length - known.decimals;
  const value = Number(`${padded.slice(0, cut)}.${padded.slice(cut)}`);
  return Number.isFinite(value) ? value : null;
}

/** The raw amount, in the spelling the accept actually used. */
function amountOf(accept: ReadAccept): string {
  const v2 = text(accept.amount);
  return v2 !== "" ? v2 : text(accept.maxAmountRequired);
}

function paymentFlowOf(accept: ReadAccept): string | null {
  const extra = accept.extra;
  if (extra == null || typeof extra !== "object") {
    return null;
  }
  const flow = (extra as Record<string, unknown>)["paymentFlow"];
  return typeof flow === "string" ? flow : null;
}

function label(accept: ReadAccept): { network: string; asset: string } {
  return { network: text(accept.network), asset: text(accept.asset) };
}

/**
 * THE STANDING CAVEATS, published with every reading rather than
 * kept in a doc the buyer will not open. Each one is a real limit of
 * the method, and naming them is what keeps a dry run from being
 * quoted as a guarantee — the same discipline as the preflight's
 * single_probe_note.
 */
function cannotSee(profileGiven: boolean): string[] {
  return [
    `This models @x402/core as THIS STORE has it installed, and the ceiling it reports is that package's own exported ${SIMULATED_CAP_LABEL}. If your client is on a different version, its ceiling and its filter order are its own, and this reading is about ours.`,
    "Whether your wallet actually holds the funds, or the gas. This walks the client's selection logic; it never touches a balance.",
    "A custom paymentRequirementsSelector, an added policy, or a scheme you registered that we did not assume. Any of those changes which accept survives, and none of them is visible from here.",
    ...(profileGiven
      ? []
      : [
          "Your actual client configuration — you did not send one, so this is the reading for a client that has configured NOTHING, which is the case that loses money quietly.",
        ]),
    "Whether the door delivers after it is paid. No probe and no simulation can; that is a fact about the world, not about bytes.",
  ];
}

/**
 * Replay the stock client's selection over a door's accepts.
 *
 * Returns `cannot_simulate` rather than guessing when the challenge
 * did not yield accepts — the door's shape is the preflight's
 * question, and answering it badly here would put two instruments in
 * public disagreement about the same door, which is the exact defect
 * this store exists to find.
 */
export function simulatePayment(
  accepts: readonly ReadAccept[],
  profile: ClientProfile = {},
): SimulatedPayment {
  const profileGiven =
    profile.max_amount_per_payment_usd !== undefined ||
    profile.spend_controls_disabled === true;
  const base = {
    dropped: [] as DroppedAccept[],
    hazards: [] as { name: string; detail: string }[],
    what_this_cannot_see: cannotSee(profileGiven),
  };

  if (accepts.length === 0) {
    return {
      outcome: "cannot_simulate",
      chosen: null,
      throws_with: null,
      cap_applied: "none — there was nothing to apply it to",
      ...base,
    };
  }

  const capOff =
    profile.spend_controls_disabled === true ||
    profile.max_amount_per_payment_usd === false;
  /*
   * A BUYER-SUPPLIED CEILING GOES THROUGH THE SAME GATE as the
   * imported one. `String(1e-7)` is "1e-7", and the library's own
   * `convertToTokenAmount` throws on scientific notation — so a
   * ceiling this reader cannot express in decimal notation is
   * unreadable here too, and says so, rather than being formatted
   * into a sentence that reads like a verdict.
   */
  const capUsdText =
    profile.max_amount_per_payment_usd === undefined ||
    profile.max_amount_per_payment_usd === false
      ? moneyDigits(SIMULATED_CAP_LABEL)
      : moneyDigits(String(profile.max_amount_per_payment_usd));
  const capApplied = profile.spend_controls_disabled
    ? "none — you declared spendControls: false, which is the one escape from the whole filter"
    : capOff
      ? "none — you declared maxAmountPerPayment: false"
      : capUsdText === null
        ? `unreadable — @x402/core exports ${SIMULATED_CAP_LABEL}, which this reader cannot parse as an amount, so it declines to claim a verdict on price`
        : `$${capUsdText} per payment`;

  const dropped: DroppedAccept[] = [];
  let survivors = accepts.map((accept, index) => ({ accept, index }));

  /*
   * STEP 1a — the default-asset filter. Note the order: this runs
   * BEFORE the cap, so a non-default token is dropped without its
   * price ever being looked at. A buyer whose door is priced in
   * something other than a listed stablecoin loses it here and never
   * sees a cap message.
   */
  if (!profile.spend_controls_disabled) {
    const kept: typeof survivors = [];
    for (const entry of survivors) {
      const { network, asset } = label(entry.accept);
      if (defaultAssetFor(asset, network) != null) {
        kept.push(entry);
        continue;
      }
      dropped.push({
        index: entry.index,
        network,
        asset,
        stage: "asset-allowlist",
        why: `neither @x402/evm nor @x402/svm lists ${asset || "this asset"} as a default asset on ${network || "this network"}, and spend controls keep only default assets unless you name it in spendControls.allowedAssets.`,
      });
    }
    if (kept.length === 0) {
      return {
        outcome: "would_throw",
        chosen: null,
        throws_with:
          "All payment requirements were rejected by spendControls: only default assets or entries in spendControls.allowedAssets are allowed. Add an allowedAssets entry for non-default tokens, set allowedAssets: true, or set spendControls: false.",
        cap_applied: capApplied,
        dropped,
        hazards: [],
        what_this_cannot_see: cannotSee(profileGiven),
      };
    }
    survivors = kept;
  }

  /*
   * STEP 1b — the amount cap, applied ONLY to default assets (the
   * library returns true early for anything else) and INCLUSIVE:
   * `amount <= maxAtomic`. A door priced at exactly the ceiling
   * pays; a door one atomic unit over does not.
   */
  const capDigits = capOff ? null : capUsdText;
  if (!profile.spend_controls_disabled && capDigits !== null) {
    const kept: typeof survivors = [];
    for (const entry of survivors) {
      const { network, asset } = label(entry.accept);
      const known = defaultAssetFor(asset, network);
      const raw = amountOf(entry.accept);
      if (known === null || !/^\d+$/.test(raw)) {
        // Not a default asset, or an amount this reader cannot read
        // as atomic. The library lets both through the cap; so do we,
        // rather than inventing a refusal it would not make.
        kept.push(entry);
        continue;
      }
      const maxAtomic = toAtomic(capDigits, known.decimals);
      if (maxAtomic === null || BigInt(raw) <= maxAtomic) {
        kept.push(entry);
        continue;
      }
      dropped.push({
        index: entry.index,
        network,
        asset,
        stage: "amount-cap",
        why: `${raw} atomic units of ${known.symbol} is above your client's ${capApplied} ceiling (${maxAtomic.toString()} atomic units at ${known.decimals} decimals). The check is inclusive, so exactly the ceiling would have passed.`,
      });
    }
    if (kept.length === 0) {
      return {
        outcome: "would_throw",
        chosen: null,
        throws_with: `All payment requirements were filtered out by spendControls for x402 version: 2 — every accept this door offered is priced above ${capApplied}. The client refuses on YOUR machine, before it signs anything, so the door never learns you tried.`,
        cap_applied: capApplied,
        dropped,
        hazards: [],
        what_this_cannot_see: cannotSee(profileGiven),
      };
    }
    survivors = kept;
  }

  /*
   * STEP 3 — prefer authorization. If ANY accept is authorization
   * (or declares no flow at all), the upfront and escrow ones are
   * dropped whole. A door offering both gets its escrow rail
   * silently ignored by every stock client.
   */
  const authorizationOnly = survivors.filter((entry) => {
    const flow = paymentFlowOf(entry.accept);
    return flow === null || flow === "authorization";
  });
  if (authorizationOnly.length > 0 && authorizationOnly.length < survivors.length) {
    for (const entry of survivors) {
      if (authorizationOnly.includes(entry)) {
        continue;
      }
      const { network, asset } = label(entry.accept);
      dropped.push({
        index: entry.index,
        network,
        asset,
        stage: "prefer-authorization",
        why: `paymentFlow is ${paymentFlowOf(entry.accept)}, and the client drops upfront and escrow flows whole whenever an authorization flow survives alongside them.`,
      });
    }
  }
  if (authorizationOnly.length > 0) {
    survivors = authorizationOnly;
  }

  /*
   * STEP 4 — the selector. The default takes the FIRST survivor. Not
   * the cheapest, not the nearest, not a retry across the rest: the
   * first. Everything after it is listed as not-selected so a buyer
   * reading a three-rail door can see that two of them are decoration
   * for them specifically.
   */
  const winner = survivors[0]!;
  for (const entry of survivors.slice(1)) {
    const { network, asset } = label(entry.accept);
    dropped.push({
      index: entry.index,
      network,
      asset,
      stage: "not-selected",
      why: "the default paymentRequirementsSelector takes the first surviving accept and @x402/fetch pays once. This one is never attempted, including if the chosen payment fails.",
    });
  }

  const { network, asset } = label(winner.accept);
  const known = defaultAssetFor(asset, network);
  const raw = amountOf(winner.accept);
  const windowSeconds =
    typeof winner.accept.maxTimeoutSeconds === "number"
      ? winner.accept.maxTimeoutSeconds
      : null;

  const hazards: { name: string; detail: string }[] = [];

  /*
   * THE HAZARDS ARE ABOUT THE ACCEPT IT PICKED, not the door in
   * general. A buyer who has just been told "you will sign accept 0"
   * needs to know what accept 0 commits them to, and each of these
   * is a thing this store learned by losing something to it.
   */
  if (windowSeconds === null) {
    hazards.push({
      name: "signing-window-unstated",
      detail:
        "This accept carries no maxTimeoutSeconds. The server library writes 300 onto every accept it builds (`resourceConfig.maxTimeoutSeconds || 300`), so an accept served without one did not come from that path — you cannot tell from these bytes how long the door will honour your signature.",
    });
  } else {
    hazards.push({
      name: "signing-window",
      detail: `You have ${windowSeconds} seconds from the challenge to get a signed payment back. That is the door's number, not a protocol constant — this store publishes its own at 300 for exactly this reason, and a door that inherited the library default without choosing it has the same number for a different reason.`,
    });
  }

  if (survivors.length > 1 || accepts.length > 1) {
    hazards.push({
      name: "no-rail-fallback",
      detail: `This door offered ${accepts.length} accept${accepts.length === 1 ? "" : "s"} and your client will attempt exactly one. wrapFetchWithPayment builds one payload, sends it, and retries only if a hook returns {recovered: true} — there is no loop over the remaining accepts. If this payment fails, the others are not tried.`,
    });
  }

  hazards.push({
    name: "valid-after-zero",
    detail:
      "On the EIP-3009 path the client signs validAfter: \"0\" — the authorization is live the instant it exists, not when you decide to submit it. Treat a signed payment as spendable from the moment of signature.",
  });

  return {
    outcome: "would_sign",
    chosen: {
      index: winner.index,
      network,
      asset,
      amount_atomic: raw,
      amount_usd: atomicToUsd(raw, known),
      signing_window_seconds: windowSeconds,
    },
    throws_with: null,
    cap_applied: capApplied,
    dropped,
    hazards,
    what_this_cannot_see: cannotSee(profileGiven),
  };
}

import { bulkGetJson } from "@/lib/kv-bulk";
import type { MetricEvent } from "@/lib/metrics";
import type { Env } from "@/types";

/**
 * THE DECLINE DESK.
 *
 * A decline is the rarest and most valuable row in the books: somebody
 * opened a wallet at our door and did not get through. Every other
 * number here measures attention. This one measures INTENT, which is
 * the thing the store has been short of since it opened.
 *
 * The reasons have been recorded since the instrument went in
 * (metrics.recordPaymentDecline writes them onto the event row's note
 * field). Nothing rendered them until 2026-07-28, which meant the one
 * number worth acting on lived in raw KV rows nobody could read. The
 * census page even said "the decline reasons are on the desk" — they
 * were not on any desk, and that sentence was written by the same hand
 * that built the census. A claim published without a surface behind it
 * is the auto-refund mistake in a smaller hat.
 *
 * THE QUESTION THIS PAGE EXISTS TO ANSWER: whose problem is it? A
 * buyer whose wallet is short is a market fact and there is nothing to
 * fix. A signature we rejected for a reason of our own making is an
 * emergency, because it means the store turned away money it could
 * have taken.
 */

const SCAN_CAP = 3000;
const LIST_PAGE = 1000;

/** Where in the flow it died. The two failures are not the same failure. */
export type DeclineStage = "verify" | "settle";

/**
 * Whose problem it is. Deliberately coarse — buckets a keeper can act
 * on, not a taxonomy. "facilitator" earned its place 2026-08-07, when
 * three verified payments died on the facilitator's own 502s and the
 * desk could only say "unknown": an upstream outage is not the buyer's
 * problem, not ours, and NOT unknown — it is known and it is theirs.
 */
export type DeclineFault = "buyer" | "ours" | "facilitator" | "unknown";

export interface DeclineRow {
  at: string;
  item: string;
  /** The facilitator's verdict, verbatim. Never paraphrased. */
  reason: string;
  stage: DeclineStage;
  fault: DeclineFault;
  /** What that reason means in plain words, and what to do about it. */
  reading: string;
  user_agent?: string;
  channel: string;
  house: boolean;
}

export interface DeclineReport {
  rows_scanned: number;
  capped: boolean;
  declines: DeclineRow[];
  /** Outside declines only — the house testing is not a lost sale. */
  outside_count: number;
  /** Distinct outside clients that ever hit a decline. */
  outside_clients: string[];
  /** Reason string -> how many times, outside only. */
  by_reason: Record<string, number>;
  /**
   * Declines recorded with no reason attached. The verify-side reason
   * is remembered in-isolate by nonce, so a cross-isolate retry can
   * lose it; a high count here means the instrument is the problem,
   * not the buyer.
   */
  unspecified: number;
}

/**
 * Reading a reason. Matching is on substrings because the exact
 * strings belong to the facilitator and will change without telling
 * us — but the RAW REASON IS ALWAYS SHOWN alongside, so a wrong guess
 * here can never hide the real one.
 */
export function readReason(raw: string): {
  fault: DeclineFault;
  reading: string;
} {
  const reason = raw.toLowerCase();

  // The local refusals come first, because their codes carry a field
  // name that would otherwise trip a substring rule below and get read
  // as a facilitator verdict it never was.
  if (reason.startsWith("local:requirement_mismatch")) {
    const field = reason.split(":")[2] ?? "";
    if (field === "resource") {
      return {
        fault: "ours",
        reading:
          "The client echoed our own requirement back and the RESOURCE URL no longer matched. That is usually ours: the challenge was issued at one URL and the retry arrived at another — a dropped or added query parameter is enough. Check what we put in resource against what the client is retrying.",
      };
    }
    if (field.startsWith("extra")) {
      return {
        fault: "buyer",
        reading:
          "The client's accepted.extra disagreed with what we published — they rebuilt the object instead of echoing ours. The values are in the challenge; /try#hand-rolling says so in plain words. Nothing to fix here.",
      };
    }
    return {
      fault: "buyer",
      reading:
        "The client's `accepted` object did not deep-equal any entry we offered, so the payment was refused BEFORE the facilitator was called — which is why the stage says verify and no facilitator string exists. The named field is the disagreement. Almost always a hand-rolled client rebuilding the object rather than echoing ours back verbatim.",
    };
  }
  // The books carry `<verdict>+payload:<field>` when the facilitator's
  // answer was opaque and we could read the shape ourselves. The
  // verdict is the fact; ours is the reading, and it goes second.
  if (reason.includes("+payload:")) {
    const field = raw.split("+payload:")[1] ?? "";
    return {
      fault: "buyer",
      reading: `The facilitator refused without a legible reason, so this is OUR reading of the payload it judged: ${field} is not in the one legal form that field has. CDP's schema error arrives truncated at 200 characters — the variant list is cut off before it reaches us — so this is the best answer available, and it is a reading rather than its verdict. The 402 carried the full field list under payload_problems.`,
    };
  }
  if (reason.startsWith("local:payload_")) {
    return {
      fault: "buyer",
      reading:
        "The payment envelope was the wrong SHAPE — a field the protocol requires was absent, so there was nothing to compare and the signature was never examined. Not a signing problem and not a funds problem. The message beside this says which field and lists what did arrive.",
    };
  }
  if (reason === "local:sdk_threw") {
    return {
      fault: "buyer",
      reading:
        "The x402 library raised an exception while reading the payment payload, and its text is in the message. It reads like a crash and is not one: the library destructures fields it expects to exist, so an absent field surfaces as a TypeError. Treat the named field as the diagnosis. If the message does NOT name a payload field, escalate — that one would be ours.",
    };
  }
  if (reason.startsWith("local:")) {
    return {
      fault: "unknown",
      reading:
        "The x402 SDK refused this before the facilitator saw it, and its own words are in the message beside this reading. No hook fires on that path, so this line exists to keep the reason from vanishing.",
    };
  }
  /**
   * BEFORE the substring guesses below, deliberately: everything after
   * "(5xx):" is the facilitator's raw HTTP response body, which is
   * arbitrary text — Cloudflare's canned "error code: 502" today,
   * anything tomorrow — and must not be allowed to trip a rule written
   * for a real verdict string.
   *
   * First seen live 2026-08-07: a verified buyer, three settles, three
   * 502s in one minute, and the desk read "unknown". The signature had
   * already cleared, so the payload, the amount, and the buyer's wallet
   * are all known-good — the facilitator's settle endpoint simply did
   * not answer. The @x402/core client builds this exact string when
   * POST /settle returns a non-OK status (the number in parentheses).
   */
  if (/facilitator settle failed \(5\d\d\)/.test(reason)) {
    return {
      fault: "facilitator",
      reading:
        "The facilitator's own settle endpoint errored (the 5xx in parentheses is its HTTP status; the text after the colon is its raw response body). The signature had already VERIFIED, so the buyer and the payload are fine and there is nothing to fix on either side — the payment rail was down. Transient: the till now retries one settle on this shape before booking the decline. One caveat: a 5xx is an AMBIGUOUS outcome, so if one recurs, check the bank reconciliation for an orphan transfer around this timestamp — the rare settle that landed on-chain while its response died would surface there.",
    };
  }
  if (reason.includes("insufficient") || reason.includes("balance")) {
    return {
      fault: "buyer",
      reading:
        "The buyer's wallet was short. Nothing to fix here — this is a market fact, and it is the good kind of decline: they wanted to and could not.",
    };
  }
  if (reason.includes("expired") || reason.includes("valid_before")) {
    return {
      fault: "buyer",
      reading:
        "The authorization had expired by the time it reached us. Usually a slow client, sometimes a retry of an old signature. Not ours unless it repeats.",
    };
  }
  if (reason.includes("valid_after")) {
    return {
      fault: "buyer",
      reading:
        "The authorization was not valid yet — the client's clock is ahead of the chain's. Theirs to fix, but worth saying kindly in the 402.",
    };
  }
  if (reason.includes("already") || reason.includes("replay")) {
    return {
      fault: "buyer",
      reading:
        "A nonce we have already settled once. The register refused a double-spend, which is correct. If it repeats from one client, they are retrying instead of re-signing, and the 402 wording is what should change.",
    };
  }
  if (reason.includes("network") || reason.includes("scheme")) {
    return {
      fault: "ours",
      reading:
        "The client signed for a different network or scheme than we advertise. That is a DISCOVERY failure on our side: what we published did not match what we accept. Check /.well-known/x402.json and the 402 accepts block.",
    };
  }
  if (
    reason.includes("recipient") ||
    reason.includes("payto") ||
    reason.includes("amount")
  ) {
    return {
      fault: "ours",
      reading:
        "The payment was built against a recipient or amount we did not accept. Almost always our published requirements disagreeing with our gate — the most fixable decline there is, and the most expensive to leave alone.",
    };
  }
  if (reason.includes("signature") || reason.includes("invalid")) {
    return {
      fault: "unknown",
      reading:
        "The signature did not verify. Could be a broken client; could be us advertising requirements that cannot be signed as stated. If one client hits this repeatedly, assume it is ours until proven otherwise.",
    };
  }
  if (reason === "unspecified:no_nonce_in_payload") {
    return {
      fault: "ours",
      reading:
        "The payload carried no exact-EVM authorization nonce at all — which usually means the client signed for a scheme or network we do not accept. Strongly suggests a DISCOVERY mismatch on our side: check that /.well-known/x402.json and the 402 accepts block advertise only what the gate will take.",
    };
  }
  if (reason === "unspecified:reason_not_captured") {
    return {
      fault: "unknown",
      reading:
        "A nonce existed and the verify hook still left no reason behind. INSTRUMENT gap, not a buyer signal. Rows dated 2026-07-28 or earlier are explained: the SDK refuses in three places and only the last one has a hook on it, so a requirement mismatch or an extension refusal left the slot empty by design. Those refusals now read the SDK's own words out of the 402 body and book as `local:...`. If THIS label appears on a row after that fix, the hook genuinely is not firing.",
    };
  }
  if (reason === "unspecified" || reason.startsWith("unspecified")) {
    return {
      fault: "unknown",
      reading:
        "The decline was booked but the reason did not survive. This is an INSTRUMENT gap, not a buyer signal — and if it is common, the instrument is what needs fixing first. Rows from before 2026-07-28 predate the per-request slot and were subject to a nonce join that could miss silently.",
    };
  }
  return {
    fault: "unknown",
    reading:
      "No reading written for this reason yet. Take the raw string as the fact and add a line here once you know what it means.",
  };
}

/** Walks the raw rows newest-first and reads every decline. */
export async function readDeclines(
  env: Env,
  scanCap = SCAN_CAP,
): Promise<DeclineReport> {
  const report: DeclineReport = {
    rows_scanned: 0,
    capped: false,
    declines: [],
    outside_count: 0,
    outside_clients: [],
    by_reason: {},
    unspecified: 0,
  };
  const clients = new Set<string>();

  let cursor: string | undefined;
  while (report.rows_scanned < scanCap) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: LIST_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    const names = listed.keys.map((key) => key.name);
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      if (report.rows_scanned >= scanCap) {
        report.capped = true;
        break;
      }
      const event = values.get(name);
      if (!event) continue;
      report.rows_scanned += 1;
      if (event.kind !== "decline") continue;

      const raw = event.note ?? "unspecified";
      // The settle-side path prefixes with "settle:"; strip it for the
      // reading but keep the stage, because verifying and settling are
      // different failures with different owners.
      const stage: DeclineStage = raw.startsWith("settle:")
        ? "settle"
        : "verify";
      const bare = raw.startsWith("settle:") ? raw.slice(7) : raw;
      const { fault, reading } = readReason(bare);

      report.declines.push({
        at: event.at,
        item: event.item,
        reason: raw,
        stage,
        fault,
        reading,
        ...(event.user_agent ? { user_agent: event.user_agent } : {}),
        channel: event.channel,
        house: event.house,
      });

      if (!event.house) {
        report.outside_count += 1;
        report.by_reason[raw] = (report.by_reason[raw] ?? 0) + 1;
        clients.add(event.user_agent ?? "(no user-agent)");
        if (bare === "unspecified") {
          report.unspecified += 1;
        }
      }
    }
    if (listed.list_complete || report.rows_scanned >= scanCap) {
      report.capped = report.capped || !listed.list_complete;
      break;
    }
    cursor = listed.cursor;
  }

  report.outside_clients = [...clients];
  return report;
}

/**
 * Everything one client did at a priced door, in order. When a real
 * buyer bounces, the sequence is the evidence: which items they tried,
 * how many 402s they read first, and whether the declines changed
 * reason between attempts.
 */
export async function traceClient(
  env: Env,
  userAgent: string,
  scanCap = SCAN_CAP,
): Promise<MetricEvent[]> {
  const trail: MetricEvent[] = [];
  let cursor: string | undefined;
  let scanned = 0;
  while (scanned < scanCap) {
    const listed = await env.COUNTERS.list({
      prefix: "evt:",
      limit: LIST_PAGE,
      ...(cursor ? { cursor } : {}),
    });
    const names = listed.keys.map((key) => key.name);
    scanned += names.length;
    const values = await bulkGetJson<MetricEvent>(env.COUNTERS, names);
    for (const name of names) {
      const event = values.get(name);
      if (event && (event.user_agent ?? "(no user-agent)") === userAgent) {
        trail.push(event);
      }
    }
    if (listed.list_complete) break;
    cursor = listed.cursor;
  }
  // Rows arrive newest-first; the sequence reads forward.
  return trail.reverse();
}

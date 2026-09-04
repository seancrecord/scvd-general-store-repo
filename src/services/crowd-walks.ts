import { bulkGetJson } from "@/lib/kv-bulk";
import { KV_KEYS, currentWeekKey } from "@/lib/kv-keys";
import { listKeys } from "@/lib/kv-list";
import { payToDigest } from "@/lib/pay-to-digest";
import type { BountyRecord } from "@/services/bounty-board";
import type { Env } from "@/types";

/*
 * THE COLLECTOR CANNOT PAY, and this module is on the collector's side
 * of that line. The ward round seals rows from here, so nothing here
 * may reach a signing-capable module even dynamically —
 * test/collector-cannot-pay.spec.ts walks the import graph and CI
 * refused the first draft, which borrowed the board's own reader and
 * with it the board's path to the field signer. The records are read
 * straight off KV instead; the type import above erases.
 */

/**
 * CROWD-WALKED ROWS, INTO THE RECORD (2026-09-04).
 *
 * BOUNTY_BOARD.md promised from the day the board opened that a
 * shopper's chain-verified settlement enters the corpus at its own
 * tier — "settled (chain-verified, crowd-walked)", below the house's
 * own walks, never blended. The keeper read the first paid claim and
 * asked where the data went. Nowhere: the promise was prose. This is
 * the row.
 *
 * WHAT A ROW IS. Two facts of this store's and one claim of the
 * walker's, kept apart on the row itself:
 *
 *   settlement   — the chain's part, verified by this store when it
 *                  paid: the transaction, the block, the amount, the
 *                  rail. Proven.
 *   house_probe  — this store's own unpaid knock at the door at the
 *                  moment of the claim, the census's battery. Ours.
 *   observation  — whatever the walker typed. THEIRS, and it does not
 *                  ride the signed record verbatim: the corpus chain
 *                  cannot unsign, a stranger's free text may carry
 *                  anything, and a signed row that quotes it would
 *                  lend it the store's signature. The row carries its
 *                  length and sha256, so the text on the bounty record
 *                  can be matched to the row forever without the row
 *                  vouching for a word of it. "What if they type
 *                  nonsense?" — then nonsense stays on the record,
 *                  labelled, and never enters the chain.
 *
 * NO VERBATIM WALLET (the G2 ruling): the payer and the payTo ride
 * as the salted, publicly recomputable digests the ward round already
 * uses, from the first write — this row is born sealed.
 *
 * The rows are assembled when a ward round is sealed, from the paid
 * bounties claimed inside that ISO week, and freeze into the weekly
 * corpus snapshot with everything else on the round.
 */
export interface CrowdWalk {
  tier: "crowd-walked";
  bounty_id: string;
  host: string;
  url: string;
  network: string;
  settlement: {
    tx_hash: string;
    /** Absent on claims paid before the block was kept. */
    block?: number;
    amount_usd: number;
    payer_digest: string;
    pay_to_digest: string;
  };
  claimed_at: string;
  house_probe?: NonNullable<BountyRecord["claim"]>["house_probe"];
  /** Present when the walker wrote anything; the text itself stays off the row. */
  observation?: { length: number; sha256: string };
}

/** Rows per week, bounded: the board's own cap is the bound. */
const CROWD_WALK_CAP = 100;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** One bounty's paid claim as a corpus row. Exported for the test. */
export async function crowdWalkRow(bounty: BountyRecord): Promise<CrowdWalk | null> {
  const claim = bounty.claim;
  if (bounty.status !== "paid" || !claim) return null;
  const row: CrowdWalk = {
    tier: "crowd-walked",
    bounty_id: bounty.bounty_id,
    host: bounty.domain,
    url: bounty.target_url,
    network: bounty.network ?? "eip155:8453",
    settlement: {
      tx_hash: claim.tx_hash,
      ...(claim.settled_block !== undefined ? { block: claim.settled_block } : {}),
      amount_usd: bounty.amount_usd,
      payer_digest: await payToDigest(claim.payer),
      pay_to_digest: await payToDigest(bounty.pay_to),
    },
    claimed_at: claim.claimed_at,
    ...(claim.house_probe ? { house_probe: claim.house_probe } : {}),
    ...(claim.observation
      ? {
          observation: {
            length: claim.observation.length,
            sha256: await sha256Hex(claim.observation),
          },
        }
      : {}),
  };
  return row;
}

/**
 * The paid claims of one ISO week, as rows, oldest first — with
 * whether this reading could see all of them.
 *
 * A LOOKUP THAT CANNOT SEE EVERYTHING MUST NOT ANSWER "NO", and this
 * one feeds a SIGNED record: a row set that quietly stopped at a cap
 * would put "these are the week's crowd walks" into the corpus chain
 * with a walk missing and no way to unsign it. So both bounds are
 * read and reported — the KV listing's own `truncated`, and this
 * module's row cap — and the round records the flag beside the rows.
 */
export interface CrowdWalkPass {
  rows: CrowdWalk[];
  /** True when a paid claim of this week may not be in `rows`. */
  truncated: boolean;
}

export async function crowdWalksForWeek(
  env: Env,
  week: string,
): Promise<CrowdWalkPass> {
  const listed = await listKeys(env.COUNTERS, {
    prefix: KV_KEYS.bountyPrefix,
    cap: 200,
  });
  const records = await bulkGetJson<BountyRecord>(env.COUNTERS, listed.names);
  const paid = [...records.values()].filter(
    (bounty): bounty is BountyRecord =>
      Boolean(bounty) &&
      bounty!.status === "paid" &&
      Boolean(bounty!.claim) &&
      currentWeekKey(new Date(bounty!.claim!.claimed_at)) === week,
  );
  paid.sort((a, b) =>
    (a.claim?.claimed_at ?? "").localeCompare(b.claim?.claimed_at ?? ""),
  );
  const rows: CrowdWalk[] = [];
  for (const bounty of paid.slice(0, CROWD_WALK_CAP)) {
    const row = await crowdWalkRow(bounty);
    if (row) rows.push(row);
  }
  return {
    rows,
    // The board's key space ran past the listing cap, or this week's
    // paid claims ran past the row cap. Either way the set is a floor.
    truncated: listed.truncated || paid.length > CROWD_WALK_CAP,
  };
}

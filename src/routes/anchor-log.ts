import { Hono } from "hono";
import {
  ANCHOR_SCAN_CAP,
  canonicalizeSnapshot,
  listAnchors,
  verifyChain,
} from "@/services/anchor-log";
import type { HonoEnv } from "@/types";

/**
 * GET /.well-known/anchor-log.json — the externally timestamped hash
 * chain over this store's key state, published so it can be checked.
 *
 * A COMMITMENT NOBODY HAS TO TAKE OUR WORD FOR. Each entry hashes the
 * key state plus the previous entry's digest, and the digests are
 * submitted to OpenTimestamps, which aggregates them into Bitcoin.
 * Once a proof upgrades to Bitcoin-confirmed, "this key state existed
 * before block N" is a fact about the Bitcoin chain rather than a
 * claim on this page — which is exactly the property a self-hosted,
 * mutable key registry cannot have on its own.
 *
 * THE SNAPSHOTS ARE PUBLISHED IN FULL because a digest whose input
 * nobody can reproduce is a number. Every field the hash covers is
 * here, in the order it is hashed in.
 *
 * WHAT IT DOES NOT PROVE, said plainly and first: it proves WHEN, never
 * WHO SHOULD HAVE. A thief holding this store's key could sign
 * artifacts and get them timestamped exactly as validly as we can.
 * What the log buys is a forensic timeline that bounds a compromise
 * rather than a defence that prevents one, and those are different
 * things.
 */
export const anchorLogRoutes = new Hono<HonoEnv>();

anchorLogRoutes.get("/.well-known/anchor-log.json", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const records = await listAnchors(c.env);
  const problems = await verifyChain(records);
  const pending = records.filter((r) => r.ots?.status === "pending").length;
  const complete = records.filter((r) => r.ots?.status === "complete").length;

  return c.json({
    what_this_is:
      "An append-only hash chain over this store's signing-key state. Each entry commits to the entry before it, and the digests are submitted to OpenTimestamps, which anchors them into Bitcoin. One confirmed anchor vouches for the whole history behind it.",
    what_it_does_not_prove:
      "It proves WHEN, never WHO SHOULD HAVE. Anyone holding this store's key — including a thief — could sign and timestamp just as validly. This bounds a compromise window after the fact; it does not prevent one. The defence against theft is the succession protocol at /attestation, and it is a separate thing.",
    how_to_check_without_trusting_us: [
      "1. Take any entry's `snapshot` and re-serialize it in the field order shown in `canonical_form_note`, then SHA-256 it. It must equal that entry's `digest`.",
      "2. Check `previous_digest` equals the digest of the entry before it. A break anywhere means history was altered.",
      "3. Base64-decode `ots.proof_base64` into a .ots file and run `ots verify` (the standard OpenTimestamps client) against the digest. An upgraded proof verifies against Bitcoin block headers with no calendar server, no OpenTimestamps infrastructure, and nothing from us. THIS IS THE STEP THAT SETTLES IT — the status word below is our bookkeeping, and step 3 is the fact.",
      "4. THE STEP THAT ACTUALLY CATCHES BACKDATING, and the reason the other three exist: compare the Bitcoin block time `ots verify` reports against the `taken_at` inside that entry's snapshot. They should be close — we submit within a day and confirmation takes an hour or two. A snapshot claiming an OLD taken_at whose proof lands in a MUCH later block is an entry written after the fact and stamped later, which is exactly the forgery this log is built to make visible. Steps 1-3 prove the chain is internally consistent; only this step ties it to time we do not control.",
      "5. A `pending` proof is a calendar's promise, not yet a Bitcoin commitment. Weigh it accordingly — it usually confirms within a couple of hours.",
      "6. What this cannot catch: if this store's KV were wiped and a fresh chain started at sequence 1, it would look genuine to a reader who had never seen the old one. Defence is the same as for any transparency log — if you rely on this, keep the digest you last saw. A chain that no longer contains it has been replaced, not extended.",
    ],
    canonical_form_note:
      "version, sequence, taken_at, previous_digest, current_public_key, retired_keys (sorted by retired_on then public_key, each {public_key, retired_on}), artifacts_issued_total. JSON with no whitespace, exactly these keys in exactly this order.",
    chain_length: records.length,
    /**
     * ONE WORD, PUBLISHED AT THE SOURCE, so no reader downstream can
     * collapse "submitted" and "confirmed" into one green checkmark.
     *
     * The state that earns this field is `pending_only`: a chain whose
     * proofs are ALL pending is exactly the state a chain rewritten
     * TODAY would be in — nothing has confirmed yet, so nothing exists
     * that could contradict a rewrite. Reporting that as "anchored"
     * would be publishing an attacker's best case as if it were ours.
     * Counted here rather than left for each consumer to derive,
     * because a distinction every reader must rediscover is one most
     * readers will lose.
     */
    anchor_confidence:
      problems.length > 0
        ? "chain_broken"
        : complete > 0
          ? "confirmed"
          : pending > 0
            ? "pending_only"
            : "unanchored",
    anchor_confidence_note:
      "confirmed = at least one entry's timestamp is Bitcoin-backed, which vouches for the whole chain behind it. pending_only = submitted and accepted by a calendar, nothing confirmed — weakest state that still looks like progress, and the same state a same-day rewrite would show. unanchored = nothing submitted yet. chain_broken = the log does not recompute, and the rest is moot.",
    ots_complete: complete,
    ots_pending: pending,
    /**
     * WHAT OUR OWN STATUS WORD MEANS, because we do not parse the
     * proofs we serve. "complete" means a calendar handed back an
     * upgraded timestamp when we asked; per the OpenTimestamps
     * protocol that happens once the commitment is in a confirmed
     * block, but WE did not check a Bitcoin header — we deliberately
     * do not ship a second OTS implementation to be wrong. Step 3
     * above is the check that settles it, and this line exists so
     * nobody reads our bookkeeping as our verification.
     */
    what_our_status_word_means:
      "`complete` means a calendar returned an upgraded proof when we asked, not that this store verified it against Bitcoin. We do not parse OTS proofs — writing a second implementation to be wrong would be worse than serving the bytes. Run `ots verify` yourself; that is the fact, this is our bookkeeping.",
    /**
     * Our own verification of our own chain, published for what it is
     * worth — which is: it catches accidents, not us. A reader who
     * wants the real answer runs step 1 above themselves. Published
     * anyway because an empty problems list that we would have had to
     * fake is more honest than not showing the check at all.
     */
    self_check: problems.length === 0 ? "no breaks found" : problems,
    scan_cap: ANCHOR_SCAN_CAP,
    truncated: records.length >= ANCHOR_SCAN_CAP,
    entries: records.map((record) => ({
      snapshot: record.snapshot,
      digest: record.digest,
      canonical_form: canonicalizeSnapshot(record.snapshot),
      ots: record.ots ?? { status: "not submitted yet" },
    })),
    key_history: `${base}/.well-known/scvd-signing-key`,
    succession_protocol: `${base}/attestation`,
  });
});

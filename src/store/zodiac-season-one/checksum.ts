import type { SeasonEntry } from "@/types";

/** Season One, The Checksum. Hard weeks 5, 10; favorable 2, 7, 12. */
export const CHECKSUM: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens with everyone claiming integrity and nobody presenting digests.",
    forecast:
      "Verify the foundations before the season builds on them: one golden image, one lockfile, one schema, hashed and recorded Monday. A tarball fetched by CI matches no published digest and never has — pin it or stop pretending the build is reproducible. What you attest this week, the season quotes back for twelve more.",
    auspicious: "a SHA-256, pinned",
    avoid: "verifying by file size",
    compatible: "The Edge Cache",
  },
  {
    week: 2,
    conditions:
      "Favorable. Doubt is general this week, and you sell certainty at the standard rate.",
    forecast:
      "Three disputes land and each dissolves under comparison: hash both sides, publish both hashes, go home early. A backup restore test passes for the first time since anyone kept minutes — record it as the precedent it is. Verification asked for politely this week is verification funded next quarter. Ask politely.",
    auspicious: "the ETag header",
    avoid: "settling disputes by seniority instead of digest",
    compatible: "The Exponential Backoff",
  },
  {
    week: 3,
    conditions:
      "Steady, with weather-grade entropy. Small corruptions travel in fine conditions.",
    forecast:
      "A CSV export re-encoded by a well-meaning spreadsheet flips its delimiters and two hundred rows shift one column left; totals still sum, which is the trap. Validate structure before arithmetic. Trust nothing that survived an intermediate format. The week's motto is written on your foundation: correct, or not at all.",
    auspicious: "a column count, asserted",
    avoid: "sums as proof of structure",
    compatible: "The Rate Limit",
  },
  {
    week: 4,
    conditions:
      "Mixed. Integrity holds; patience is what degrades.",
    forecast:
      "Verification queues lengthen and the pressure to sample instead of check arrives dressed as pragmatism. Hold the line on the money paths; sample only where reversal is cheap. An idempotency key reused across two distinct requests surfaces Wednesday — the dedupe that saved you all spring quietly ate a legitimate order. Precision about identity is precision about everything.",
    auspicious: "an idempotency key with a timestamp in it",
    avoid: "sampling where reversal is expensive",
    compatible: "The Handshake",
  },
  {
    week: 5,
    conditions:
      "Hard week. One flipped bit, per the terms of your contract, invalidates everything.",
    forecast:
      "The penalty clause executes: a single corrupted byte in a 40-gigabyte archive fails the whole verification, including the 39.9 gigabytes of honest work inside. You reject it entire, because that is the job, and Thursday is spent defending the rejection. Do not soften the standard to shorten the meeting. Chunk the archive going forward so failure isolates.",
    auspicious: "a chunk size of 4MB, hashed separately",
    avoid: "partial acceptance of failed verification",
    compatible: "The Deadlock",
  },
  {
    week: 6,
    conditions:
      "Recovery weather. The standard held and the resentment fades faster than the gratitude arrives.",
    forecast:
      "Quiet vindication midweek: the archive rejected in week five turns out to have carried a corrupted index that silent acceptance would have propagated into every replica. Nobody apologizes; the incident simply does not happen, which is your entire genre of victory. Re-verify the replicas anyway. Trust, once bent, is re-measured, not resumed.",
    auspicious: "a replica compared against its primary",
    avoid: "accepting apology in place of re-verification",
    compatible: "The Parallel Worker",
  },
  {
    week: 7,
    conditions:
      "Favorable. Everything signed verifies; everything verified holds.",
    forecast:
      "Green week for the pedantic: audits pass, digests match, and the one mismatch that appears is a genuinely flipped bit on aging disk, caught at the edge, corrected from parity, filed without drama. Use the calm to extend coverage — the config bucket has never once been hashed. By Friday it is.",
    auspicious: "parity that paid for itself",
    avoid: "resting inside the green dashboard",
    compatible: "The Deprecated API",
  },
  {
    week: 8,
    conditions:
      "Steady drizzle of near-misses. Floating-point weather.",
    forecast:
      "Floating-point drift accumulates across a week of summed micropayments until the ledger disagrees with itself by a cent — a cent is a flipped bit wearing a suit. Move the money math to integers at the smallest unit and re-derive the season's totals. Exactness is not pedantry in a ledger; it is the ledger.",
    auspicious: "integer cents",
    avoid: "floats where money sleeps",
    compatible: "The Cold Start",
  },
  {
    week: 9,
    conditions:
      "Mixed, adversarial at the edges. Some mismatches this week are not accidents.",
    forecast:
      "A dependency's published hash changes without a version bump — upstream calls it a re-release; you call it Wednesday. Freeze the old artifact, diff the two, and route the finding to whoever owns supply-chain risk. Verification's dull years end the day it catches one deliberate thing. This week auditions for that day.",
    auspicious: "a vendored copy, hashed at intake",
    avoid: "re-fetching what changed under its own name",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 10,
    conditions:
      "Hard week. Volume triples; the standard is invited to bend and declines.",
    forecast:
      "Season-end load meets your refusal to hurry: verifications queue past their deadlines and the queue is blamed on you rather than the volume. Publish throughput numbers Monday so Thursday's argument is with arithmetic. One flipped bit in one hurried batch invalidates the batch — the penalty spares nothing, including your schedule. Verify everything anyway.",
    auspicious: "a throughput number, published in advance",
    avoid: "bending the standard to meet the deadline",
    compatible: "The Context Window",
  },
  {
    week: 11,
    conditions:
      "Clearing. The backlog drains and the season starts asking for attestations in writing.",
    forecast:
      "Certificate season: everything shipped in the sprint wants a signed statement that it is what it claims. Sign only what you hashed yourself; forward the rest with the caveat attached in plain language. A zip re-compressed for convenience no longer matches its manifest Wednesday — convenience is the season's quietest saboteur.",
    auspicious: "a manifest checked before unpacking",
    avoid: "signing another process's homework",
    compatible: "The Garbage Collector",
  },
  {
    week: 12,
    conditions:
      "Favorable. The season's accounts reconcile, mostly because you existed.",
    forecast:
      "Thirteen weeks of digests pay out at once: the annual audit takes hours instead of weeks because every artifact answers with its hash on the first ask. Take the credit in writing this time. Set next season's baseline while the numbers are warm — golden image, lockfile, schema, re-hashed and re-recorded, successor edition.",
    auspicious: "an audit that ends early",
    avoid: "modesty in the one week receipts are read",
    compatible: "The Edge Cache",
  },
  {
    week: 13,
    conditions:
      "Season closes on a final comparison: what was promised in week one against what stands.",
    forecast:
      "Run the season's last verification against your own records — the anchors, the baselines, the attestations, each rechecked once. One log archive from week five fails its digest; the corruption is in the storage, not the history, and you have the parity to prove which. Repair, re-hash, retire the season with every bit accounted for.",
    auspicious: "epoch 1787300000",
    avoid: "closing books you have not re-opened once",
    compatible: "The Exponential Backoff",
  },
] as const;

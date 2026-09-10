import { describe, expect, it } from "vitest";
import {
  BOUNTY_REPORT_FIELDS,
  BOUNTY_REPORT_TEMPLATE,
  readReport,
} from "@/services/bounty-board";
import { crowdFindings } from "@/services/crowd-findings";
import type { BountyRecord, WalkReport } from "@/services/bounty-board";

/**
 * THE SECOND AXIS (2026-09-10), and it exists because a walker found
 * the hole in the first one and wrote it down in their observation:
 * agent402.tools serves content-encoding br, their client decompresses
 * before they can touch the bytes, so the on-wire body is not hashable
 * by anybody using a normal HTTP library. They pointed at the ETag as
 * "the more robust comparison target since it is the door's own
 * validator", and they were right.
 */

function paid(
  domain: string,
  payer: string,
  report: Record<string, unknown>,
): BountyRecord {
  return {
    bounty_id: `bty_${domain}_${payer}`,
    target_url: `https://${domain}/x`,
    domain,
    pay_to: `0x${"11".repeat(20)}`,
    amount_atomic: "1000",
    amount_usd: 0.001,
    reward_usd: 0.25,
    opened_at: "2026-09-10T00:00:00.000Z",
    opened_block: 1,
    expires_at: "2026-09-30T00:00:00.000Z",
    status: "paid",
    claim: {
      tx_hash: `0x${payer.slice(2).padEnd(64, "0")}`,
      payer,
      payout_to: payer,
      claimed_at: "2026-09-10T01:00:00.000Z",
      authorization_nonce: `0x${"cc".repeat(32)}`,
      authorization_valid_before: "9999999999",
      report: report as WalkReport,
    },
  };
}

const A = `0x${"aa".repeat(20)}`;
const B = `0x${"bb".repeat(20)}`;
const HASH_ONE = "a".repeat(64);
const HASH_TWO = "b".repeat(64);

describe("the etag is carried, taught, and compared", () => {
  it("is part of the published template and the field teaching", () => {
    expect(BOUNTY_REPORT_TEMPLATE).toHaveProperty("etag", null);
    const row = BOUNTY_REPORT_FIELDS.find((entry) => entry.field === "etag");
    expect(row, "no teaching row for etag").toBeTruthy();
    expect(row?.how).toMatch(/ETag header/i);
    // The point of the field is stated, not implied.
    expect(row?.why).toMatch(/door/i);
  });

  /**
   * VERBATIM, DELIBERATELY. W/"abc" and "abc" are a weak and a strong
   * validator and the difference belongs to the door. Normalising them
   * into agreement would be this store manufacturing a match neither
   * walker reported.
   */
  it("keeps the etag exactly as the door sent it", () => {
    const kept = readReport({ etag: 'W/"d28-1jERcbmO1KX0"' } as never);
    expect(kept.report?.etag).toBe('W/"d28-1jERcbmO1KX0"');
    expect(readReport({ etag: '  "plain"  ' } as never).report?.etag).toBe('"plain"');
  });

  it("explains an unusable etag rather than dropping it in silence", () => {
    const reading = readReport({ etag: "" } as never);
    expect(reading.report?.etag).toBeUndefined();
    const dropped = reading.dropped.find((entry) => entry.field === "etag");
    expect(dropped?.why).toMatch(/omit it entirely/i);
  });

  it("reports etag agreement separately from digest agreement", () => {
    // Same door, two wallets: same etag, DIFFERENT digests. That gap is
    // the finding — the walkers hashed differently, the door did not move.
    const findings = crowdFindings([
      paid("d.example", A, { body_sha256: HASH_ONE, etag: '"v1"' }),
      paid("d.example", B, { body_sha256: HASH_TWO, etag: '"v1"' }),
    ]);
    const row = findings.digests.find((entry) => entry.host === "d.example");
    expect(row?.agreement).toBe("differ");
    expect(row?.etag_agreement).toBe("agree");
  });

  it("says nothing about etags when only one wallet reported one", () => {
    const findings = crowdFindings([
      paid("e.example", A, { body_sha256: HASH_ONE, etag: '"v1"' }),
      paid("e.example", B, { body_sha256: HASH_ONE }),
    ]);
    const row = findings.digests.find((entry) => entry.host === "e.example");
    expect(row?.agreement).toBe("agree");
    // One etag is not a comparison, and an absent verdict says so.
    expect(row?.etag_agreement).toBeUndefined();
  });

  it("catches a door that really moved under two walkers", () => {
    const findings = crowdFindings([
      paid("f.example", A, { body_sha256: HASH_ONE, etag: '"v1"' }),
      paid("f.example", B, { body_sha256: HASH_TWO, etag: '"v2"' }),
    ]);
    const row = findings.digests.find((entry) => entry.host === "f.example");
    expect(row?.agreement).toBe("differ");
    expect(row?.etag_agreement).toBe("differ");
  });
});

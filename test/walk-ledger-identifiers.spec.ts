import ledgerText from "../research/x402-walk-ledger/ledger.jsonl?raw";
import readmeText from "../research/x402-walk-ledger/README.md?raw";
import { describe, expect, it } from "vitest";

/**
 * THE WALK LEDGER CANNOT NAME AN IDENTIFIER IT HAS NOT TYPED.
 *
 * Rows 1-7 shipped on 2026-09-02 carrying one key,
 * `authorization_or_tx_id`, documented as "the authorization nonce or
 * settlement tx". A reader holding a row could not tell which of the two
 * kinds the value was, and the two are opposite in what they permit: an
 * EIP-3009 nonce is client-generated random bytes no node will ever answer
 * to, a settlement hash is addressable by anybody with an RPC endpoint.
 * Same shape on the page, opposite meaning.
 *
 * On 2026-09-03 the store published a nonce from that key into a public
 * cross-check as "Transaction: 0x... on Base mainnet". 0200project ran it
 * and got null from both getTransactionByHash and getTransactionReceipt,
 * with a control hash proving their reach. The union key made the mislabel
 * possible; prose finished the job.
 *
 * So: the kind is typed per row, the absence of a settlement hash is in the
 * bytes rather than implied, and a value in the 32-byte identifier shape may
 * only sit under `settlement_tx_hash` when the row names the dated chain read
 * that put it there. This test fails on the reintroduction of the union, not on the
 * wording of any row.
 */

const IDENTIFIER_SHAPE = /^0x[0-9a-f]{64}$/i;

const UNION_KEYS = [
  "authorization_or_tx_id",
  "nonce_or_tx",
  "tx_or_authorization",
  "authorization_or_transaction",
];

interface Row {
  row: number;
  authorization_nonce?: unknown;
  settlement_tx_hash?: unknown;
  identifier_kind?: unknown;
  identifier_kind_basis?: unknown;
  settlement_tx_hash_basis?: unknown;
  [key: string]: unknown;
}

const rows: Row[] = ledgerText
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as Row);

describe("the x402 walk ledger's payment identifiers", () => {
  it("has rows to check at all, so an empty read cannot pass", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("never reintroduces a key that holds two kinds of identifier at once", () => {
    for (const row of rows) {
      for (const union of UNION_KEYS) {
        expect(
          Object.hasOwn(row, union),
          `row ${row.row} carries the union key ${union}; a reader cannot tell a nonce from a settlement hash`,
        ).toBe(false);
      }
    }
  });

  it("types the identifier kind on every row, with the basis for saying so", () => {
    for (const row of rows) {
      expect(typeof row.identifier_kind, `row ${row.row} identifier_kind`).toBe("string");
      expect((row.identifier_kind as string).length).toBeGreaterThan(0);
      expect(typeof row.identifier_kind_basis, `row ${row.row} identifier_kind_basis`).toBe(
        "string",
      );
      expect((row.identifier_kind_basis as string).length).toBeGreaterThan(0);
    }
  });

  it("states the settlement hash as absent rather than leaving it out", () => {
    for (const row of rows) {
      expect(
        Object.hasOwn(row, "settlement_tx_hash"),
        `row ${row.row} omits settlement_tx_hash; absence has to be in the bytes`,
      ).toBe(true);
    }
  });

  it("keeps authorization nonces out of the settlement hash field", () => {
    for (const row of rows) {
      const nonce = row.authorization_nonce;
      const settlement = row.settlement_tx_hash;
      if (typeof nonce === "string") {
        expect(nonce, `row ${row.row} authorization_nonce shape`).toMatch(IDENTIFIER_SHAPE);
      }
      if (settlement === null) continue;
      expect(typeof settlement, `row ${row.row} settlement_tx_hash`).toBe("string");
      expect(settlement, `row ${row.row} settlement_tx_hash shape`).toMatch(IDENTIFIER_SHAPE);
      expect(
        settlement,
        `row ${row.row} publishes the same value as nonce and settlement hash`,
      ).not.toBe(nonce);
      // A settlement hash is only a settlement hash if a node answered for it.
      // Shape decides nothing here — a nonce and a transaction hash are the
      // same 32 bytes — so a row naming one has to name the dated read behind
      // it, in its own field, where prose cannot stand in for a lookup.
      const basis = row.settlement_tx_hash_basis;
      expect(
        typeof basis,
        `row ${row.row} names a settlement hash with no settlement_tx_hash_basis`,
      ).toBe("string");
      expect((basis as string).length).toBeGreaterThan(20);
      expect(
        basis as string,
        `row ${row.row} settlement_tx_hash_basis names no dated read`,
      ).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("keeps the README naming both keys, so the row shape stays documented", () => {
    expect(readmeText).toContain("authorization_nonce");
    expect(readmeText).toContain("settlement_tx_hash");
    expect(readmeText).not.toContain("`authorization_or_tx_id` — the authorization nonce or");
  });
});

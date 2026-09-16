import { describe, expect, it } from "vitest";
import {
  bookedReason,
  classifyVerdictMessage,
  withVerdictClass,
  type VerdictClass,
} from "@/lib/decline-diagnosis";
import { declineStage, readReason } from "@/lib/declines";
import type { PayloadFieldProblem } from "@/lib/requirement-match";

/**
 * THE DIAGNOSIS WENT TO THE BUYER AND NOT TO THE BOOKS (2026-09-15).
 *
 * A live alert read: "UNCLEAR, needs a read — payment offered at
 * /api/buy/hello and declined: invalid_payload. The signature did not
 * verify." That reading is readReason's catch-all, reached because
 * every rule that could have told the keeper what actually happened —
 * revert, insufficient, expired, valid_after, replay — keys on words
 * the facilitator only ever put in its MESSAGE, and
 * recordPaymentDecline was handed the reason CODE alone.
 *
 * The 402 had the message the whole time: firstSuspect reads
 * `${reason} ${message}` and can tell the buyer their wallet is short.
 * The books could not.
 */

const ADVISORY: PayloadFieldProblem = {
  field: "payload.signature",
  says: "not 65 bytes",
  saw: "0xabc",
  // Advisory on purpose: the ERC-1271 case, reported and let through.
  blocking: false,
};

describe("reading a facilitator's free text down to one bounded class", () => {
  const cases: ReadonlyArray<readonly [string, VerdictClass]> = [
    ["contract call failed: execution reverted", "revert"],
    ["authorization nonce already submitted; transaction already on-chain", "replay"],
    ["insufficient funds for transfer", "insufficient"],
    ["the authorization has expired", "expired"],
    ["signature is not yet valid", "valid_after"],
  ];

  it("names the class for each shape we have actually seen", () => {
    for (const [message, expected] of cases) {
      expect(classifyVerdictMessage(message), message).toBe(expected);
    }
  });

  it("earns no class from silence or from vendor prose that says nothing", () => {
    expect(classifyVerdictMessage(undefined)).toBeUndefined();
    expect(classifyVerdictMessage("")).toBeUndefined();
    expect(classifyVerdictMessage("payment could not be processed")).toBeUndefined();
  });

  /**
   * A reverted simulation is the balance question wearing a contract
   * error, so revert wins even when the same sentence says the other
   * word. Same order firstSuspect uses on the 402.
   */
  it("reads a revert as a revert even when the text also says insufficient", () => {
    expect(
      classifyVerdictMessage("execution reverted: insufficient balance"),
    ).toBe("revert");
  });
});

describe("the suffix routes to the reading that was written for it", () => {
  /**
   * THE POINT OF THE VOCABULARY. The class names are deliberately the
   * words readReason's existing rules match on, so no rule had to
   * change. That is load-bearing and invisible, so it is pinned here:
   * rename a class without renaming its rule and this fails.
   */
  it("gives invalid_payload a real reading for each class", () => {
    const revert = readReason("invalid_payload+verdict:revert");
    expect(revert.fault).toBe("buyer");
    expect(revert.reading.toLowerCase()).toContain("balance");
    expect(revert.reading.toLowerCase()).not.toContain("signature did not verify");

    const replay = readReason("invalid_payload+verdict:replay");
    expect(replay.fault).toBe("buyer");
    expect(replay.reading.toLowerCase()).toContain("double-spend");

    const short = readReason("invalid_payload+verdict:insufficient");
    expect(short.fault).toBe("buyer");
    expect(short.reading.toLowerCase()).toContain("wallet was short");

    const expired = readReason("invalid_payload+verdict:expired");
    expect(expired.fault).toBe("buyer");
    expect(expired.reading.toLowerCase()).toContain("expired");

    const early = readReason("invalid_payload+verdict:valid_after");
    expect(early.fault).toBe("buyer");
    expect(early.reading.toLowerCase()).toContain("clock");
  });

  /** Bare, it is still the catch-all — that is the honest limit. */
  it("leaves a bare invalid_payload reading exactly as it did", () => {
    expect(readReason("invalid_payload").fault).toBe("unknown");
  });

  /** The settle side strips its prefix before reading, and keeps its stage. */
  it("works on the settle side, where the buyer believes they paid", () => {
    const raw = "settle:invalid_payload+verdict:revert";
    expect(declineStage(raw)).toBe("settle");
    expect(readReason(raw.slice("settle:".length)).reading.toLowerCase()).toContain(
      "balance",
    );
  });
});

describe("what the books carry", () => {
  it("appends the class, once, and never to our own local refusals", () => {
    expect(withVerdictClass("invalid_payload", "execution reverted")).toBe(
      "invalid_payload+verdict:revert",
    );
    // Our own refusal: the facilitator was never called, so there is no
    // message of theirs to read.
    expect(
      withVerdictClass("local:payload_not_base64", "execution reverted"),
    ).toBe("local:payload_not_base64");
    // Idempotent.
    expect(
      withVerdictClass("invalid_payload+verdict:revert", "execution reverted"),
    ).toBe("invalid_payload+verdict:revert");
    // Says nothing the code did not already say.
    expect(
      withVerdictClass("insufficient_funds", "insufficient funds"),
    ).toBe("insufficient_funds");
  });

  /**
   * THE FACILITATOR'S OWN WORDS OUTRANK OURS. readReason checks
   * `+payload:` before it checks revert, so an advisory field note
   * riding on an underfunded payload would otherwise book as a
   * signature fault and bury the balance.
   */
  it("prefers the judging party's verdict over our own field note", () => {
    expect(
      bookedReason("invalid_payload", [ADVISORY], "execution reverted"),
    ).toBe("invalid_payload+verdict:revert");
  });

  it("still falls back to our field note when their words say nothing", () => {
    expect(
      bookedReason("verify_error", [ADVISORY], "payment could not be processed"),
    ).toBe("verify_error+payload:payload.signature");
    expect(bookedReason("verify_error", [ADVISORY])).toBe(
      "verify_error+payload:payload.signature",
    );
  });

  /**
   * The message never goes in verbatim. It is vendor English that can
   * reword without notice, and slugging it would put an unbounded
   * string family into by_reason — the mistake local:sdk_threw exists
   * to avoid.
   */
  it("keeps the reason family bounded whatever the vendor writes", () => {
    const wild = bookedReason(
      "invalid_payload",
      [],
      "Execution reverted at 0xdeadbeef on block 12345678 (request id 9f3a-...)",
    );
    expect(wild).toBe("invalid_payload+verdict:revert");
    expect(wild).not.toContain("0xdeadbeef");
    expect(wild).not.toContain("12345678");
  });
});

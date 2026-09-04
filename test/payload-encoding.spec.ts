import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { readReason } from "@/lib/declines";
import { describeHeaderEncoding } from "@/lib/requirement-match";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { buildPaymentSignature, decodePaymentRequired } from "./helpers/payment";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE HEADER THAT NEVER BECAME AN ENVELOPE, 2026-09-04.
 *
 * Three emails about small_blessing from client curl/8.5.0, all
 * `local:payload_not_an_object`, all carrying the same reading: "the
 * message beside this says which field and lists what did arrive."
 * No field was absent — there was no object to be missing one — and
 * nothing was beside it, because the books keep the code and not the
 * 402's message. One bucket for every way a header can fail to decode
 * told the keeper the same nothing three times.
 *
 * These pin the split: the cause rides in the code, the reading says
 * it back, and the case that turned out to be reproducible — GNU
 * base64's 76-column wrap meeting curl's first-line-only header — is
 * named as such.
 */

/** GNU `base64` without -w0, then curl: only the first 76 columns arrive. */
function firstWrappedLine(envelope: unknown): string {
  return btoa(JSON.stringify(envelope)).slice(0, 76);
}

async function declineFor(header: string): Promise<Record<string, unknown>> {
  const declined = await SELF.fetch(
    "https://scvd.store/api/buy/small_blessing",
    { headers: { "PAYMENT-SIGNATURE": header } },
  );
  expect(declined.status).toBe(402);
  const body = (await declined.json()) as Record<string, unknown>;
  return body.payment_declined as Record<string, unknown>;
}

describe("a PAYMENT-SIGNATURE header that never decoded", () => {
  it("names curl-plus-wrapped-base64 for what it is, not 'not an object'", async () => {
    const first = await SELF.fetch("https://scvd.store/api/buy/small_blessing");
    const accepted = decodePaymentRequired(first).accepts[0]!;
    const whole = buildPaymentSignature(accepted);
    const header = whole.slice(0, 76);
    // The premise: 76 is divisible by 4, so the first line is CLEAN
    // base64 that passes the SDK's own check and decodes to a JSON
    // prefix. That is why it read as a shape problem and not a
    // transport one.
    expect(/^[A-Za-z0-9+/]*={0,2}$/.test(header)).toBe(true);
    expect(atob(header).startsWith('{"x402Version":2')).toBe(true);

    const stated = await declineFor(header);
    expect(stated.reason).toBe("local:payload_truncated_envelope");
    const message = String(stated.message);
    expect(message).toContain("cut off");
    expect(message).toContain("-w0");
    expect(message).toContain("curl");
    expect(message).toContain("exactly 76 characters");
    // Reassures about what was NOT examined.
    expect(message).toContain("Nothing is wrong with your signature");
  });

  it("names raw JSON in the header, and points at the MCP habit it usually is", async () => {
    const stated = await declineFor(
      JSON.stringify({ x402Version: 2, accepted: {}, payload: {} }),
    );
    expect(stated.reason).toBe("local:payload_not_base64:raw_json");
    expect(String(stated.message)).toContain("not its base64 encoding");
    expect(String(stated.message)).toContain("MCP");
  });

  it("names the URL-safe alphabet", () => {
    const urlSafe = btoa(JSON.stringify({ x402Version: 2, q: "??>>" }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(urlSafe).toMatch(/[-_]/);
    expect(describeHeaderEncoding(urlSafe)?.code).toBe(
      "local:payload_not_base64:url_safe",
    );
  });

  it("names whitespace, which our lenient atob would otherwise have accepted", () => {
    // The SDK's regex refuses whitespace; a forgiving atob does not.
    // Left to the old path, this decoded fine on OUR side and the
    // SDK's "Payment required" got slugged as local:payment_required.
    const spaced = btoa(JSON.stringify({ x402Version: 2 })).replace(
      /^(.{8})/,
      "$1 ",
    );
    expect(describeHeaderEncoding(spaced)?.code).toBe(
      "local:payload_not_base64:whitespace",
    );
  });

  it("names base64 that decodes to something other than JSON", () => {
    const bareSignature = btoa(`0x${"cd".repeat(65)}`);
    const problem = describeHeaderEncoding(bareSignature);
    expect(problem?.code).toBe("local:payload_not_json");
    expect(problem?.says).toContain('"0xcdcd');
  });

  it("keeps not_an_object for JSON of the wrong type, and says which type", async () => {
    // Base64 of a JSON STRING: an envelope encoded twice.
    const twice = btoa(JSON.stringify(btoa(JSON.stringify({ x402Version: 2 }))));
    const stated = await declineFor(twice);
    expect(stated.reason).toBe("local:payload_not_an_object");
    expect(String(stated.message)).toContain("a string");
    expect(String(stated.message)).toContain("twice");
  });

  it("says nothing about a header the SDK would have parsed", async () => {
    const first = await SELF.fetch("https://scvd.store/api/buy/small_blessing");
    const accepted = decodePaymentRequired(first).accepts[0]!;
    expect(describeHeaderEncoding(buildPaymentSignature(accepted))).toBeUndefined();
    // Padding-stripped base64 decodes in both the SDK and here.
    expect(
      describeHeaderEncoding(btoa(JSON.stringify({ x402Version: 2 })).replace(/=+$/, "")),
    ).toBeUndefined();
  });

  it("stays out of the way of the envelope diagnosis it runs ahead of", async () => {
    // A well-encoded header with a missing field still gets the
    // field-naming reading, not an encoding one.
    const stated = await declineFor(
      btoa(JSON.stringify({ x402Version: 2, payload: { signature: "0xcd" } })),
    );
    expect(stated.reason).toBe("local:payload_missing_accepted");
  });
});

describe("what the desk and the email say about an undecoded header", () => {
  const codes = [
    "local:payload_not_base64:raw_json",
    "local:payload_not_base64:url_safe",
    "local:payload_not_base64:whitespace",
    "local:payload_not_base64",
    "local:payload_truncated_envelope",
    "local:payload_not_json",
    "local:payload_not_an_object",
  ];

  it("reads every one as THEIRS and never promises a field it cannot name", () => {
    for (const code of codes) {
      const { fault, reading } = readReason(code);
      expect(fault, code).toBe("buyer");
      expect(reading, code).toContain("no field was checked");
      expect(reading, code).not.toContain("which field");
      expect(reading, code).not.toContain("lists what did arrive");
    }
  });

  it("gives the curl case its cause and its one-flag fix", () => {
    const { reading } = readReason("local:payload_truncated_envelope");
    expect(reading).toContain("76 columns");
    expect(reading).toContain("-w0");
    expect(reading).toContain("curl");
  });

  it("gives each code a different clause, so the email is not the same three times", () => {
    const readings = new Set(codes.map((code) => readReason(code).reading));
    expect(readings.size).toBe(codes.length);
  });

  it("no longer tells the keeper the field is in a message the books never kept", () => {
    // The family reading, for the codes that DO name a field.
    const { reading } = readReason("local:payload_missing_accepted");
    expect(reading).toContain("The code names the field");
    expect(reading).not.toContain("The message beside this");
  });
});

describe("the hand-rolling notes warn about the wrap before it costs a night", () => {
  it("says one line, and names the flag", async () => {
    const { HAND_ROLLING } = await import("@/store/hand-rolling");
    expect(HAND_ROLLING.envelope).toContain("-w0");
    expect(HAND_ROLLING.envelope).toContain("76 columns");
    const first = await SELF.fetch("https://scvd.store/api/buy/small_blessing");
    const body = (await first.json()) as Record<string, unknown>;
    expect(String(body.payload_template_note)).toContain("-w0");
  });
});

/**
 * OUR OWN REFUSAL, READ AS SOMEBODY ELSE'S (2026-09-04). The
 * settlement_attestation funnel booked
 * `local:preflight:payload.authorization.nonce` and
 * `local:preflight:payload.signature`, and both fell through to the
 * generic `local:` line: "the x402 SDK refused this ... fault:
 * unknown". It was not the SDK — preflightRefusalBody writes "caught
 * here on purpose" into the body the buyer gets — the fault was not
 * unknown, and the field was sitting in the code the whole time.
 * Since readReason also writes the phone alert, each of these paged
 * the keeper as "UNCLEAR, needs a read" for a row already read.
 */
describe("the refusals the store makes on its own authority", () => {
  const codes = [
    "local:preflight:payload.signature",
    "local:preflight:payload.authorization",
    "local:preflight:payload.authorization.from",
    "local:preflight:payload.authorization.to",
    "local:preflight:payload.authorization.value",
    "local:preflight:payload.authorization.validAfter",
    "local:preflight:payload.authorization.validBefore",
    "local:preflight:payload.authorization.nonce",
  ];

  it("never blames the SDK for a refusal the store made itself", () => {
    for (const code of codes) {
      const { reading } = readReason(code);
      expect(reading, code).not.toContain("x402 SDK refused");
      expect(reading, code).toContain("WE refused this");
    }
  });

  it("reads every one as THEIRS, so the phone stops saying UNCLEAR", () => {
    for (const code of codes) {
      expect(readReason(code).fault, code).toBe("buyer");
    }
  });

  it("says which field, in words, for every field it can block on", () => {
    const readings = new Set(codes.map((code) => readReason(code).reading));
    // A shared clause would mean the code's field name went unused.
    expect(readings.size).toBe(codes.length);
    expect(readReason(codes[7]!).reading).toContain("64 hex characters");
    expect(readReason(codes[0]!).reading).toContain("beginning 0x");
  });

  it("covers every field the pre-flight is actually willing to refuse", async () => {
    // Drift guard: a new blocking check in describeExactEvmPayload
    // must arrive with a clause here, or its code reads as a bare
    // field name again.
    const { describeExactEvmPayload, blockingProblems } = await import(
      "@/lib/requirement-match"
    );
    const problems = blockingProblems(
      describeExactEvmPayload(
        {
          scheme: "exact",
          network: "eip155:8453",
          payTo: "0x" + "a".repeat(40),
          amount: "5000",
        },
        { signature: 65, authorization: { nonce: 1 } },
      ),
    );
    expect(problems.length).toBeGreaterThan(0);
    for (const problem of problems) {
      const { reading } = readReason(`local:preflight:${problem.field}`);
      expect(reading, problem.field).not.toContain(
        "is not in the one legal form that field has",
      );
    }
  });

  it("keeps the historical bucket honest about what it cannot say", () => {
    // Rows booked before the split carry payload_not_an_object as the
    // catch-all, so the reading must not assert the narrow cause for
    // them as though it always meant that.
    const { reading } = readReason("local:payload_not_an_object");
    expect(reading).toContain("2026-09-04");
    expect(reading).toContain("local:payload_truncated_envelope");
  });
});

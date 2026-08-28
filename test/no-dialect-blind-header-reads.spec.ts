import { describe, expect, it } from "vitest";

/**
 * THE DIALECT SWEEP, AS A STANDING GUARD (task #50).
 *
 * x402 v2 names the payment header PAYMENT-SIGNATURE; v1 named it
 * X-PAYMENT, and much of the live ecosystem still sends the old name
 * around a valid v2 envelope. This store ACCEPTS both — the
 * DialectTolerantAdapter, bought by Cairn's cold walk on 2026-08-25.
 *
 * THE BUG THIS GUARD ENDS is the one that came AFTER that fix, and it
 * is the same bug: acceptance was made dialect-aware and every other
 * reader in the gate was left reading the v2 name alone. So an
 * X-PAYMENT buyer could take the door while the door learned nothing
 * about them — no local preflight diagnosis, no payer for the
 * house-vs-organic flag, and no nonce or payer for the ambiguous-
 * settle rescue or Machine 1, whose rows could then never be resolved
 * by anything.
 *
 * IT HID THE SAME WAY BOTH TIMES, which is why prose was never going
 * to be enough: the alias was PRESENT in the file, so the file looked
 * dialect-aware to anyone reading call sites. The 2026-08-26
 * correction is exactly that — "call sites were read; behaviour was
 * never exercised". test/x-payment-attribution.spec.ts holds the
 * BEHAVIOUR by driving real requests under the old name. This holds
 * the SHAPE, so a tenth reader cannot quietly appear.
 *
 * THE LAW: any code reading the payment header off an incoming
 * request must read BOTH names — via the gate's own paymentHeaderOf,
 * or an explicit `?? c.req.header("X-PAYMENT")` on the same
 * expression. Sending is a different act and is not covered: when
 * this store is the CLIENT (the launch check paying someone else's
 * door) it speaks the documented v2 name and should.
 */

const sources = import.meta.glob("/src/**/*.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** A read of the v2 name off a request. */
const READS_V2 = /c\.req\.header\(\s*"PAYMENT-SIGNATURE"\s*\)/;
/** The same expression continuing into the v1 alias. */
const READS_BOTH =
  /c\.req\.header\(\s*"PAYMENT-SIGNATURE"\s*\)\s*\?\?\s*c\.req\.header\(\s*"X-PAYMENT"\s*\)/;

describe("every reader of the payment header knows both dialects", () => {
  it("has no read of the v2 name that does not also reach for the v1 alias", () => {
    const offenders: string[] = [];
    for (const [path, text] of Object.entries(sources)) {
      for (const line of text.split("\n")) {
        if (!READS_V2.test(line)) continue;
        if (READS_BOTH.test(line)) continue;
        offenders.push(`${path}: ${line.trim()}`);
      }
    }
    expect(
      offenders,
      "a payment-header read that only knows the v2 name — an X-PAYMENT buyer is invisible to it. Use the gate's paymentHeaderOf, or read both names on the one expression.",
    ).toEqual([]);
  });

  it("still has a reader that names both, so this guard cannot pass on an empty file set", () => {
    /*
     * Rule 46: a guard asserting an ABSENCE must prove it could see a
     * presence. If the glob ever returns nothing, the check above
     * passes vacuously and argues for the lie.
     */
    const texts = Object.values(sources);
    expect(texts.length).toBeGreaterThan(100);
    expect(
      texts.some((text) => /PAYMENT_HEADER_V1_ALIAS|"X-PAYMENT"/.test(text)),
      "no file mentions the v1 alias at all — the sweep would be reading the wrong tree",
    ).toBe(true);
  });
});

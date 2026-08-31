import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import buySource from "../src/routes/buy.ts?raw";

/**
 * "NOTHING CHARGED" WAS A SENTENCE, NOT A FIELD (rule 57.4, the sweep's
 * second stop, 2026-08-30).
 *
 * Forty-two places on the buy doors refuse a purchase BEFORE any money
 * moves, and every one of them said so in English: "Nothing charged."
 * "No target, no charge." Good sentences. A buying agent that wants to
 * know the one thing that actually matters — did this cost me
 * anything? — had to parse prose we are free to improve at any time.
 *
 * THAT IS A WORSE GAP HERE THAN ANYWHERE ELSE IN THE STORE, because
 * the wrong reading costs real money in both directions. An agent that
 * reads a pre-payment refusal as a failed purchase may retry and
 * double-spend. One that reads it as a completed purchase abandons a
 * sale that a corrected parameter would have made. Neither is a
 * hypothetical about a stranger's client: this store's own MCP till
 * and browser till are clients of these doors.
 *
 * So `charged: false` rides in the body, beside a stable `code`. Both
 * are ADDITIVE — every English sentence and every status code is
 * exactly what it was — which is the only shape a change to a money
 * path should ever take when the goal is legibility.
 */

/** The code set. Coarse on purpose: an agent branches, then reads. */
const CODES = [
  "target_refused",
  "passport_refused",
  "bad_request",
  "upstream_unavailable",
  "already_done",
  /*
   * THE SHELF GATE'S THREE, added 2026-08-30. The middleware that
   * turns away a retired, unknown or sold-out item refuses before any
   * money moves and carried neither field — missed by this sweep
   * because not one of its three sentences contains the words
   * "nothing charged", which is what the walk above matches on. A
   * boundary drawn by a grep rather than by a decision. A buyer
   * turned away at the shelf needs the same fact as one turned away
   * at the parameter check.
   */
  "retired",
  "unknown_item",
  "sold_out",
] as const;

/**
 * THE SOURCE IS WALKED, NOT A LIST OF ROUTES. A guard that checked the
 * doors somebody remembered to name would pass forever while the
 * forty-third refusal shipped without the field — which is precisely
 * how the first forty-two came to exist. The ground truth is the file:
 * every refusal that PROMISES nothing was charged must also SAY it in
 * a way a machine can read.
 */
describe("every pre-payment refusal says so in a field, not only in a sentence", () => {
  it("leaves no promise of no-charge unaccompanied by charged: false", () => {
    const literals: { snippet: string; hasField: boolean }[] = [];
    const marker = /return c\.json\(\s*\{/g;
    let match: RegExpExecArray | null;
    while ((match = marker.exec(buySource)) !== null) {
      const open = match.index + match[0].length - 1;
      let depth = 0;
      let index = open;
      for (; index < buySource.length; index += 1) {
        if (buySource[index] === "{") depth += 1;
        else if (buySource[index] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const body = buySource.slice(open, index + 1);
      const promises =
        body.includes("Nothing charged") || /no charge/i.test(body);
      if (!promises) continue;
      literals.push({
        snippet: body.slice(0, 90).replace(/\s+/g, " "),
        hasField: body.includes("charged: false"),
      });
    }

    // A guard over an empty set is a guard that cannot fail.
    expect(literals.length).toBeGreaterThan(30);
    const silent = literals.filter((entry) => !entry.hasField);
    expect(
      silent.map((entry) => entry.snippet),
      "a buy door promises that nothing was charged in prose and does not carry `charged: false`. An agent has to parse English to learn whether it spent money.",
    ).toEqual([]);
  });

  it("gives every one of them a code from the published set", () => {
    const codes = [...buySource.matchAll(/code: "([a-z_]+)"/g)].map(
      (match) => match[1]!,
    );
    expect(codes.length).toBeGreaterThan(30);
    const unknown = [...new Set(codes)].filter(
      (code) => !CODES.includes(code as (typeof CODES)[number]),
    );
    expect(
      unknown,
      "a buy door emits a refusal code that is not in the published set, so a caller branching on codes meets one it has never seen",
    ).toEqual([]);
  });
});

/**
 * AND IT IS ON THE WIRE, not only in the source. A field the file
 * declares and the door does not send is the same defect wearing
 * better clothes — the lesson the samples work wrote down four hours
 * earlier and this file is not going to relearn.
 */
describe("a real refusal carries the field", () => {
  it("refuses a missing parameter with charged: false and a code", async () => {
    const response = await SELF.fetch(
      "https://scvd.store/api/buy/context_anchor",
      { headers: { "X-PAYMENT": "not-a-real-payment" } },
    );
    // Whatever it answers, it must not be a silent charge.
    if (response.status === 400) {
      const body = (await response.json()) as Record<string, unknown>;
      expect(body["charged"]).toBe(false);
      expect(CODES).toContain(body["code"] as string);
      // The English is unchanged and still served: additive, always.
      expect(String(body["error"])).toMatch(/charge/i);
    }
  });

  it("refuses a target the probe law forbids, by name", async () => {
    const response = await SELF.fetch(
      "https://scvd.store/api/buy/service_audit?url=http://192.168.1.1/x",
      { headers: { "X-PAYMENT": "not-a-real-payment" } },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["charged"]).toBe(false);
    expect(body["code"]).toBe("target_refused");
  });
});

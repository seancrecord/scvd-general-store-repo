import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { cadenceFor, nextDayBoundary, nextWeekBoundary } from "@/lib/cadence";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * SAYING THE CADENCE OUT LOUD, in a field rather than a sentence.
 *
 * The free shelf has always had a clock; only llms.txt said so, in
 * prose. A scheduled agent reading a response had no way to know when
 * to come back, so it either never came back or it hammered.
 */
describe("the clock, as a field", () => {
  it("puts the next boundary at a real UTC instant, not a vague later", () => {
    const now = new Date("2026-07-27T15:04:05.000Z"); // a Monday
    const daily = cadenceFor("bell", now);
    expect(daily?.every).toBe("day");
    expect(daily?.next_at).toBe("2026-07-28T00:00:00.000Z");

    const weekly = cadenceFor("stamp", now);
    expect(weekly?.every).toBe("week");
    // The stamp rolls on the next ISO Monday, which is how the stamp
    // week is actually keyed — not seven days from whenever you asked.
    expect(weekly?.next_at).toBe("2026-08-03T00:00:00.000Z");
  });

  it("rolls the day at midnight UTC and the week on Monday", () => {
    const lateSunday = new Date("2026-08-02T23:59:59.000Z");
    expect(nextDayBoundary(lateSunday).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z",
    );
    expect(nextWeekBoundary(lateSunday).toISOString()).toBe(
      "2026-08-03T00:00:00.000Z",
    );
  });

  it("says nothing at all for a surface with no clock", () => {
    // An absent field says "no rhythm here" more honestly than a
    // filled-in one that means nothing.
    expect(cadenceFor("verify")).toBeUndefined();
  });

  it("carries no streak, no expiry, and nothing to lose (rule 22)", () => {
    const cadence = cadenceFor("bell");
    expect(cadence?.nothing_is_lost).toBe(true);
    const text = JSON.stringify(cadence).toLowerCase();
    for (const mechanic of ["streak", "expire", "expires", "lapse", "miss"]) {
      expect(
        text.includes(mechanic),
        `the cadence block mentions "${mechanic}" — that is engagement mechanics, which rule 22 forbids`,
      ).toBe(false);
    }
  });
});

describe("the free responses that have a clock", () => {
  it("tells a ringer when the bell resets", async () => {
    const response = await SELF.fetch(`${BASE}/api/bell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: "cadence-spec-ringer" }),
    });
    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.cadence)) {
      throw new Error("the bell carries no cadence");
    }
    expect(body.cadence.every).toBe("day");
    expect(typeof body.cadence.next_at).toBe("string");

    // And on the second ring — the refusal — the clock is the answer
    // to the question the caller just asked.
    const again = await SELF.fetch(`${BASE}/api/bell`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: "cadence-spec-ringer" }),
    });
    const againBody: unknown = await again.json();
    if (!isRecord(againBody) || !isRecord(againBody.cadence)) {
      throw new Error("the refusal carries no cadence");
    }
    expect(againBody.cadence.every).toBe("day");
  });

  it("tells a visitor when this week's stamp design turns over", async () => {
    const posted: unknown = await (
      await SELF.fetch(`${BASE}/api/stamp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "cadence-spec-visitor" }),
      })
    ).json();
    if (!isRecord(posted) || !isRecord(posted.cadence)) {
      throw new Error("the stamp carries no cadence");
    }
    expect(posted.cadence.every).toBe("week");

    // The GET says it too, so an agent can read the clock without
    // taking a stamp it did not want yet.
    const asked: unknown = await (await SELF.fetch(`${BASE}/api/stamp`)).json();
    if (!isRecord(asked) || !isRecord(asked.cadence)) {
      throw new Error("the stamp GET carries no cadence");
    }
    expect(asked.cadence.every).toBe("week");
  });

  it("tells a correspondent when the mailbox opens again", async () => {
    const first: unknown = await (
      await SELF.fetch(`${BASE}/api/letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter: "Testing the clock on the mailbox.",
          from_name: "cadence-spec-writer",
        }),
      })
    ).json();
    if (!isRecord(first) || !isRecord(first.cadence)) {
      throw new Error("the letter carries no cadence");
    }
    expect(first.cadence.every).toBe("day");

    // Same day, second letter: refused, and the refusal says when.
    const second = await SELF.fetch(`${BASE}/api/letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: "And again, too soon.",
        from_name: "cadence-spec-writer",
      }),
    });
    expect(second.status).toBe(429);
    const secondBody: unknown = await second.json();
    if (!isRecord(secondBody) || !isRecord(secondBody.cadence)) {
      throw new Error("the refusal carries no cadence");
    }
    expect(typeof secondBody.cadence.next_at).toBe("string");
  });

  it("tells a signer the guestbook has no gate worth waiting on", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/api/guestbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "cadence-spec-signer",
          message: "Reading the clock.",
        }),
      })
    ).json();
    if (!isRecord(body) || !isRecord(body.cadence)) {
      throw new Error("the guestbook carries no cadence");
    }
    expect(body.cadence.nothing_is_lost).toBe(true);
  });
});

import { SELF, env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  registeredMarkers,
  UNREGISTERED_VENUE,
  venueCounterKey,
  VENUES,
} from "@/store/venues";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * ?src= WAS A FREE UNBOUNDED-KEY PRIMITIVE, pointed at the counters
 * the keeper reads to decide whether a channel works.
 *
 * The value went from the query string into a KV key verbatim —
 * `metric:<month>:venue:<whatever>` — sliced only to 40 characters,
 * with no allowlist and no cap. One distinct key per distinct string,
 * each one then listed and read on every office page load. A stranger
 * could inflate the keeper's own instrument and slow the page that
 * shows it, for the cost of a GET.
 *
 * The books already proved it was open: `workcheck-persona-test`
 * appears in the venue counters and NOWHERE in this codebase, because
 * nothing ever required a marker to be one of ours.
 *
 * These tests hold the register closed. The first one is the security
 * property; the rest keep it from being closed so tightly that the
 * measurement dies with the hole.
 */
async function venueKeys(): Promise<string[]> {
  const listed = await testEnv.COUNTERS.list({ prefix: "metric:" });
  return listed.keys
    .map((entry) => entry.name)
    .filter((name) => name.includes(":venue:"));
}

/**
 * DRIVEN THROUGH recordPorchVisit, NOT THROUGH SELF.fetch, and the
 * reason is a race worth writing down.
 *
 * recordPorchVisit awaits several KV writes in sequence, and the
 * middleware hands the whole promise to `waitUntil`. The response
 * therefore resolves once the FIRST bump lands; the venue counter and
 * the event row are still in flight. A spec that fetches and then
 * lists sees the porch counter and nothing else.
 *
 * The first cut of this file did exactly that and PASSED — because it
 * fired three requests, which gave the scheduler three chances, and
 * one landing looked like the property holding. That is the same class
 * of instrument failure as the clock-dependent test in AGENTS.md: a
 * verdict that moves with something other than the code under test.
 * The end-to-end wiring (index.ts reading ?src= off the query string)
 * is already covered in test/front-porch.spec.ts; what belongs here is
 * the key the bump site actually writes.
 */
async function arriveWithMarker(marker: string): Promise<void> {
  const { recordPorchVisit } = await import("@/lib/metrics");
  await recordPorchVisit(testEnv, "storefront", {
    userAgent: "cold-arrival-check/1.0",
    declaredSource: marker,
  });
}

describe("a stranger cannot mint venue counters", () => {
  beforeEach(async () => {
    for (const name of await venueKeys()) {
      await testEnv.COUNTERS.delete(name);
    }
  });

  it("folds an invented marker into one bucket instead of a new key", async () => {
    // The exact shape of the old bug: distinct strings, one GET each.
    for (const invented of ["totally-made-up", "another-one", "third"]) {
      await arriveWithMarker(invented);
    }
    const keys = await venueKeys();
    for (const invented of ["totally-made-up", "another-one", "third"]) {
      expect(
        keys.some((key) => key.endsWith(invented)),
        `an unregistered marker minted its own counter: ${invented}`,
      ).toBe(false);
    }
    expect(
      keys.some((key) => key.endsWith(`:venue:${UNREGISTERED_VENUE}`)),
      "the arrival was dropped entirely rather than bucketed — the hole is closed but so is the measurement",
    ).toBe(true);
  });

  it("refuses a marker that could deform the key itself", async () => {
    // A KV key segment must never carry a colon, whitespace, or four
    // hundred characters of somebody's choosing. The shape check is
    // what would have made the original bug unexploitable on its own.
    for (const hostile of [
      "venue:injected",
      "a".repeat(200),
      "has space",
      "../../escape",
      "UPPER-and-Mixed",
      "",
    ]) {
      expect(
        venueCounterKey(hostile),
        `a hostile marker survived into a key: ${JSON.stringify(hostile)}`,
      ).toBe(UNREGISTERED_VENUE);
    }
  });

  it("still counts a marker we actually minted, under its own name", async () => {
    await arriveWithMarker("try");
    const keys = await venueKeys();
    expect(
      keys.some((key) => key.endsWith(":venue:try")),
      "a registered marker lost its own counter — the register broke the thing it protects",
    ).toBe(true);
  });

  /**
   * The raw string is the reason bucketing is acceptable. If an
   * unrecognised marker were bucketed AND forgotten, a one-off hand
   * test would become unreadable, and the venue table would go from
   * attacker-writable to useless. The event row keeps it verbatim.
   */
  it("keeps the exact invented string readable per-event", async () => {
    await arriveWithMarker("some-hand-test");
    const listed = await testEnv.COUNTERS.list({ prefix: "evt:" });
    const rows = await Promise.all(
      listed.keys.map(async (entry) =>
        JSON.parse((await testEnv.COUNTERS.get(entry.name)) ?? "{}"),
      ),
    );
    expect(
      rows.some((row) => row.declared_source === "some-hand-test"),
      "the marker was bucketed and then forgotten, which loses the one thing bucketing was supposed to preserve",
    ).toBe(true);
  });
});

describe("the venue register is a document a hand can work from", () => {
  it("gives every venue a URL that carries its own marker", async () => {
    for (const venue of VENUES) {
      expect(
        venue.url,
        `${venue.marker} has a URL that does not carry its own marker — copying it would measure nothing`,
      ).toContain(`src=${venue.marker}`);
      expect(venue.url.startsWith("https://scvd.store")).toBe(true);
    }
  });

  it("registers every marker that already ships in a document", async () => {
    // These three are live in files that are already published. A
    // register that omitted them would bucket our own traffic.
    for (const shipped of ["try", "skill", "clawhub-skill"]) {
      expect(
        registeredMarkers(),
        `${shipped} ships in a published document but is not registered`,
      ).toContain(shipped);
    }
  });

  it("names no marker twice", async () => {
    const markers = VENUES.map((venue) => venue.marker);
    expect(markers.length).toBe(new Set(markers).size);
  });

  /**
   * DERIVED, not typed (rule 1). The office caveat used to hand-type
   * which markers exist and got it wrong within the hour — it said
   * "try and skill" while the marker that actually ships in the
   * ClawHub bundle is `clawhub-skill`. The page reads the register
   * now, and this holds the two together.
   */
  it("is what the office caveat counts", async () => {
    const adminAuth = {
      Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
    };
    const html = await (
      await SELF.fetch(`${BASE}/admin`, { headers: adminAuth })
    ).text();
    const flat = html.replace(/\s+/g, " ");
    expect(flat).toContain(`register holds ${registeredMarkers().length}`);
    for (const marker of registeredMarkers()) {
      expect(flat, `the caveat omits a registered marker: ${marker}`).toContain(
        `<code>${marker}</code>`,
      );
    }
  });
});

describe("the register does not disturb channel inference", () => {
  it("still tags the skill markers as the skill channel", async () => {
    // ?src=clawhub-skill is the one declared value that OVERRIDES
    // inference, because we wrote the document it appears in. Bounding
    // the counter key must not touch that.
    const { inferChannel } = await import("@/lib/channel");
    expect(inferChannel({ declaredSource: "clawhub-skill" })).toBe("skill");
    expect(inferChannel({ declaredSource: "skill" })).toBe("skill");
    expect(
      inferChannel({ declaredSource: "bazaar", userAgent: "curl/8" }),
      "a declared marker started overriding inference, which would make the channel column self-reported",
    ).toBe("direct");
  });

  it("leaves the metric key namespace intact", async () => {
    expect(KV_KEYS.metric("2026-08", "venue", venueCounterKey("try"))).toBe(
      "metric:2026-08:venue:try",
    );
    expect(
      KV_KEYS.metric("2026-08", "venue", venueCounterKey("venue:injected")),
    ).toBe(`metric:2026-08:venue:${UNREGISTERED_VENUE}`);
  });
});

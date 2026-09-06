import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import { claimAtStamp, type OutreachLedger, type Prospect } from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const auth = { Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}` };

/**
 * TWO THINGS THAT KEEP THE DESK HONEST AND READABLE (2026-09-06).
 *
 * THE SCREEN: the card lists used to draw every door on the round,
 * hundreds of them, most with no published address and so no button
 * to press. The keeper: "if no contact is listed i dont want it
 * muddying up my screen". They are filtered out of the CARDS and
 * counted in a line — never dropped from the derivation, and never
 * hidden without the page saying how many.
 *
 * THE CLAIM: a hand-delivered note is drafted from `entry.live`, and
 * the stamp is the last moment that reading exists to be written
 * down. Freeze it there or the re-read has nothing to hold the door
 * against but this week's census, which is a different question.
 */

function wardHost(name: string, verdict: WardHostResult["verdict"], failed: string[] = []): WardHostResult {
  return { host: name, url: `https://${name}/route`, verdict, failed, advisories: [] };
}

function round(hosts: WardHostResult[]): WardRound {
  return {
    week: "2026-W36",
    at: "2026-09-05T13:27:08.998Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

const prospect = (host: string): Prospect => ({
  host,
  url: `https://${host}/route`,
  verdict: "not_ready",
  failed: ["payto-payable"],
  week: "2026-W36",
  observed_at: "2026-09-01T09:00:00.000Z",
  networks: ["algorand:mainnet"],
  newly_failing: false,
  reason: "answers, but not as an x402 door: payto-payable",
});

describe("the queue draws the doors you can actually write to", () => {
  it("hides address-less cards, says how many, and shows them all on request", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(
        round([
          wardHost("reachable.example", "not_ready", ["payto-payable"]),
          wardHost("silent.example", "not_ready", ["payto-payable"]),
          wardHost("unscouted.example", "not_ready", ["payto-payable"]),
          wardHost("open-door.example", "ready"),
        ]),
      ),
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify({
        version: 1,
        hosts: {
          "reachable.example": {
            scouted_at: "2026-09-02T00:00:00.000Z",
            contacts: ["mailto:ops@reachable.example"],
          },
          "silent.example": {
            scouted_at: "2026-09-02T00:00:00.000Z",
            scout_note: "none published",
          },
        },
      } satisfies OutreachLedger),
    );

    const page = await (
      await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })
    ).text();
    expect(page).toContain("card-reachable.example");
    expect(page).not.toContain("card-silent.example");
    expect(page).not.toContain("card-unscouted.example");
    expect(page).not.toContain("card-open-door.example");
    // The count is the honesty: three broken/ready doors are not drawn.
    expect(page).toContain("3 doors on this round are not drawn below");
    expect(page).toContain('href="/admin/outreach?all=1"');
    // They are still counted where the accounting lines live.
    expect(page).toContain("Scout contacts (2 unscouted");

    const all = await (
      await SELF.fetch(`${BASE}/admin/outreach?all=1`, { headers: { ...auth, Accept: "text/html" } })
    ).text();
    expect(all).toContain("card-silent.example");
    expect(all).toContain("card-unscouted.example");
    expect(all).toContain("Showing every door, address or not.");

    // The JSON twin is the derivation, and it is not filtered: a
    // screen preference must never quietly become a data change.
    const json = (await (
      await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "application/json" } })
    ).json()) as { prospects: { host: string }[] };
    expect(json.prospects.map((p) => p.host)).toContain("silent.example");
  });
});

describe("what a note claimed is frozen when it is stamped", () => {
  it("prefers the live reading the hand note was drafted from, then the round, and never overwrites", () => {
    const live = {
      at: "2026-09-06T09:00:00.000Z",
      verdict: "not_ready" as const,
      failed: ["amount-atomic"],
      battery: "preflight-v2",
    };
    // The live reading is what the note said; the round supplies only
    // the week and the rails, which a probe does not carry.
    expect(claimAtStamp({ live }, prospect("a.example"))).toEqual({
      at: "2026-09-06T09:00:00.000Z",
      week: "2026-W36",
      verdict: "not_ready",
      failed: ["amount-atomic"],
      networks: ["algorand:mainnet"],
    });
    // No live reading: the round row is the best record of what a
    // note would have said.
    expect(claimAtStamp({}, prospect("a.example"))?.failed).toEqual(["payto-payable"]);
    // Neither: the desk says it does not know rather than inventing.
    expect(claimAtStamp({}, undefined)).toBeNull();
    // A row stamped sent, then replied, still made ONE claim.
    const first = { at: "2026-08-01T00:00:00.000Z", verdict: "unreachable" as const, failed: [] };
    expect(claimAtStamp({ claimed: first, live }, prospect("a.example"))).toBe(first);
  });

  it("the stamp route writes it, so a note delivered by hand can be audited later", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round([wardHost("stamped.example", "not_ready", ["payto-payable"])])),
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify({
        version: 1,
        hosts: {
          "stamped.example": {
            contacts: ["mailto:ops@stamped.example"],
            live: {
              at: "2026-09-06T09:00:00.000Z",
              verdict: "not_ready",
              failed: ["payto-payable"],
              battery: "preflight-v2",
            },
          },
        },
      } satisfies OutreachLedger),
    );
    const response = await SELF.fetch(`${BASE}/admin/outreach/stamp-many`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ host: "stamped.example", status: "sent" }),
    });
    expect(response.status).toBe(200);
    const stored = JSON.parse(
      (await testEnv.COUNTERS.get(KV_KEYS.outreachLedger)) ?? "{}",
    ) as OutreachLedger;
    expect(stored.hosts["stamped.example"]?.claimed).toEqual({
      at: "2026-09-06T09:00:00.000Z",
      week: "2026-W36",
      verdict: "not_ready",
      failed: ["payto-payable"],
      // No `networks`: this round's row recorded no offer, and an
      // empty rail list would read as "we looked and it offered none".
    });
  });
});

/*
 * Source read the way the repo's other source-level guards read it:
 * bundled at build time with ?raw, because the Workers test runtime
 * has no filesystem to open.
 */
const sources = import.meta.glob("/src/{index,services/outreach}.ts", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function source(path: string): string {
  const text = sources[path] ?? "";
  expect(text.length, `${path} did not load as source`).toBeGreaterThan(0);
  return text;
}

describe("the re-read cannot quietly stop being automatic", () => {
  /*
   * RULE 46, POINTED AT THIS MECHANISM. The whole value of the sweep
   * is that nobody has to remember it. A refactor that drops it from
   * the cron leaves a desk that looks exactly like a desk with no
   * wrong notes in it — the failure is invisible on every surface,
   * which is precisely the shape of failure that needs a test rather
   * than an intention.
   */
  it("rides the hourly tick, not the Sunday press, and not a button alone", () => {
    const index = source("/src/index.ts");
    const wired = index.indexOf("auditSweep");
    expect(wired, "auditSweep is no longer wired into the scheduled handler").toBeGreaterThan(-1);
    // The Sunday block ends before the hourly one begins; a watch on
    // the weekly press would check notes once a week.
    const sunday = index.indexOf('if (event.cron === "0 11 * * SUN")');
    const hourly = index.indexOf("THE LONG WALK rides every hourly firing");
    expect(sunday).toBeGreaterThan(-1);
    expect(hourly).toBeGreaterThan(sunday);
    expect(wired).toBeGreaterThan(hourly);
  });

  it("still refuses to send anything, however it was fired", () => {
    const outreach = source("/src/services/outreach.ts");
    const sweep = outreach.slice(outreach.indexOf("export async function auditSweep"));
    const body = sweep.slice(0, sweep.indexOf("\nexport ", 1));
    // The one thing a cron must never grow: a road to the wire.
    expect(body).not.toContain("deliverWireNote");
    expect(body).not.toContain("resend.com");
    expect(body).toContain("auditSentNotes");
  });
});

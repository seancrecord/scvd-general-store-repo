import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  LIVE_READING_FRESH_HOURS,
  VERIFY_BATCH_CAP,
  draftNote,
  handDraftFor,
  liveReadingFor,
  verifyNext,
  verifyProspect,
  type OutreachLedger,
  type Prospect,
} from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * NO LIVE READING, NO NOTE (2026-09-05).
 *
 * On 2026-09-05 a hand-delivered note told the operator of a paid
 * door that "no x402 buyer can pay" it, on a stored row the
 * instrument corrected the day before had already stopped writing.
 * The operator ran our free preflight and got ready. The wire had
 * re-probed live at press since 2026-08-20; the hand road never did.
 * These tests hold the hand road to the same law: the note is drafted
 * from a live reading no older than a sitting, or it does not exist.
 */

const probe = vi.fn(async (): Promise<Omit<WardHostResult, "host" | "url">> => ({
  verdict: "not_ready",
  failed: ["payto-payable"],
  advisories: [],
  battery: "preflight-v2",
}));

vi.mock("@/services/ward-round", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/ward-round")>();
  return { ...original, probeHost: (...args: unknown[]) => probe(...(args as [])) };
});

afterEach(() => {
  probe.mockClear();
});

function prospect(host: string): Prospect {
  return {
    host,
    url: `https://${host}/route`,
    verdict: "not_ready",
    failed: ["payto-payable"],
    week: "2026-W36",
    observed_at: "2026-09-05T13:27:08.998Z",
    newly_failing: false,
    reason: "answers, but not as an x402 door: payto-payable",
  };
}

function scouted(...hosts: string[]): OutreachLedger {
  return {
    version: 1,
    hosts: Object.fromEntries(
      hosts.map((h) => [h, { contacts: [`mailto:ops@${h}`], scouted_at: "2026-09-05T00:00:00.000Z" }]),
    ),
  };
}

function wardHost(name: string): WardHostResult {
  return {
    host: name,
    url: `https://${name}/route`,
    verdict: "not_ready",
    failed: ["payto-payable"],
    advisories: [],
  };
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

const NOW = new Date("2026-09-05T22:41:00.000Z");

describe("verify live: the knock before the note", () => {
  it("writes the live reading on the ledger and the note is drafted from it, not the week's row", async () => {
    const ledger = scouted("door.example");
    const outcome = await verifyProspect(testEnv, "door.example", [prospect("door.example")], ledger, NOW);
    expect(outcome.result).toBe("reproduced");
    expect(probe).toHaveBeenCalledTimes(1);
    const entry = ledger.hosts["door.example"]!;
    expect(entry.live).toEqual({
      at: NOW.toISOString(),
      verdict: "not_ready",
      failed: ["payto-payable"],
      battery: "preflight-v2",
    });
    expect(entry.verified_at).toBe(NOW.toISOString());
    // The ledger write landed, so the page reads the same reading.
    const stored = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.outreachLedger)) ?? "{}") as OutreachLedger;
    expect(stored.hosts["door.example"]?.live?.at).toBe(NOW.toISOString());

    const note = handDraftFor(prospect("door.example"), entry, BASE, NOW)!;
    // Dated to the re-check, with its time, not to the round's seal.
    expect(note).toContain("On 2026-09-05 our weekly probe");
    expect(note).toContain("re-checked live at 22:41 UTC on 2026-09-05");
    expect(note).toContain("First seen on our 2026-W36 weekly pass");
    // The finding is what the check saw, by name, with its definition.
    expect(note).toContain("What failed, by name: payto-payable");
    expect(note).toContain(`${BASE}/api/preflight/v2`);
    expect(note).not.toContain("no x402 buyer can pay");
    expect(note).toContain("Subject: a failed readiness check on your x402 endpoint at door.example");
  });

  it("a door that answers ready is stamped fixed and gets no note", async () => {
    probe.mockResolvedValueOnce({ verdict: "ready", failed: [], advisories: [] });
    const ledger = scouted("healed.example");
    ledger.hosts["healed.example"]!.live = {
      at: "2026-09-05T20:00:00.000Z",
      verdict: "not_ready",
      failed: ["payto-payable"],
    };
    const outcome = await verifyProspect(testEnv, "healed.example", [prospect("healed.example")], ledger, NOW);
    expect(outcome.result).toBe("healed");
    const entry = ledger.hosts["healed.example"]!;
    expect(entry.status).toBe("fixed");
    expect(entry.live).toBeUndefined();
    expect(handDraftFor(prospect("healed.example"), entry, BASE, NOW)).toBeNull();
  });

  it("a door that gives no answer gets the unreachable note, still from the live reading", async () => {
    probe.mockResolvedValueOnce({ verdict: "unreachable", failed: [], advisories: [] });
    const ledger = scouted("dark.example");
    await verifyProspect(testEnv, "dark.example", [prospect("dark.example")], ledger, NOW);
    const note = handDraftFor(prospect("dark.example"), ledger.hosts["dark.example"], BASE, NOW)!;
    expect(note).toContain("got no usable answer at all");
    expect(note).toContain("Subject: your x402 endpoint at dark.example is turning buyers away");
  });

  it("refuses a host the round does not know rather than probing a stranger", async () => {
    const outcome = await verifyProspect(testEnv, "nobody.example", [prospect("door.example")], scouted(), NOW);
    expect(outcome.result).toBe("not-in-queue");
    expect(probe).not.toHaveBeenCalled();
  });

  it("a reading older than a sitting arms nothing", () => {
    const fresh = { at: NOW.toISOString(), verdict: "not_ready" as const, failed: ["status-402"] };
    expect(liveReadingFor({ live: fresh }, NOW)).toEqual(fresh);
    const later = new Date(NOW.getTime() + LIVE_READING_FRESH_HOURS * 3_600_000 + 1);
    expect(liveReadingFor({ live: fresh }, later)).toBeNull();
    // A reading from the future is not a reading.
    expect(liveReadingFor({ live: fresh }, new Date(NOW.getTime() - 1))).toBeNull();
    expect(liveReadingFor(undefined, NOW)).toBeNull();
    expect(handDraftFor(prospect("door.example"), { live: fresh }, BASE, later)).toBeNull();
  });

  it("the batch verifies the next ten reachable, unstamped, unread doors and stops at the cap", async () => {
    const hosts = Array.from({ length: 13 }, (_, i) => `door-${String(i).padStart(2, "0")}.example`);
    const ledger = scouted(...hosts);
    ledger.hosts["door-00.example"]!.status = "sent";
    ledger.hosts["door-01.example"]!.status = "skip";
    ledger.hosts["door-02.example"]!.live = { at: NOW.toISOString(), verdict: "not_ready", failed: ["status-402"] };
    delete ledger.hosts["door-03.example"]!.contacts;
    probe.mockResolvedValueOnce({ verdict: "ready", failed: [], advisories: [] });
    const report = await verifyNext(testEnv, hosts.map(prospect), ledger, NOW);
    // 13 minus sent, skip, already read, no address = 9 eligible; under the cap.
    expect(probe).toHaveBeenCalledTimes(9);
    expect(report.healed).toEqual(["door-04.example"]);
    expect(report.reproduced.length).toBe(8);
    expect(report.remaining).toBe(0);
    expect(VERIFY_BATCH_CAP).toBe(10);
  });
});

describe("the desk: no reading, no link", () => {
  const auth = {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };

  it("draws the verify button where the Gmail link was, until a fresh reading exists", async () => {
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(round([wardHost("unread.example"), wardHost("read.example"), wardHost("stale.example")])),
    );
    const ledger = scouted("unread.example", "read.example", "stale.example");
    ledger.hosts["read.example"]!.live = {
      at: new Date().toISOString(),
      verdict: "not_ready",
      failed: ["payto-payable"],
    };
    ledger.hosts["stale.example"]!.live = {
      at: new Date(Date.now() - (LIVE_READING_FRESH_HOURS + 1) * 3_600_000).toISOString(),
      verdict: "not_ready",
      failed: ["payto-payable"],
    };
    await testEnv.COUNTERS.put(KV_KEYS.outreachLedger, JSON.stringify(ledger));
    const text = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    const unsent = text.slice(text.indexOf('id="unsent"'), text.indexOf("</section>", text.indexOf('id="unsent"')));
    const rowFor = (host: string) =>
      unsent
        .split("<li>")
        .map((row) => row.slice(0, row.indexOf("</li>")))
        .find((row) => row.includes(`<strong>${host}</strong>`))!;

    const unread = rowFor("unread.example");
    expect(unread).toContain('action="/admin/outreach/verify"');
    expect(unread).not.toContain("mail.google.com");
    expect(unread).not.toContain('form="stamp-many"');

    const read = rowFor("read.example");
    expect(read).toContain("mail.google.com/mail/?view=cm");
    expect(read).toContain('form="stamp-many"');
    expect(read).toContain("re-probed live");
    expect(read).not.toContain('action="/admin/outreach/verify"');

    const stale = rowFor("stale.example");
    expect(stale).toContain('action="/admin/outreach/verify"');
    expect(stale).toContain("no longer arms a note");
    expect(stale).not.toContain("mail.google.com");

    // The batch button counts the doors one press would knock on.
    expect(unsent).toContain('action="/admin/outreach/verify-many"');
    expect(unsent).toContain("Verify live the next 2");
    expect(text).toContain("No live reading, no note.");

    // The card says the same: no draft from the week's row.
    const card = text.slice(text.indexOf('id="card-unread.example"'), text.indexOf("</section>", text.indexOf('id="card-unread.example"')));
    expect(card).toContain("No note yet");
    expect(card).not.toContain("mail.google.com");
    expect(card).not.toContain("payto-payable</pre>");
    const readCard = text.slice(text.indexOf('id="card-read.example"'), text.indexOf("</section>", text.indexOf('id="card-read.example"')));
    expect(readCard).toContain("drafted from the live reading");
    expect(readCard).toContain("mail.google.com");
  });

  it("the routes stay behind the login and say what the press did", async () => {
    expect((await SELF.fetch(`${BASE}/admin/outreach/verify`, { method: "POST" })).status).toBe(401);
    expect((await SELF.fetch(`${BASE}/admin/outreach/verify-many`, { method: "POST" })).status).toBe(401);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round([wardHost("door.example")])));
    await testEnv.COUNTERS.put(KV_KEYS.outreachLedger, JSON.stringify(scouted("door.example")));
    const response = await SELF.fetch(`${BASE}/admin/outreach/verify`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "host=door.example",
    });
    expect(response.status).toBe(200);
    const outcome = (await response.json()) as { result: string; live?: { failed: string[] } };
    expect(outcome.result).toBe("reproduced");
    expect(outcome.live?.failed).toEqual(["payto-payable"]);
    const stored = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.outreachLedger)) ?? "{}") as OutreachLedger;
    expect(stored.hosts["door.example"]?.live?.failed).toEqual(["payto-payable"]);
    // And now the page carries the link.
    const text = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    expect(text).toContain("mail.google.com/mail/?view=cm");
  });
});

describe("the old sentence is gone from every draft", () => {
  it("never says no buyer can pay about a door that answered", () => {
    const note = draftNote(prospect("door.example"), BASE);
    expect(note).not.toContain("no x402 buyer can pay");
    expect(note).toContain("did not pass our readiness check");
  });
});

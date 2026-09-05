import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  AUDIT_BATCH_CAP,
  auditSentNotes,
  auditedNotes,
  type OutreachLedger,
} from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE DOORS WE WROTE TO, RE-READ (2026-09-05; the keeper: "how do we
 * check more of this to make sure we are airtight").
 *
 * A note is a claim with a date on it. Two operators corrected one
 * each in a single afternoon, on their schedule. This press is the
 * desk finding the next one first: every host a note went to is
 * knocked on again by the instrument as it is now, the answer is laid
 * beside the row the note came from, and a disagreement is named for
 * the keeper — never resolved by arithmetic, because "healed since"
 * and "ours" look identical from here.
 */

const probe = vi.fn(async (url: string): Promise<Omit<WardHostResult, "host" | "url">> =>
  url.includes("healed-or-wrong")
    ? { verdict: "ready", failed: [], advisories: [], battery: "preflight-v2" }
    : { verdict: "not_ready", failed: ["status-402"], advisories: [], battery: "preflight-v2" },
);

vi.mock("@/services/ward-round", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/services/ward-round")>();
  return { ...original, probeHost: (_env: unknown, url: string) => probe(url) };
});

afterEach(() => probe.mockClear());

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

function ledgerOf(entries: Record<string, OutreachLedger["hosts"][string]>): OutreachLedger {
  return { version: 1, hosts: entries };
}

const NOW = new Date("2026-09-05T23:05:00.000Z");

describe("the re-read of every door we wrote to", () => {
  it("knocks on each written-to door, stores the reading, and names the disagreements", async () => {
    const latest = round([
      wardHost("healed-or-wrong.example", "not_ready", ["payto-payable"]),
      wardHost("still-broken.example", "not_ready", ["status-402"]),
      wardHost("never-written.example", "not_ready", ["status-402"]),
    ]);
    const ledger = ledgerOf({
      "healed-or-wrong.example": { status: "sent", status_at: "2026-09-05T18:00:00.000Z" },
      "still-broken.example": { status: "replied", status_at: "2026-09-04T18:00:00.000Z" },
      "never-written.example": { contacts: ["mailto:ops@never-written.example"] },
      "delisted.example": { status: "sent", status_at: "2026-08-20T18:00:00.000Z" },
    });
    const report = await auditSentNotes(testEnv, latest, ledger, NOW);
    // Only doors a note went to, and only ones this round can knock on.
    expect(probe).toHaveBeenCalledTimes(2);
    expect(report.no_door).toEqual(["delisted.example"]);
    expect(report.remaining).toBe(0);
    const byHost = Object.fromEntries(report.rows.map((row) => [row.host, row]));
    expect(byHost["healed-or-wrong.example"]!.disagrees).toBe(true);
    expect(byHost["healed-or-wrong.example"]!.row).toEqual({ verdict: "not_ready", failed: ["payto-payable"] });
    expect(byHost["healed-or-wrong.example"]!.audit.verdict).toBe("ready");
    expect(byHost["still-broken.example"]!.disagrees).toBe(false);
    // The reading is kept on the entry, dated, with the battery that spoke.
    expect(ledger.hosts["healed-or-wrong.example"]!.audit).toEqual({
      at: NOW.toISOString(),
      verdict: "ready",
      failed: [],
      battery: "preflight-v2",
    });
    const stored = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.outreachLedger)) ?? "{}") as OutreachLedger;
    expect(stored.hosts["still-broken.example"]?.audit?.verdict).toBe("not_ready");
    // The page's read of the same ledger, no knock: disagreements first.
    expect(auditedNotes(latest, ledger).map((row) => row.host)).toEqual([
      "healed-or-wrong.example",
      "still-broken.example",
    ]);
  });

  it("is bounded to ten a press, oldest re-read first, and a stamp-only host is left alone", async () => {
    const hosts = Array.from({ length: 12 }, (_, i) => `written-${String(i).padStart(2, "0")}.example`);
    const latest = round(hosts.map((h) => wardHost(h, "not_ready", ["status-402"])));
    const entries: OutreachLedger["hosts"] = {};
    for (const [i, host] of hosts.entries()) {
      entries[host] = {
        status: "sent",
        status_at: "2026-09-01T00:00:00.000Z",
        // The first two were re-read yesterday; they go to the back.
        ...(i < 2 ? { audit: { at: "2026-09-04T00:00:00.000Z", verdict: "not_ready" as const, failed: ["status-402"] } } : {}),
      };
    }
    entries["skipped.example"] = { status: "skip", contacts: ["mailto:ops@skipped.example"] };
    const report = await auditSentNotes(testEnv, latest, ledgerOf(entries), NOW);
    expect(AUDIT_BATCH_CAP).toBe(10);
    expect(probe).toHaveBeenCalledTimes(10);
    expect(report.remaining).toBe(2);
    const read = report.rows.map((row) => row.host);
    expect(read).not.toContain("written-00.example");
    expect(read).not.toContain("written-01.example");
    expect(read).not.toContain("skipped.example");
  });
});

describe("the desk shows the re-reads and the press", () => {
  const auth = {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };

  it("names the disagreeing doors at the top of the section, and the route re-reads on a press", async () => {
    const latest = round([
      wardHost("healed-or-wrong.example", "not_ready", ["payto-payable"]),
      wardHost("still-broken.example", "not_ready", ["status-402"]),
    ]);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(latest));
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify(
        ledgerOf({
          "healed-or-wrong.example": { status: "sent", status_at: "2026-09-05T18:00:00.000Z" },
          "still-broken.example": { status: "sent", status_at: "2026-09-05T18:00:00.000Z" },
        }),
      ),
    );
    expect((await SELF.fetch(`${BASE}/admin/outreach/audit-sent`, { method: "POST" })).status).toBe(401);
    const before = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    expect(before).toContain('id="audit"');
    expect(before).toContain("Doors we wrote to, re-read (0 of 2)");
    expect(before).toContain('action="/admin/outreach/audit-sent"');

    const pressed = await SELF.fetch(`${BASE}/admin/outreach/audit-sent`, {
      method: "POST",
      headers: { ...auth, Accept: "application/json" },
    });
    expect(pressed.status).toBe(200);
    const report = (await pressed.json()) as { rows: { host: string; disagrees: boolean }[] };
    expect(report.rows.find((row) => row.host === "healed-or-wrong.example")?.disagrees).toBe(true);

    const after = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    const section = after.slice(after.indexOf('id="audit"'), after.indexOf("</section>", after.indexOf('id="audit"')));
    expect(section).toContain("Doors we wrote to, re-read (2 of 2)");
    expect(section).toContain("1 disagrees");
    expect(section.indexOf("healed-or-wrong.example")).toBeLessThan(section.indexOf("still-broken.example"));
    expect(section).toContain("disagree — healed since, or ours");
    expect(section).toContain("the row says <code>not_ready (payto-payable)</code>");
  });
});

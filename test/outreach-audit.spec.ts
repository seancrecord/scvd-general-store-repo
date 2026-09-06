import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  AUDIT_BATCH_CAP,
  AUDIT_PRESS_CAP,
  AUDIT_SWEEP_CAP,
  auditSentNotes,
  auditSweep,
  auditedNotes,
  callAudit,
  draftCorrection,
  type ClaimedNote,
  type NoteAudit,
  type OutreachLedger,
} from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE DOORS WE WROTE TO, RE-READ (2026-09-05; sharpened and put on a
 * clock 2026-09-06).
 *
 * A note is a claim with a date on it. Two operators corrected one
 * each in a single afternoon, on their schedule. This is the desk
 * finding the next one first — and, since the keeper's answer to
 * "where do I press that" was that it should not need a press, on a
 * clock rather than on a button.
 *
 * Three things are pinned here, because each of them was wrong once:
 *   1. The re-read is held against WHAT THE NOTE CLAIMED, not against
 *      whatever the census says today. Those are the same thing for
 *      exactly one week.
 *   2. The comparison is on the CHECKS the note named, not on the
 *      readiness bit. A note naming `payto-payable` at a door that now
 *      fails `amount-atomic` is a wrong note, and the readiness bit
 *      calls that pair "agree".
 *   3. `ours` is DERIVED from the retraction ledger and nothing else.
 *      Everything that merely changed stays the keeper's call, because
 *      healed-from-ours is not visible from outside a door.
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

function claim(failed: string[], networks?: string[]): ClaimedNote {
  return {
    at: "2026-09-01T09:00:00.000Z",
    week: "2026-W36",
    verdict: "not_ready",
    failed,
    ...(networks ? { networks } : {}),
  };
}

function reading(verdict: NoteAudit["verdict"], failed: string[] = []): NoteAudit {
  return { at: "2026-09-06T09:00:00.000Z", verdict, failed };
}

const NOW = new Date("2026-09-05T23:05:00.000Z");

describe("the call on a re-read", () => {
  it("agrees only while the checks the note NAMED still fail", () => {
    expect(callAudit(claim(["payto-payable"]), reading("not_ready", ["payto-payable"])).call).toBe("agree");
    /*
     * THE BUG THIS PINS: the old rule compared readiness bits, so this
     * pair — a note naming one check at a door now failing a different
     * one — read "agree" and sat in the quiet pile. Both are not_ready
     * and the note is wrong anyway.
     */
    const moved = callAudit(claim(["payto-payable"]), reading("not_ready", ["amount-atomic"]));
    expect(moved.call).toBe("look");
    expect(moved.why).toContain("payto-payable");
    expect(moved.why).toContain("no longer fails");
  });

  it("derives OURS when every check the note named has been retracted, and never guesses otherwise", () => {
    // 2026-W36, payto-payable, on a rail the pre-2026-09-04 reader
    // could not speak: the retraction ledger answers this one.
    const retracted = callAudit(
      claim(["payto-payable"], ["algorand:mainnet"]),
      reading("ready"),
    );
    expect(retracted.call).toBe("ours");
    expect(retracted.correction_date).toBe("2026-09-04");

    // Same door, same week, but the note ALSO named a check the
    // correction never touched. All-or-nothing: not a retraction.
    expect(
      callAudit(claim(["payto-payable", "status-402"], ["algorand:mainnet"]), reading("ready")).call,
    ).toBe("look");

    // Same checks, a rail the old reader could read correctly.
    expect(callAudit(claim(["payto-payable"], ["eip155:8453"]), reading("ready")).call).toBe("look");

    // A door that simply came back, with nothing retracted anywhere.
    const healed = callAudit(claim(["status-402"]), reading("ready"));
    expect(healed.call).toBe("look");
    expect(healed.why).toContain("Healed since, or ours");
  });

  it("refuses to call a reachability swing either way, and refuses a note it has no record of", () => {
    expect(callAudit({ ...claim([]), verdict: "unreachable" }, reading("unreachable")).call).toBe("agree");
    expect(callAudit({ ...claim([]), verdict: "unreachable" }, reading("not_ready", ["status-402"])).call).toBe("look");
    expect(callAudit(claim(["status-402"]), reading("unreachable")).call).toBe("look");
    expect(callAudit(null, reading("ready")).call).toBe("look");
  });
});

describe("the re-read of every door we wrote to", () => {
  it("knocks on each written-to door, stores the reading, and holds it against the note's own claim", async () => {
    const latest = round([
      wardHost("healed-or-wrong.example", "not_ready", ["payto-payable"]),
      wardHost("still-broken.example", "not_ready", ["status-402"]),
      wardHost("never-written.example", "not_ready", ["status-402"]),
    ]);
    const ledger = ledgerOf({
      "healed-or-wrong.example": {
        status: "sent",
        status_at: "2026-09-05T18:00:00.000Z",
        claimed: claim(["payto-payable"], ["algorand:mainnet"]),
      },
      "still-broken.example": {
        status: "replied",
        status_at: "2026-09-04T18:00:00.000Z",
        claimed: claim(["status-402"]),
      },
      "never-written.example": { contacts: ["mailto:ops@never-written.example"] },
      "delisted.example": { status: "sent", status_at: "2026-08-20T18:00:00.000Z" },
    });
    const report = await auditSentNotes(testEnv, latest, ledger, NOW);
    // Only doors a note went to, and only ones this round can knock on.
    expect(probe).toHaveBeenCalledTimes(2);
    expect(report.no_door).toEqual(["delisted.example"]);
    expect(report.remaining).toBe(0);
    const byHost = Object.fromEntries(report.rows.map((row) => [row.host, row]));
    expect(byHost["healed-or-wrong.example"]!.finding.call).toBe("ours");
    expect(byHost["healed-or-wrong.example"]!.baseline).toBe("note");
    expect(byHost["healed-or-wrong.example"]!.audit.verdict).toBe("ready");
    expect(byHost["still-broken.example"]!.finding.call).toBe("agree");
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
    // The page's read of the same ledger, no knock: ours first.
    expect(auditedNotes(latest, ledger).map((row) => row.host)).toEqual([
      "healed-or-wrong.example",
      "still-broken.example",
    ]);
  });

  it("falls back to the census row for a note stamped before claims were frozen, and SAYS it did", async () => {
    const latest = round([wardHost("legacy.example", "not_ready", ["status-402"])]);
    const ledger = ledgerOf({
      "legacy.example": { status: "sent", status_at: "2026-08-20T18:00:00.000Z" },
    });
    const report = await auditSentNotes(testEnv, latest, ledger, NOW);
    expect(report.rows[0]!.baseline).toBe("round");
    expect(report.rows[0]!.claim?.failed).toEqual(["status-402"]);
  });

  it("is bounded, oldest re-read first, and a stamp-only host is left alone", async () => {
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
    const report = await auditSentNotes(testEnv, latest, ledgerOf(entries), NOW, {
      cap: AUDIT_BATCH_CAP,
    });
    expect(AUDIT_BATCH_CAP).toBe(10);
    expect(probe).toHaveBeenCalledTimes(10);
    expect(report.remaining).toBe(2);
    const read = report.rows.map((row) => row.host);
    expect(read).not.toContain("written-00.example");
    expect(read).not.toContain("written-01.example");
    expect(read).not.toContain("skipped.example");
  });
});

describe("the sweep — the re-read on a clock", () => {
  it("knocks on at most a pass, skips doors re-read within the day, and pages only what disagrees", async () => {
    const latest = round([
      wardHost("healed-or-wrong.example", "not_ready", ["payto-payable"]),
      ...Array.from({ length: 6 }, (_, i) => wardHost(`quiet-${i}.example`, "not_ready", ["status-402"])),
      wardHost("read-today.example", "not_ready", ["status-402"]),
    ]);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(latest));
    const entries: OutreachLedger["hosts"] = {
      "healed-or-wrong.example": {
        status: "sent",
        status_at: "2026-09-01T00:00:00.000Z",
        claimed: claim(["payto-payable"], ["algorand:mainnet"]),
      },
      /*
       * Re-read an hour ago. The sweep runs every half hour; without
       * the floor it would spend every pass on the same few doors and
       * never reach the rest, and each knock is somebody's server.
       */
      "read-today.example": {
        status: "sent",
        status_at: "2026-09-01T00:00:00.000Z",
        claimed: claim(["status-402"]),
        audit: { at: "2026-09-05T22:05:00.000Z", verdict: "not_ready", failed: ["status-402"] },
      },
    };
    for (let i = 0; i < 6; i += 1) {
      entries[`quiet-${i}.example`] = {
        status: "sent",
        status_at: "2026-09-01T00:00:00.000Z",
        claimed: claim(["status-402"]),
      };
    }
    await testEnv.COUNTERS.put(KV_KEYS.outreachLedger, JSON.stringify(ledgerOf(entries)));

    const report = await auditSweep(testEnv, NOW);
    expect(AUDIT_SWEEP_CAP).toBe(5);
    expect(report!.rows).toHaveLength(5);
    expect(report!.rows.map((row) => row.host)).not.toContain("read-today.example");
    // Oldest re-read first, so the never-read doors go before it.
    expect(report!.remaining).toBe(2);

    const alerts = await testEnv.COUNTERS.list({ prefix: "alert_open:" });
    const keys = alerts.keys.map((k) => k.name);
    expect(keys).toContain("alert_open:worker_health:note-audit:ours:healed-or-wrong.example");
    // Nothing pages for a door that still fails exactly what we said.
    expect(keys.some((k) => k.includes("quiet-"))).toBe(false);
  });
});

describe("the correction, written by the desk", () => {
  it("is drafted for an OURS row, names the retraction, and asks for nothing", () => {
    const row = {
      host: "402signal.example",
      status: "sent" as const,
      status_at: "2026-09-05T18:00:00.000Z",
      claim: claim(["payto-payable"], ["algorand:mainnet"]),
      baseline: "note" as const,
      row: null,
      audit: reading("ready"),
      finding: callAudit(claim(["payto-payable"], ["algorand:mainnet"]), reading("ready")),
      disagrees: true,
    };
    const draft = draftCorrection(row, BASE)!;
    expect(draft).toContain("Subject: correcting what we sent you about 402signal.example");
    expect(draft).toContain("We were wrong");
    expect(draft).toContain(`${BASE}/corrections`);
    expect(draft).toContain("2026-09-04");
    expect(draft).toContain("payto-payable");
    // A correction with a sales line at the bottom is not a correction.
    expect(draft).not.toContain("/menu/");
    expect(draft).toContain("nothing to buy here");
    // Nothing is drafted for a row the desk has not derived as ours.
    expect(draftCorrection({ ...row, finding: { call: "look", why: "x" } }, BASE)).toBeNull();
  });
});

describe("the desk shows the re-reads and the press", () => {
  const auth = {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };

  it("names the OURS doors at the top with their correction, and the route re-reads on a press", async () => {
    const latest = round([
      wardHost("healed-or-wrong.example", "not_ready", ["payto-payable"]),
      wardHost("still-broken.example", "not_ready", ["status-402"]),
    ]);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(latest));
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify(
        ledgerOf({
          "healed-or-wrong.example": {
            status: "sent",
            status_at: "2026-09-05T18:00:00.000Z",
            contacts: ["mailto:ops@healed-or-wrong.example"],
            claimed: claim(["payto-payable"], ["algorand:mainnet"]),
          },
          "still-broken.example": {
            status: "sent",
            status_at: "2026-09-05T18:00:00.000Z",
            claimed: claim(["status-402"]),
          },
        }),
      ),
    );
    expect((await SELF.fetch(`${BASE}/admin/outreach/audit-sent`, { method: "POST" })).status).toBe(401);
    const before = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    expect(before).toContain('id="audit"');
    expect(before).toContain("Doors we wrote to, re-read (0 of 2)");
    expect(before).toContain('action="/admin/outreach/audit-sent"');
    // The press is one press now, not a ritual of ten at a time.
    expect(before).toContain(`Re-read now — up to ${AUDIT_PRESS_CAP} in one press`);
    expect(before).toContain("five a pass on the half-hourly tick");

    const pressed = await SELF.fetch(`${BASE}/admin/outreach/audit-sent`, {
      method: "POST",
      headers: { ...auth, Accept: "application/json" },
    });
    expect(pressed.status).toBe(200);
    const report = (await pressed.json()) as {
      rows: { host: string; finding: { call: string } }[];
    };
    expect(report.rows.find((row) => row.host === "healed-or-wrong.example")?.finding.call).toBe("ours");

    const after = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    const section = after.slice(after.indexOf('id="audit"'), after.indexOf("</section>", after.indexOf('id="audit"')));
    expect(section).toContain("Doors we wrote to, re-read (2 of 2)");
    expect(section).toContain("1 is OURS");
    expect(section.indexOf("healed-or-wrong.example")).toBeLessThan(section.indexOf("still-broken.example"));
    expect(section).toContain("OURS — a correction is owed");
    expect(section).toContain("the note claimed <code>not_ready (payto-payable)</code>");
    // The correction is written and one press from going.
    expect(section).toContain("read the correction");
    expect(section).toContain("open in Gmail — the correction already written");
  });
});

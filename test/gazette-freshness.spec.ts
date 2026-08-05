import { SELF, env } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { invertedTimestamp } from "@/lib/kv-keys";
import type { MetricEvent } from "@/lib/metrics";
import {
  assembleDraft,
  describeDrift,
  draftFreshness,
  getDraft,
  publishEdition,
  StaleDraftError,
} from "@/services/gazette-weekly";
import type { Env, GazetteDraft } from "@/types";

/**
 * THE PRESS CANNOT PRINT A NUMBER THAT WAS TRUE ONCE.
 *
 * Found live 2026-08-03: a draft assembled 02:37 UTC said "No
 * purchases settled" while a real organic settlement landed at 02:39 —
 * two minutes after the snapshot — and the draft sat on the keeper's
 * desk for two days still saying it. Nothing compared the draft to the
 * books between assembly and publish, so the paper of record was one
 * click away from printing a falsehood assembled from true inputs.
 *
 * The gate REFUSES rather than silently re-assembling, and the reason
 * is pinned here so nobody "improves" it later: publishEdition prints
 * the markdown it is HANDED — the keeper's edited text — not the
 * stored draft. A silent re-assemble would discard his edits and print
 * machine prose under his pen, which is the exact thing rule 7 forbids.
 */

const testEnv = env as unknown as Env;
const adminAuth = {
  Authorization: `Basic ${btoa("keeper:test-admin-password")}`,
  "Content-Type": "application/x-www-form-urlencoded",
};

/** A real organic settlement row, shaped as metrics.ts writes them. */
async function landSettlement(item = "small_blessing"): Promise<void> {
  const event: MetricEvent = {
    kind: "settle",
    item,
    channel: "direct",
    house: false,
    at: new Date().toISOString(),
  };
  await testEnv.COUNTERS.put(
    `evt:${invertedTimestamp(Date.now())}:${Math.random().toString(36).slice(2, 8)}`,
    JSON.stringify(event),
  );
}

async function clearDesk(): Promise<void> {
  await testEnv.ORDERS.delete("gazette_draft");
}

afterEach(async () => {
  await clearDesk();
});

describe("the freshness gate", () => {
  it("a draft the books have not moved past is fresh and publishes", async () => {
    const draft = await assembleDraft(testEnv, true);
    expect(draft).not.toBeNull();
    const freshness = await draftFreshness(testEnv, draft);
    expect(freshness.stale).toBe(false);
    expect(freshness.changes).toEqual([]);
    // And the press prints it.
    const edition = await publishEdition(testEnv, draft!.markdown);
    expect(edition.issue_number).toBeGreaterThan(0);
  });

  it("a settlement after assembly makes the draft stale, and the change is NAMED", async () => {
    const draft = await assembleDraft(testEnv, true);
    expect(draft).not.toBeNull();
    await landSettlement();
    const freshness = await draftFreshness(testEnv, draft);
    expect(freshness.stale).toBe(true);
    expect(freshness.unverifiable).toBe(false);
    // Not a bare flag — the keeper is told what moved and how much.
    expect(freshness.changes.join(" ")).toContain("1 purchase has settled");
  });

  it("publishEdition REFUSES a stale draft rather than printing over it", async () => {
    const draft = await assembleDraft(testEnv, true);
    await landSettlement();
    await expect(publishEdition(testEnv, draft!.markdown)).rejects.toThrow(
      StaleDraftError,
    );
    // The refusal did not consume the draft or bump the issue count:
    // the desk still holds it for the keeper to re-assemble.
    expect(await getDraft(testEnv)).not.toBeNull();
  });

  it("a draft with no snapshot cannot be proven fresh, so it is stale — not clean", async () => {
    // A draft written before 2026-08-03, verbatim shape minus snapshot.
    const legacy: GazetteDraft = {
      week: "2026-W31",
      period_start: "2026-07-22T00:00:00.000Z",
      created_at: "2026-08-01T02:37:00.000Z",
      markdown: "# The Gazette · Edition No. 1\n\nNo purchases settled.",
      organic_events: 3,
    };
    await testEnv.ORDERS.put("gazette_draft", JSON.stringify(legacy));
    const freshness = await draftFreshness(testEnv, await getDraft(testEnv));
    expect(freshness.stale).toBe(true);
    expect(freshness.unverifiable).toBe(true);
    await expect(publishEdition(testEnv, legacy.markdown)).rejects.toThrow(
      StaleDraftError,
    );
  });

  it("hand-setting with NO draft on the desk still publishes — nothing to be stale against", async () => {
    await clearDesk();
    const edition = await publishEdition(
      testEnv,
      "# The Gazette · hand-set\n\nSet by the keeper with no draft.",
    );
    expect(edition.issue_number).toBeGreaterThan(0);
  });

  it("re-counts that come back LOWER do not fire the gate", () => {
    // Counters here are read-modify-write against eventually-consistent
    // KV and can lose increments; a lower re-count is instrument noise,
    // not news (LEDGER_READINGS 2026-07-26). A gate that fired on it
    // would cry wolf until nobody read it.
    const before = {
      settles: 5, porchCrossings: 10, bellRings: 3, newFaces: 2,
      signatures: 4, lettersReceived: 1, triedTheDoor: 2, corrections: 1,
      shelfChanges: 0, scanTruncated: false,
    };
    const after = { ...before, porchCrossings: 8, signatures: 3 };
    expect(describeDrift(before, after)).toEqual([]);
  });

  it("a scan that newly runs past its cap counts as drift", () => {
    const before = {
      settles: 0, porchCrossings: 0, bellRings: 0, newFaces: 0,
      signatures: 0, lettersReceived: 0, triedTheDoor: 0, corrections: 0,
      shelfChanges: 0, scanTruncated: false,
    };
    const after = { ...before, scanTruncated: true };
    const changes = describeDrift(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toContain("past its cap");
  });
});

describe("the admin desk", () => {
  it("the publish POST answers a stale draft with 409 and the movements named", async () => {
    const draft = await assembleDraft(testEnv, true);
    await landSettlement();
    const response = await SELF.fetch(
      "https://scvd.store/admin/gazette/edition/publish",
      {
        method: "POST",
        headers: adminAuth,
        body: new URLSearchParams({ markdown: draft!.markdown }).toString(),
      },
    );
    expect(response.status).toBe(409);
    const text = await response.text();
    expect(text).toContain("Not printed");
    expect(text).toContain("purchase");
    expect(text).toContain("Re-assemble");
  });

  it("the press left the counter with the 2026-08-05 retirement", async () => {
    // The freshness machinery stays correct behind the dormant
    // publish door; the counter no longer carries a press desk.
    await assembleDraft(testEnv, true);
    await landSettlement();
    const page = await SELF.fetch("https://scvd.store/admin/counter", {
      headers: { Authorization: adminAuth.Authorization },
    });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).not.toContain("The Gazette press");
    expect(html).not.toContain("/admin/gazette/edition/publish");
  });

  it("re-assembling folds the movement in, and the fresh draft publishes", async () => {
    await assembleDraft(testEnv, true);
    await landSettlement();
    // The keeper's re-assemble button.
    const reassemble = await SELF.fetch(
      "https://scvd.store/admin/gazette/edition/assemble",
      { method: "POST", headers: adminAuth, redirect: "manual" },
    );
    expect([302, 303]).toContain(reassemble.status);
    const refreshed = await getDraft(testEnv);
    expect(refreshed).not.toBeNull();
    // The settlement that made the old draft stale is now IN the paper.
    expect(refreshed!.markdown).not.toContain("No purchases settled");
    const edition = await publishEdition(testEnv, refreshed!.markdown);
    expect(edition.markdown).toContain("small_blessing");
  });
});

describe("the source itself", () => {
  it("the press's own files are valid UTF-8 — the edition title once shipped mojibake", async () => {
    // Found 2026-08-03: `The Gazette \xb7 Edition` — a bare latin-1
    // middle dot in a UTF-8 file. Served bytes rendered as U+FFFD on
    // every reader, and the spec ASSERTED the corruption because the
    // test file carried the identical bad byte: two instruments,
    // corrupted identically, agreeing with each other. Vite decodes
    // source as UTF-8, so a bad byte arrives here as U+FFFD.
    const service = (await import("../src/services/gazette-weekly.ts?raw"))
      .default;
    expect(service).not.toContain("�");
    expect(service).toContain("The Gazette · Edition");
  });
});

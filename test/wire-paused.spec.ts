import { env } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WIRE_PAUSED_SINCE,
  wireAllScouted,
  wireNote,
  type OutreachLedger,
  type Prospect,
} from "@/services/outreach";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;

/**
 * THE WIRE IS PAUSED, AND THE PAUSE LIVES IN THE WIRE (keeper's
 * ruling, 2026-08-26: "flip off auto emails").
 *
 * On 2026-08-21 Symantec/Bluecoat categorized scvd.store as
 * "Suspicious and Spam" and FortiGuard as "Spam URLs, High Risk" —
 * FortiGuard's own definition of that category is "URLs found in
 * spam emails," and the store's outbound operator notes are the only
 * emails this domain has ever sent to strangers. Within five days,
 * two real reviewers behind corporate filters reported the site as
 * down or under construction. Every note sent while the domain is
 * flagged deepens the exact signal the recategorization disputes are
 * trying to reverse.
 *
 * The pause is a REFUSAL INSIDE wireNote, not a hidden admin button
 * or an env var someone has to remember: the admin levers still
 * exist, still render, and now decline with the reason and the date,
 * because the failure mode this guards against is muscle memory on a
 * button that worked last week. Scouting, drafting, and the ledger
 * all keep working — the round keeps learning who to write to, so
 * un-pausing costs one line.
 */

const prospect: Prospect = {
  host: "broken.example",
  url: "https://broken.example/api/x",
  verdict: "not_ready",
  failed: ["challenge-shape"],
  week: "2026-W35",
  observed_at: "2026-08-26T12:00:00.000Z",
  newly_failing: true,
  reason: "answers, but not as an x402 door",
};

function scoutedLedger(): OutreachLedger {
  return {
    version: 1,
    hosts: {
      "broken.example": {
        contacts: ["sec@broken.example"],
      },
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("the wire refuses while the domain is flagged", () => {
  it("declines a single send before probing or mailing anything", async () => {
    const fetchSpy = vi.fn(async () => new Response("must not be called"));
    vi.stubGlobal("fetch", fetchSpy);

    const outcome = await wireNote(
      testEnv,
      "broken.example",
      [prospect],
      scoutedLedger(),
    );
    expect(outcome.sent).toBe(false);
    expect(!outcome.sent && outcome.reason).toBe("wire-paused");
    // The refusal explains itself: the date and the cause ride in the
    // detail, so the person who presses the button in October learns
    // why it declined without an archaeology session.
    expect(!outcome.sent && outcome.detail).toContain(WIRE_PAUSED_SINCE);
    expect(!outcome.sent && outcome.detail.toLowerCase()).toContain("spam");
    /*
     * BEFORE the probe, not after: a paused wire that still knocked on
     * the stranger's door would be half-paused, and the probe is the
     * expensive, visible half.
     */
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops the batch on the first pause instead of logging it per host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("must not be called")),
    );
    const report = await wireAllScouted(testEnv, [prospect], scoutedLedger());
    expect(report.sent).toEqual([]);
    expect(report.refused.length).toBe(1);
    expect(report.refused[0]!.reason).toContain(WIRE_PAUSED_SINCE);
  });

  it("names the pause on the constant, dated, so unpausing is one visible edit", () => {
    expect(WIRE_PAUSED_SINCE).toBe("2026-08-26");
  });

  it("no route can reach delivery around the pause", async () => {
    /*
     * deliverWireNote exists so the wire's behavior stays specified
     * while paused. If a route ever imported it directly, the pause
     * would be decoration. Read, clearly labeled as read: this
     * asserts imports, and the two tests above exercise the refusal
     * for real.
     */
    const admin = (await import("../src/routes/admin.ts?raw"))
      .default as unknown as string;
    expect(admin).toContain("wireNote");
    expect(admin).not.toContain("deliverWireNote");
  });
});

import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  deriveProspects,
  deriveWelcomes,
  draftNote,
  draftWelcome,
  healedAfterOutreach,
  parseSecurityContacts,
  type OutreachLedger,
} from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE OUTREACH DESK — the rules these tests hold are the consent
 * rules: the queue derives fresh from rounds (no stored scores), the
 * draft is a dated observation the recipient can verify themselves,
 * and no route on this desk transmits anything to anyone.
 */

function host(
  name: string,
  verdict: WardHostResult["verdict"],
  extra: Partial<WardHostResult> = {},
): WardHostResult {
  return {
    host: name,
    url: `https://${name}/api/x`,
    verdict,
    failed: [],
    advisories: [],
    ...extra,
  };
}

function round(week: string, hosts: WardHostResult[]): WardRound {
  return {
    week,
    at: "2026-08-19T17:00:00.000Z",
    listed_resources: hosts.length,
    coverage_suspect: false,
    capped: false,
    our_search_presence: true,
    hosts,
  };
}

const CLAIM = {
  calls: 154,
  usd: 139,
  unique_buyers: 12,
  window: "7d",
  source: "agent402.tools" as const,
};

describe("the queue derives itself, in four named tiers", () => {
  const previous = round("2026-W33", [
    host("fresh-break.example", "ready"),
    host("fresh-claim.example", "ready"),
  ]);
  const latest = round("2026-W34", [
    host("ok.example", "ready"),
    host("long-dead.example", "unreachable"),
    host("wrong-status.example", "not_ready", { failed: ["status-402"] }),
    host("big-claim.example", "not_ready", {
      failed: ["status-402"],
      volume_claim: { ...CLAIM, usd: 543 },
    }),
    host("small-claim.example", "unreachable", { volume_claim: CLAIM }),
    host("fresh-break.example", "not_ready", { failed: ["challenge-header"] }),
    host("fresh-claim.example", "not_ready", {
      failed: ["status-402"],
      volume_claim: CLAIM,
    }),
    host("homepage.example", "not_probed", { source: "leaderboard" }),
  ]);

  it("ranks newly-failing claims first, then claims by size, then fresh breaks", () => {
    const queue = deriveProspects(latest, previous);
    expect(queue.map((p) => p.host)).toEqual([
      "fresh-claim.example", // tier 1: newly failing + claim
      "big-claim.example", // tier 2: claims by usd desc
      "small-claim.example",
      "fresh-break.example", // tier 3: newly failing
      "wrong-status.example", // tier 4: not_ready before unreachable
      "long-dead.example",
    ]);
    // Ready doors and unprobed homepages are never prospects.
    expect(queue.find((p) => p.host === "ok.example")).toBeUndefined();
    expect(queue.find((p) => p.host === "homepage.example")).toBeUndefined();
  });

  it("says why each row ranks where it does", () => {
    const queue = deriveProspects(latest, previous);
    expect(queue[0]?.newly_failing).toBe(true);
    expect(queue[0]?.reason).toContain("ready last round");
    expect(queue[1]?.reason).toContain("$543");
  });

  it("treats every door as old news when there is no previous round", () => {
    const queue = deriveProspects(latest, null);
    expect(queue.every((p) => !p.newly_failing)).toBe(true);
  });
});

describe("the draft: a dated observation with receipts, never a score", () => {
  const prospect = deriveProspects(
    round("2026-W34", [
      host("agents.chain.link", "not_ready", {
        failed: ["status-402", "challenge-header"],
        volume_claim: CLAIM,
      }),
    ]),
    null,
  )[0]!;
  const note = draftNote(prospect, BASE);

  it("carries the date, the URL, the finding, and the free re-check", () => {
    expect(note).toContain("2026-08-19");
    expect(note).toContain("https://agents.chain.link/api/x");
    expect(note).toContain("status-402");
    expect(note).toContain(`${BASE}/api/preflight`);
    // The receipt: our probe is verifiable in THEIR logs.
    expect(note).toContain("scvd-general-store/1.0");
    expect(note).toContain("http-message-signatures-directory");
    // The claim is quoted as their asserted number, dated by window.
    expect(note).toContain("$139");
    expect(note).toContain("7d");
  });

  it("promises the note is a one-off, not a listing", () => {
    expect(note).toContain("isn't published anywhere");
    // Rule 43's shape: no grades, no ratings language.
    expect(note.toLowerCase()).not.toContain("score");
    expect(note.toLowerCase()).not.toContain("rating");
  });
});

describe("security.txt parsing (RFC 9116)", () => {
  it("keeps Contact lines in order, deduped, capped at five", () => {
    const text = [
      "# comment",
      "Contact: mailto:security@example.com",
      "contact: https://example.com/report",
      "Contact: mailto:security@example.com",
      "Expires: 2027-01-01T00:00:00.000Z",
      "Contact: a",
      "Contact: b",
      "Contact: c",
      "Contact: d",
    ].join("\n");
    expect(parseSecurityContacts(text)).toEqual([
      "mailto:security@example.com",
      "https://example.com/report",
      "a",
      "b",
      "c",
    ]);
  });

  it("finds nothing in a page that is not a security.txt", () => {
    expect(parseSecurityContacts("<html><body>404</body></html>")).toEqual([]);
  });
});

describe("healed after outreach — the case-study list", () => {
  it("names hosts marked sent or replied that answer ready now", () => {
    const ledger: OutreachLedger = {
      version: 1,
      hosts: {
        "fixed.example": { status: "sent", status_at: "2026-08-10" },
        "replied.example": { status: "replied", status_at: "2026-08-11" },
        "still-broken.example": { status: "sent", status_at: "2026-08-10" },
        "skipped.example": { status: "skip", status_at: "2026-08-10" },
      },
    };
    const latest = round("2026-W34", [
      host("fixed.example", "ready"),
      host("replied.example", "ready"),
      host("still-broken.example", "unreachable"),
      host("skipped.example", "ready"),
    ]);
    expect(healedAfterOutreach(latest, ledger)).toEqual([
      "fixed.example",
      "replied.example",
    ]);
  });
});

describe("the desk and its doors", () => {
  const auth = {
    Authorization: `Basic ${btoa(`keeper:${testEnv.ADMIN_PASSWORD}`)}`,
  };

  it("stays behind the keeper's login", async () => {
    expect((await SELF.fetch(`${BASE}/admin/outreach`)).status).toBe(401);
    expect(
      (await SELF.fetch(`${BASE}/admin/outreach/status`, { method: "POST" }))
        .status,
    ).toBe(401);
  });

  it("renders the queue with drafts and flips statuses by hand", async () => {
    const latest = round("2026-W34", [
      host("broken.example", "not_ready", { failed: ["status-402"] }),
    ]);
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(latest));

    const html = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "text/html" },
    });
    expect(html.status).toBe(200);
    const text = await html.text();
    expect(text).toContain("broken.example");
    // Rule 30 as amended 2026-08-20: the desk gained the wire, and
    // the headline moved from "the send, yours" to the press.
    expect(text).toContain("the send, one press");
    expect(text).toContain("Scout contacts");

    const flip = await SELF.fetch(`${BASE}/admin/outreach/status`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: "host=broken.example&status=sent",
    });
    expect(flip.status).toBe(200);
    expect(await flip.json()).toEqual({ host: "broken.example", status: "sent" });

    const json = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "application/json" },
    });
    const body = (await json.json()) as {
      prospects: { host: string }[];
      ledger: OutreachLedger;
    };
    expect(body.prospects[0]?.host).toBe("broken.example");
    expect(body.ledger.hosts["broken.example"]?.status).toBe("sent");
  });

  it("un-stamps one card, and clears the whole queue keeping contacts", async () => {
    /**
     * The 2026-08-19 misreading: "sent" pressed down the whole queue
     * as though it transmitted. Recovery must be one press and must
     * never cost the scouted contacts.
     */
    const ledger = {
      version: 1,
      hosts: {
        "a.example": {
          status: "sent",
          status_at: "2026-08-19T20:00:00.000Z",
          contacts: ["mailto:ops@a.example"],
          scouted_at: "2026-08-19T20:00:00.000Z",
        },
        "b.example": { status: "skip", status_at: "2026-08-19T20:00:00.000Z" },
      },
    };
    await testEnv.COUNTERS.put(KV_KEYS.outreachLedger, JSON.stringify(ledger));

    const undo = await SELF.fetch(`${BASE}/admin/outreach/status`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: "host=a.example&status=fresh",
    });
    expect(await undo.json()).toEqual({ host: "a.example", status: "fresh" });

    const wipe = await SELF.fetch(`${BASE}/admin/outreach/clear-statuses`, {
      method: "POST",
      headers: auth,
    });
    expect(await wipe.json()).toEqual({ cleared: 1, contacts_kept: true });

    const after = (await testEnv.COUNTERS.get(
      KV_KEYS.outreachLedger,
      "json",
    )) as {
      hosts: Record<
        string,
        { status?: string; contacts?: string[]; scouted_at?: string }
      >;
    };
    expect(after.hosts["a.example"]?.status).toBeUndefined();
    expect(after.hosts["b.example"]?.status).toBeUndefined();
    // The expensive knowledge survives the recovery.
    expect(after.hosts["a.example"]?.contacts).toEqual(["mailto:ops@a.example"]);
    expect(after.hosts["a.example"]?.scouted_at).toBeTruthy();
  });

  it("says what the wire does and keeps the stamps labeled as stamps", async () => {
    /**
     * EVOLVED 2026-08-20 with rule 30's amendment: the page now HAS a
     * send button (the wire), so the old "Nothing on this page sends
     * anything, ever" line would be a lie. What must still hold: the
     * wire's law is stated (live verification, one note ever), the
     * hand stamps keep their unmistakable labels, and the mispress
     * lever survives.
     */
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(
        round("2026-W34", [
          host("broken.example", "not_ready", { failed: ["status-402"] }),
        ]),
      ),
    );
    const page = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "text/html" },
    });
    const text = await page.text();
    expect(text).toContain("The wire sends only verified facts");
    expect(text).toContain("One note per host, ever");
    expect(text).toContain("mark sent — I delivered it myself");
    expect(text).toContain("Clear ALL stamps");
  });

  it("renders the top of a big queue, never the whole of it", async () => {
    /**
     * W35's first full walk lands ~2,000 broken doors on this queue;
     * a page carrying every draft inline is megabytes nobody can
     * work. Top 50 fresh render; the rest are counted, ranked, and
     * live in the JSON twin.
     */
    const many = round(
      "2026-W34",
      Array.from({ length: 120 }, (_, i) =>
        host(`broken-${String(i).padStart(3, "0")}.example`, "not_ready", {
          failed: ["status-402"],
        }),
      ),
    );
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(many));
    await testEnv.COUNTERS.delete(KV_KEYS.outreachLedger);

    const page = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "text/html" },
    });
    const text = await page.text();
    expect(text).toContain("Fresh (120, top 50 shown)");
    expect(text).toContain("broken-000.example");
    expect(text).toContain("broken-049.example");
    expect(text).not.toContain("broken-050.example");
    expect(text).toContain("and 70 more below these");

    // The JSON twin still carries every row.
    const json = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "application/json" },
    });
    const body = (await json.json()) as { prospects: unknown[] };
    expect(body.prospects).toHaveLength(120);
  });

  it("refuses a status it does not know", async () => {
    const flip = await SELF.fetch(`${BASE}/admin/outreach/status`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: "host=broken.example&status=blacklisted",
    });
    expect(flip.status).toBe(400);
  });
});

describe("the log-reader's landing", () => {
  it("tells an operator who found our tag what it was and what to do", async () => {
    const page = await SELF.fetch(`${BASE}/bot-auth`, {
      headers: { Accept: "application/json" },
    });
    const body = (await page.json()) as { found_us_in_your_logs: string };
    expect(body.found_us_in_your_logs).toContain("scvd-general-store/1.0");
    expect(body.found_us_in_your_logs).toContain("/api/preflight");
  });
});

describe("the ready doors — the welcome with the passport page (2026-09-01)", () => {
  it("ranks newly listed ready doors first, then claims, and leaves out the broken and ourselves", () => {
    const previous = round("2026-W34", [host("old.example", "ready")]);
    const latest = round("2026-W35", [
      host("old.example", "ready"),
      host("new.example", "ready"),
      host("broke.example", "not_ready"),
      host("scvd.store", "ready"),
      host("rich.example", "ready", { volume_claim: { usd: 40, calls: 9, window: "30d" } as never }),
    ]);
    const welcomes = deriveWelcomes(latest, previous, "scvd.store");
    // Both new; the claim breaks the tie. The old door trails.
    expect(welcomes.map((w) => w.host)).toEqual(["rich.example", "new.example", "old.example"]);
    expect(welcomes[0]!.newly_listed).toBe(true);
    expect(welcomes[1]!.newly_listed).toBe(true);
    expect(welcomes[2]!.newly_listed).toBe(false);
    expect(welcomes[0]!.reason).toContain("newly listed");
    expect(welcomes.some((w) => w.host === "broke.example")).toBe(false);
  });

  it("with no previous round nobody is newly listed — old news, like the queue", () => {
    const latest = round("2026-W35", [host("a.example", "ready")]);
    expect(deriveWelcomes(latest, null)[0]!.newly_listed).toBe(false);
  });

  it("the welcome hands them the passport, the colophon, the free checks, and prices off the shelf", async () => {
    const { getMenuItem } = await import("@/store/menu");
    const latest = round("2026-W35", [host("new.example", "ready")]);
    const note = draftWelcome(deriveWelcomes(latest, round("2026-W34", []))[0]!, BASE);
    expect(note).toContain(`${BASE}/passport/new.example`);
    expect(note).toContain("colophon");
    expect(note).toContain("never says \"passed\"");
    // 2026-09-04: the chip handed out the way a directory hands out
    // its badge — markdown and HTML, ready to paste, no claim step.
    expect(note).toContain("nothing to claim");
    expect(note).toContain(`[![scvd.store passport for new.example`);
    expect(note).toContain(`](${BASE}/badges/passport/new.example.svg)](${BASE}/passport/new.example)`);
    expect(note).toContain(`<img src="${BASE}/badges/passport/new.example.svg"`);
    expect(note).toContain(`${BASE}/api/preflight`);
    expect(note).toContain(`${BASE}/api/standing-note`);
    expect(note).toContain(`$${getMenuItem("conformance_watch")!.price_usdc}`);
    expect(note).toContain(`$${getMenuItem("opening_day")!.price_usdc}`);
    expect(note).toContain("first week");
    expect(note).toContain("nothing to unsubscribe from");
  });

  it("the broken-door draft now points at the passport page too", () => {
    const latest = round("2026-W35", [host("broke.example", "not_ready", { failed: ["accepts"] })]);
    const note = draftNote(deriveProspects(latest, null)[0]!, BASE);
    expect(note).toContain(`${BASE}/passport/broke.example`);
    expect(note).toContain("/menu/conformance_watch");
  });
});

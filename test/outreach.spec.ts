import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { KV_KEYS } from "@/lib/kv-keys";
import {
  deriveProspects,
  deriveWelcomes,
  draftNote,
  draftWelcome,
  healedAfterOutreach,
  mailtoFor,
  parseSecurityContacts,
  type OutreachLedger,
} from "@/services/outreach";
import type { WardHostResult, WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";

/**
 * THE BLOCKLIST SHAPE, REFUSED (2026-09-13). scvd.store was listed on
 * the Spamhaus DBL, and a seller could not reply to our own welcome:
 * his provider refused to relay any mail carrying our domain
 * (Namecheap, JFE040005). The notes were the cause. A rendered
 * welcome carried ten links back to us and an <img> pointing at our
 * SVG chip, which is the URI-blocklist profile almost exactly — a
 * young domain, unsolicited, many self-links, a remote image.
 *
 * So the notes carry ONE link: the passport page, which already holds
 * the chip, the free re-check, the check definitions and the standing
 * note. Rule 55 is unharmed — a URL the reader can walk is still a
 * path, and everything it used to take five URLs to offer is one
 * click behind this one. No image, and no price in a cold note: a
 * first contact with prices in it is a solicitation however it is
 * written.
 *
 * This assertion is the guard. A note that grows a second link or an
 * image fails here rather than at somebody's mail provider.
 */
function expectOneLinkNoImage(note: string, expected: string): void {
  // OUR links only. The door we probed is named in the note on
  // purpose — it is the subject, it is the operator's own domain, and
  // it is not what a URI blocklist reads this message for.
  const links = [...new Set(note.match(/https?:\/\/[^\s<>"')\]]+/g) ?? [])].filter(
    (link) => link.startsWith(BASE),
  );
  expect(links, "a note may carry exactly one link back to us").toEqual([expected]);
  expect(note, "no remote image in an outbound note").not.toContain("<img");
  expect(note, "no markdown image either").not.toContain("![");
  expect(note, "no price link in a cold note").not.toContain("/menu/");
}

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
    // The receipt: our probe is verifiable in THEIR logs. The URLs
    // that used to ride here now sit one click behind the passport
    // link (2026-09-13, the DBL listing) — the paths are still named.
    expect(note).toContain("scvd-general-store/1.0");
    expect(note).toContain("RFC 9421");
    expect(note).toContain("re-run the same battery yourself");
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
    // A card is drawn for a door you can write to (2026-09-06): the
    // address is what makes this a worked row rather than a count.
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify({
        version: 1,
        hosts: {
          "broken.example": {
            scouted_at: "2026-09-02T00:00:00.000Z",
            contacts: ["mailto:ops@broken.example"],
          },
        },
      }),
    );

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
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify({
        version: 1,
        hosts: {
          "broken.example": {
            scouted_at: "2026-09-02T00:00:00.000Z",
            contacts: ["mailto:ops@broken.example"],
          },
        },
      }),
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

  it("works the unsent queue from the top: scout first, Gmail and the note on every row, one press stamps the ticked rows", async () => {
    /**
     * 2026-09-05, the keeper, three at once: the scout should be the
     * first thing on the page; "open in mail" opened a desktop client
     * he has never set up (he reads Gmail in a browser), so the note
     * was invisible; and stamping 25 notes one by one is not a
     * workflow. So: the bench is at the top, each row carries a Gmail
     * compose link and the note itself, each row ticks into one stamp
     * form, and the wire's buttons are not drawn while it is paused.
     */
    const { WIRE_PAUSED_SINCE } = await import("@/services/outreach");
    const hosts = Array.from({ length: 60 }, (_, i) =>
      host(`broken-${String(i).padStart(2, "0")}.example`, "not_ready", { failed: ["status-402"] }),
    );
    await testEnv.COUNTERS.put(KV_KEYS.wardRoundLatest, JSON.stringify(round("2026-W36", hosts)));
    /*
     * SINCE THE SAME EVENING, a row carries its Gmail link only from a
     * live reading (test/outreach-verify.spec.ts holds the other half:
     * no reading, no link). These rows are all freshly read, so every
     * one is armed and the flow below is unchanged.
     */
    const live = { at: new Date().toISOString(), verdict: "not_ready", failed: ["status-402"] };
    const ledger = {
      version: 1,
      hosts: Object.fromEntries(
        hosts.map((h) => [h.host, { contacts: [`mailto:ops@${h.host}`], scouted_at: "2026-09-05T00:00:00.000Z", live }]),
      ),
    };
    await testEnv.COUNTERS.put(KV_KEYS.outreachLedger, JSON.stringify(ledger));
    const page = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "text/html" },
    });
    const text = await page.text();
    // The bench, then the queue, then the prose — in that order.
    expect(text.indexOf('action="/admin/outreach/scout"')).toBeLessThan(text.indexOf('id="unsent"'));
    expect(text.indexOf('id="unsent"')).toBeLessThan(text.indexOf("Derived from round"));
    const unsent = text.slice(text.indexOf('id="unsent"'), text.indexOf("</section>", text.indexOf('id="unsent"')));
    expect(unsent).toContain('id="stamp-many"');
    expect(unsent).toContain('action="/admin/outreach/stamp-many"');
    const rows = unsent.split("<li>").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toContain('form="stamp-many"');
      expect(row).toContain('name="host"');
      expect(row).toContain("https://mail.google.com/mail/?view=cm");
      expect(row).toContain("<textarea");
      if (WIRE_PAUSED_SINCE) expect(row).not.toContain('action="/admin/outreach/send"');
    }
    if (WIRE_PAUSED_SINCE) {
      // Nowhere on the page, card or batch, is a wire button drawn.
      expect(text).not.toContain('action="/admin/outreach/send"');
      expect(text).not.toContain('action="/admin/outreach/send-all"');
    }
    // One press stamps every ticked row.
    const stamped = await SELF.fetch(`${BASE}/admin/outreach/stamp-many`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: "status=sent&host=broken-58.example&host=broken-59.example",
    });
    expect([200, 302]).toContain(stamped.status);
    const after = JSON.parse((await testEnv.COUNTERS.get(KV_KEYS.outreachLedger)) ?? "{}") as { hosts: Record<string, { status?: string }> };
    expect(after.hosts["broken-58.example"]?.status).toBe("sent");
    expect(after.hosts["broken-59.example"]?.status).toBe("sent");
    expect(after.hosts["broken-57.example"]?.status).toBeUndefined();
    // And they have left the queue.
    const again = await (await SELF.fetch(`${BASE}/admin/outreach`, { headers: { ...auth, Accept: "text/html" } })).text();
    const unsentAgain = again.slice(again.indexOf('id="unsent"'), again.indexOf("</section>", again.indexOf('id="unsent"')));
    expect(unsentAgain).not.toContain("ops@broken-59.example");
    // Nothing ticked is a notice, not a write.
    const empty = await SELF.fetch(`${BASE}/admin/outreach/stamp-many`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: "status=sent",
    });
    expect([200, 302]).toContain(empty.status);
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
    // All 120 scouted with an address, so the render cap is what the
    // page is being asked about here and not the contact filter.
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify({
        version: 1,
        hosts: Object.fromEntries(
          many.hosts.map((row) => [
            row.host,
            {
              scouted_at: "2026-09-02T00:00:00.000Z",
              contacts: [`mailto:ops@${row.host}`],
            },
          ]),
        ),
      }),
    );

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

  it("names, at the top, every scouted door with an email and no note yet", async () => {
    /**
     * 2026-09-04, the keeper: "i can't see the names that have emails
     * that i havent sent to". The summary must be the SAME list the
     * wire would reach — an address published, no note ever sent —
     * named before the drafts, with the addresses pullable in one
     * copy. A sent host must never appear; a skip-stamped one must,
     * flagged, because no note has actually left.
     */
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(
        round("2026-W34", [
          host("waiting.example", "not_ready", { failed: ["status-402"] }),
          host("skipped.example", "not_ready", { failed: ["status-402"] }),
          host("done.example", "not_ready", { failed: ["status-402"] }),
          host("noaddress.example", "not_ready", { failed: ["status-402"] }),
          host("unscouted.example", "not_ready", { failed: ["status-402"] }),
        ]),
      ),
    );
    await testEnv.COUNTERS.put(
      KV_KEYS.outreachLedger,
      JSON.stringify({
        version: 1,
        hosts: {
          "waiting.example": {
            contacts: ["mailto:ops@waiting.example"],
            scouted_at: "2026-09-01T00:00:00.000Z",
          },
          "skipped.example": {
            contacts: ["security@skipped.example"],
            scouted_at: "2026-09-01T00:00:00.000Z",
            status: "skip",
            status_at: "2026-09-02T00:00:00.000Z",
          },
          "done.example": {
            contacts: ["mailto:ops@done.example"],
            scouted_at: "2026-09-01T00:00:00.000Z",
            status: "sent",
            status_at: "2026-09-02T00:00:00.000Z",
            wired: true,
            sent_to: "ops@done.example",
          },
          "noaddress.example": {
            scouted_at: "2026-09-01T00:00:00.000Z",
            scout_note: "none published",
          },
        },
      }),
    );

    const page = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "text/html" },
    });
    const text = await page.text();
    // The bench (scout) now sits ABOVE the queue; the prose is below it.
    const summary = text.slice(
      text.indexOf('<section id="unsent">'),
      text.indexOf("Derived from round"),
    );

    // It is at the top: before the cards, before the batch buttons.
    expect(summary).toContain("Scouted, with an email, not yet sent (2)");
    expect(summary).toContain("ops@waiting.example");
    // A stamp is not a send — it stays on the list, flagged.
    expect(summary).toContain("security@skipped.example");
    expect(summary).toContain("stamped skip");
    // A host the wire already reached is spent, and never listed.
    expect(summary).not.toContain("ops@done.example");
    // One copy pulls every address on the list.
    expect(summary).toContain(
      "security@skipped.example, ops@waiting.example",
    );
    // The doors that cannot be wired are counted, not hidden.
    expect(summary).toContain("1 scouted door that published no email");
    expect(summary).toContain("1 not scouted yet");
    // And each row can be worked from where it is read: stamped sent
    // by hand always, and sent over the wire only while the wire can
    // send (2026-09-05 — a button that only declines is not drawn).
    const { WIRE_PAUSED_SINCE } = await import("@/services/outreach");
    expect(summary).toContain('form="stamp-many"');
    if (WIRE_PAUSED_SINCE) {
      expect(summary).not.toContain('action="/admin/outreach/send"');
      expect(summary).toContain("The wire is paused");
    } else {
      expect(summary).toContain('action="/admin/outreach/send"');
    }
    expect(summary).toContain('href="#card-waiting.example"');
    expect(text).toContain('<section id="card-waiting.example">');
  });

  it("finds contacts for the ready doors too, and hands each a one-press mail", async () => {
    /**
     * 2026-09-04, the keeper: "how do i find contacts for both" and
     * "you make it easy for me please". The scout walks both queues;
     * a ready door with an address gets its own list at the top and
     * an open-in-mail link with the welcome already written. Nothing
     * transmits: the link is the keeper's own client, and the stamp
     * is still his.
     */
    await testEnv.COUNTERS.put(
      KV_KEYS.wardRoundLatest,
      JSON.stringify(
        round("2026-W34", [
          host("broken.example", "not_ready", { failed: ["status-402"] }),
          host("ready.example", "ready"),
          host("quiet-ready.example", "ready"),
        ]),
      ),
    );
    await testEnv.COUNTERS.delete(KV_KEYS.outreachLedger);

    // The scout knocks on every host in both queues. Nothing here
    // resolves, so every knock records "none published" — the point
    // is who was knocked on, not what answered.
    const scout = await SELF.fetch(`${BASE}/admin/outreach/scout`, {
      method: "POST",
      headers: { ...auth, Accept: "application/json" },
    });
    expect(await scout.json()).toEqual({ looked: 3, found: 0, remaining: 0 });
    const ledger = (await testEnv.COUNTERS.get(
      KV_KEYS.outreachLedger,
      "json",
    )) as OutreachLedger;
    expect(ledger.hosts["ready.example"]?.scouted_at).toBeTruthy();
    expect(ledger.hosts["quiet-ready.example"]?.scout_note).toBe("none published");

    // Give the ready door an address, as the scout would have.
    ledger.hosts["ready.example"] = {
      ...ledger.hosts["ready.example"],
      contacts: ["mailto:hello@ready.example"],
    };
    delete ledger.hosts["ready.example"]?.scout_note;
    await testEnv.COUNTERS.put(KV_KEYS.outreachLedger, JSON.stringify(ledger));

    const page = await SELF.fetch(`${BASE}/admin/outreach`, {
      headers: { ...auth, Accept: "text/html" },
    });
    const text = await page.text();
    // The bench (scout) now sits ABOVE the queue; the prose is below it.
    const summary = text.slice(
      text.indexOf('<section id="unsent">'),
      text.indexOf("Derived from round"),
    );
    expect(summary).toContain("Ready doors — the welcome (1)");
    expect(summary).toContain("hello@ready.example");
    // The welcome list never offers the wire; the note list does.
    const readyList = summary.slice(summary.indexOf("Ready doors — the welcome"));
    expect(readyList).not.toContain('action="/admin/outreach/send"');
    expect(readyList).toContain("open in Gmail — the welcome written");
    expect(readyList).toContain('href="mailto:hello%40ready.example?subject=a%20dated%20page');
    expect(readyList).toContain('href="#card-ready.example"');
    // The card carries the contact and the same link.
    const card = text.slice(text.indexOf('<section id="card-ready.example">'));
    expect(card).toContain("contact: <code>mailto:hello@ready.example</code>");
    expect(card).toContain("open in Gmail — the welcome already written");
    // And the scout button counts both queues as scouted now.
    expect(text).toContain("Scout contacts (0 unscouted");
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

  it("the welcome carries ONE link, no image, and no price — the blocklist shape", async () => {
    const latest = round("2026-W35", [host("new.example", "ready")]);
    const note = draftWelcome(deriveWelcomes(latest, round("2026-W34", []))[0]!, BASE);
    expectOneLinkNoImage(note, `${BASE}/passport/new.example`);
    // Still says the things that make it worth reading.
    expect(note).toContain("never says \"passed\"");
    expect(note).toContain("first week");
    expect(note).toContain("nothing to unsubscribe from");
  });

  it("the broken-door draft carries ONE link, no image, and no price", () => {
    const latest = round("2026-W35", [host("broke.example", "not_ready", { failed: ["accepts"] })]);
    const note = draftNote(deriveProspects(latest, null)[0]!, BASE);
    expectOneLinkNoImage(note, `${BASE}/passport/broke.example`);
    // The finding still names the check that failed, by name.
    expect(note).toContain("accepts");
    // Rule 55 still holds: the paths are named, and the one link carries them.
    expect(note).toContain("scvd-general-store/1.0");
    expect(note).toContain("re-run the same battery yourself");
  });

});

describe("hand delivery in one press", () => {
  it("turns a draft into a mailto with the subject split off and the body intact", () => {
    const link = mailtoFor(
      "ops@door.example",
      "Subject: your x402 endpoint at door.example is turning buyers away\n\nHello — line one.\n  curl -X POST https://scvd.store/api/preflight -d '{\"url\":\"https://door.example/x\"}'\n",
    );
    const url = new URL(link);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe("ops%40door.example");
    const params = url.searchParams;
    expect(params.get("subject")).toBe(
      "your x402 endpoint at door.example is turning buyers away",
    );
    const body = params.get("body") ?? "";
    expect(body.startsWith("Hello — line one.")).toBe(true);
    // Quotes, braces and newlines survive the round trip.
    expect(body).toContain('{"url":"https://door.example/x"}');
    expect(body).not.toContain("Subject:");
  });

  it("keeps a draft with no subject line whole", () => {
    const link = mailtoFor("a@b.example", "just a body");
    const params = new URL(link).searchParams;
    expect(params.get("subject")).toBe("");
    expect(params.get("body")).toBe("just a body");
  });
});

describe("the date a note carries is the row's, not the seal's (2026-09-05)", () => {
  /*
   * tensorfeed.ai's operator read "On 2026-09-05" in the welcome and
   * "observed 2026-09-01" on the passport it linked, and said that
   * for a shop selling dated observations those want to agree. The
   * seal time is the fallback only for rows the probe did not stamp.
   */
  const latest = round("2026-W36", [
    host("stamped.example", "not_ready", {
      failed: ["status-402"],
      observed_at: "2026-09-01T13:27:08.998Z",
    }),
    host("unstamped.example", "not_ready", { failed: ["status-402"] }),
    host("stamped-ready.example", "ready", { observed_at: "2026-09-02T08:00:00.000Z" }),
    host("unstamped-ready.example", "ready"),
  ]);
  latest.at = "2026-09-05T13:27:08.998Z";

  it("dates a prospect by the row where the probe wrote a time down", () => {
    const byHost = Object.fromEntries(deriveProspects(latest, null).map((p) => [p.host, p]));
    expect(byHost["stamped.example"]!.observed_at).toBe("2026-09-01T13:27:08.998Z");
    expect(byHost["unstamped.example"]!.observed_at).toBe("2026-09-05T13:27:08.998Z");
    expect(draftNote(byHost["stamped.example"]!, BASE)).toContain("On 2026-09-01 our weekly probe");
  });

  it("dates a welcome the same way", () => {
    const byHost = Object.fromEntries(deriveWelcomes(latest, null).map((w) => [w.host, w]));
    expect(byHost["stamped-ready.example"]!.observed_at).toBe("2026-09-02T08:00:00.000Z");
    expect(byHost["unstamped-ready.example"]!.observed_at).toBe("2026-09-05T13:27:08.998Z");
    expect(draftWelcome(byHost["stamped-ready.example"]!, BASE)).toContain("On 2026-09-02 our weekly pass");
  });
});

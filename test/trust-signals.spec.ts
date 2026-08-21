import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { EXTERNAL_RECORDS, NOT_CLAIMED } from "@/store/trust-signals";
import { ROOMS } from "@/store/rooms";

const BASE = "https://scvd.store";

/**
 * THE TRUST LAYER — machine eyes only, and the tests hold both halves
 * of that: that it answers a checklist, and that it never becomes a
 * page.
 *
 * Written after three outside models were asked to evaluate this store
 * cold. The one that searches the live web reported it could find no
 * company identity, no contact route, no terms and no independent
 * reputation footprint — accurately. Every fact was published, none of
 * it at a URL a checklist knows to try.
 */
describe("the trust document answers a diligence check", () => {
  it("states the entity as a fact rather than leaving it to be assumed", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as {
      operator: { legal_entity: unknown; contact: string; kind: string };
      not_claimed: string[];
    };
    /**
     * NEVER ABSENT, WHICHEVER THE ANSWER IS. This field read null for
     * a few hours on 2026-07-31, meaning "no company is claimed" —
     * the honest placeholder while nobody here knew, and what it would
     * still say if there were no entity. The keeper then confirmed
     * Record Creative Co. LLC and it became a checkable fact.
     *
     * Both states are correct answers; the wrong one is the field not
     * being there, because a diligence reader finding nothing assumes
     * whichever it already suspected.
     */
    expect(
      body.operator.legal_entity === null ||
        typeof body.operator.legal_entity === "string",
      "the entity field is missing entirely, which answers nothing",
    ).toBe(true);
    expect(Object.keys(body.operator)).toContain("legal_entity");
    expect(body.operator.kind).toBe("individual");
    expect(body.operator.contact).toMatch(/api\/letter/);
    expect(body.not_claimed).toEqual(NOT_CLAIMED);
  });

  it("lists the absences, because a page with only strengths is what a scam writes", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as { not_claimed: string[] };
    const joined = body.not_claimed.join(" ").toLowerCase();
    /**
     * "no registered company" was here until 2026-07-31, when the
     * keeper confirmed Record Creative Co. LLC and it stopped being
     * true — the third claim this week that had to move because a fact
     * changed under it. What replaced it is the absence that does not
     * move: a company does not add a second pair of hands, so the
     * one-key, one-operator limit stands whatever the paperwork says.
     */
    for (const absence of [
      "no third-party security audit",
      "no escrow",
      "one ed25519 signing key and one operator",
    ]) {
      expect(joined, `the trust document never admits "${absence}"`).toContain(
        absence,
      );
    }
  });

  it("resolves every pointer to an absolute URL", async () => {
    // A checklist reader should never have to guess a base to follow a
    // path from the one document claiming legitimacy.
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as { where_it_is_written_out: Record<string, string> };
    for (const [key, url] of Object.entries(body.where_it_is_written_out)) {
      expect(url, `${key} is not absolute`).toMatch(/^https:\/\//);
    }
  });

  it("names the only facts on it that are not our own word", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as {
      independently_checkable: Record<string, string>;
      limit: string;
    };
    /**
     * AN EXACT LIST, ON PURPOSE. This block is the one place on the
     * document that claims a reader does not have to take our word,
     * so anything added to it has to clear that bar in fact — a
     * signature checkable with a stranger's own library, a
     * transaction on Base, a digest timestamped into Bitcoin. Growing
     * it is a deliberate act with a defence, which is why this
     * assertion is a whitelist and not a `toContain`.
     */
    /**
     * the_ecosystem_record ADMITTED 2026-08-07, with its defence: the
     * corpus's snapshots are signed by our key (our word), but each
     * digest is submitted to OpenTimestamps and anchored into Bitcoin
     * — the identical mechanism and the identical claim as
     * key_history_over_time, which has always been on this list. What
     * a reader checks without us is that the record existed by a
     * Bitcoin block height and was not rewritten after; the content
     * being honest is still our word, and the corpus document says
     * that itself under honest_limits.
     */
    expect(Object.keys(body.independently_checkable).sort()).toEqual([
      "key_history_over_time",
      "settlement",
      "signatures",
      "the_ecosystem_record",
    ]);
    expect(body.limit).toMatch(/weakest possible evidence/i);
  });
});

describe("external records are records, not endorsements", () => {
  it("labels what each one actually proves", () => {
    // A directory listing we submitted ourselves is evidence we exist
    // and were indexed. It is not somebody vouching for us, and the
    // difference is what separates a trust document from a logo wall.
    for (const record of EXTERNAL_RECORDS) {
      expect(record.url, "a record with no URL").toMatch(/^https:\/\//);
      expect(
        record.what_it_proves.toLowerCase(),
        `${record.registry} does not say what it is NOT`,
      ).toMatch(/not an endorsement|not an audit/);
      // A date somebody actually opened it. An entry nobody has
      // checked is the thing this whole document exists to not be.
      expect(
        record.confirmed,
        `${record.registry} carries no confirmation date`,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("feeds sameAs from the same list, so the two cannot disagree", async () => {
    const page = await (
      await SELF.fetch(BASE, { headers: { Accept: "text/html" } })
    ).text();
    for (const record of EXTERNAL_RECORDS) {
      expect(page, `${record.url} is in the trust doc but not in sameAs`).toContain(
        record.url,
      );
    }
  });
});

describe("the list states its own edges", () => {
  it("names the listings it deliberately left out, and why", async () => {
    // A curated list with no statement of its own edges is a list you
    // cannot tell is curated. One entry is unverified and one has no
    // followable URL; both are named rather than quietly dropped.
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/trust.json`)
    ).json()) as { external_records_omitted: string };
    expect(body.external_records_omitted).toMatch(/x402scout/i);
    expect(body.external_records_omitted).toMatch(/registry/i);
  });
});

describe("the trust surfaces keep their split", () => {
  it("trust.json stays machine-only; the /trust room is the human aggregator", async () => {
    /**
     * EVOLVED 2026-08-21. The original ruling ("never a room — a
     * conventional trust page in conventional language would be a
     * duller second copy") protected against dull duplication, and
     * it held until three independent outside reads found the trust
     * substrate scattered across eight rooms and the keeper ruled
     * the aggregator into the ROI order's first slot. The /trust
     * room that now exists answers the ORIGINAL objection: every
     * number derives from the deep room's own source (it cannot be
     * a second copy, dull or otherwise), and the voice is the
     * house's. What survives of the old rule unchanged: the
     * machine list at /.well-known/trust.json is still never a
     * room — indexers read it beside the signing key, humans read
     * the panel.
     */
    expect(ROOMS.map((room) => room.path)).toContain("/trust");
    expect(ROOMS.map((room) => room.path)).not.toContain(
      "/.well-known/trust.json",
    );
  });

  it("is reachable by the machines that need it", async () => {
    // Invisible to a browsing human is not the same as hidden: an
    // indexer taking our signing key from the discovery document is
    // exactly the reader who should find this beside it.
    const x402 = (await (
      await SELF.fetch(`${BASE}/.well-known/x402.json`)
    ).json()) as { trust?: string };
    expect(x402.trust).toMatch(/\/\.well-known\/trust\.json$/);
  });
});

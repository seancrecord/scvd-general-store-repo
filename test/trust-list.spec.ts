import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { verifyMessageSignature } from "@/lib/signing";
import { TRUST_LIST_ENTRIES } from "@/store/trust-list";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

/**
 * Trust List v0. The format and the signature are the product; the
 * list is one entry long and that entry is us.
 *
 * The tests that matter here are the scope guards, because the
 * liability edge is a wording problem: the moment this list says
 * "safe" or "recommended" it stops being an observation about a past
 * event and becomes a prediction about someone else's future
 * behaviour, signed with our key.
 */
describe("the trust list", () => {
  it("serves a signed list anyone can check against our published key", async () => {
    const response = await SELF.fetch(`${BASE}/trust-list.json`);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;

    expect(body.version).toBe(1);
    expect(typeof body.signature).toBe("string");
    expect(typeof body.public_key).toBe("string");

    // The signature must cover the body as served, minus the three
    // fields that can't cover themselves.
    const { signature, public_key, signature_covers, ...signed } = body;
    void signature_covers;
    const ok = await verifyMessageSignature(
      JSON.stringify(signed),
      String(signature),
      String(public_key),
    );
    expect(ok, "the list does not verify against its own key").toBe(true);

    // And that key is the one the store publishes everywhere else.
    const advertised = await (
      await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`)
    ).text();
    expect(advertised).toContain(String(public_key));
  });

  it("attests observation, never safety", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/trust-list.json`)
    ).json();
    if (!isRecord(body) || !Array.isArray(body.entries)) {
      throw new Error("no entries");
    }
    // An empty list satisfies every loop below by having nothing to
    // check. The list is the subject, so prove it exists first.
    expect(
      body.entries.length,
      "the trust list is empty, so the loop below asserted nothing",
    ).toBeGreaterThan(0);

    // The scope guard belongs on the ENTRIES, which is where a vouch
    // would actually live. The attests/note fields legitimately use
    // these words to say we are NOT claiming them, and a test that
    // banned the vocabulary outright would forbid the disclaimer.
    const entryText = JSON.stringify(body.entries).toLowerCase();
    for (const forbidden of [
      "safe",
      "recommend",
      "trusted",
      "endorse",
      "vouch",
      "reliable",
    ]) {
      expect(
        entryText.includes(forbidden),
        `an entry claims "${forbidden}" — that is a prediction about someone else's future`,
      ).toBe(false);
    }

    // And the list says out loud what it is instead.
    const attests = String(body.attests).toLowerCase();
    expect(attests).toContain("past event");
    expect(attests).toContain("delivered");
    expect(attests).toContain("not a claim");
  });

  it("keeps the gate where the gate belongs: on the PAID claim", () => {
    // v1 grew, and the growth must not have touched the one thing the
    // gate guards. The spec's reason is exact — we cannot be the trust
    // anchor for a flow we have never completed with a stranger — so
    // this store stays the only origin listed as a completed x402
    // purchase until a stranger buys something. Unpaid entries were
    // never what the gate was about.
    const transacted = TRUST_LIST_ENTRIES.filter(
      (entry) => entry.relation === "transacted",
    );
    expect(transacted).toHaveLength(1);
    expect(transacted[0]?.origin).toBe("https://scvd.store");
  });

  it("marks every entry as paid or unpaid, never leaving it to be assumed", () => {
    for (const entry of TRUST_LIST_ENTRIES) {
      expect(
        ["transacted", "used"].includes(entry.relation),
        `${entry.origin} has no relation, so a reader would guess`,
      ).toBe(true);
    }
  });

  it("says out loud that the two claims are different", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/trust-list.json`)
    ).json();
    if (!isRecord(body)) throw new Error("no body");
    const attests = String(body.attests).toLowerCase();
    // The distinction has to be in the artifact, not only in a comment
    // in our source, or the field is decoration.
    expect(attests).toContain("transacted");
    expect(attests).toContain("used");
    expect(attests).toContain("nothing paid");

    // And the counts let a reader weigh the list without walking it.
    if (!isRecord(body.counts)) throw new Error("no counts");
    expect(body.counts.transacted).toBe(1);
    expect(body.counts.used).toBe(TRUST_LIST_ENTRIES.length - 1);
  });

  it("says how an origin gets considered, and that asking is not enough", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/trust-list.json`)
    ).json();
    if (!isRecord(body)) throw new Error("no body");
    const how = String(body.how_to_be_considered).toLowerCase();
    expect(how).toContain("/api/request");
    // The two sentences that keep this from becoming a placement market.
    expect(how).toContain("no fee");
    expect(how).toContain("asking does not put you on it");
  });

  it("carries the entry schema the spec asked for", async () => {
    const body: unknown = await (
      await SELF.fetch(`${BASE}/trust-list.json`)
    ).json();
    if (!isRecord(body) || !Array.isArray(body.entries)) {
      throw new Error("no entries");
    }
    // An empty list satisfies every loop below by having nothing to
    // check. The list is the subject, so prove it exists first.
    expect(
      body.entries.length,
      "the trust list is empty, so the loop below asserted nothing",
    ).toBeGreaterThan(0);
    for (const entry of body.entries) {
      expect(isRecord(entry)).toBe(true);
      if (!isRecord(entry)) continue;
      for (const field of [
        "origin",
        "transacted",
        "first_verified",
        "last_checked",
        "status",
      ]) {
        expect(entry[field], `entry missing ${field}`).toBeTruthy();
      }
    }
  });

  it("is findable from llms.txt, per the spec", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(text).toContain(`${BASE}/trust-list.json`);
  });
});

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  ARTIFACT_CLASSES,
  NOT_BUILT,
  TRUST_MODELS,
} from "@/store/attestation-spec";

const BASE = "https://scvd.store";

/**
 * /attestation — WE WERE UNDER-DECLARING, NOT UNDER-BUILT.
 *
 * An outside critic reading the storefront alone concluded there was no
 * disclosed key architecture, no spec, and no statement of what gets
 * signed. Three claims that were already false — and THE FACT THAT A
 * CAREFUL READER COULD BELIEVE ALL THREE IS THE FINDING. Machinery
 * nobody can find is machinery that may as well not exist.
 *
 * On reassessment they conceded the facts and held one line: disclosing
 * a limitation is not the same as solving it. One key, one operator, no
 * witnessing, no recovery is still "trust this one key, full stop."
 * That is correct, it is not argued with anywhere on the page, and
 * their own sentence for it is quoted rather than paraphrased into
 * something flattering.
 */
describe("what we sign, and whose word you are taking", () => {
  it("names a trust model for every artifact class, including the weakest", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/attestation`)
    ).json()) as Record<string, unknown>;
    const classes = body["artifact_classes"] as { trust_model: string }[];
    expect(classes.length).toBe(ARTIFACT_CLASSES.length);
    // The point of the page: several classes ARE the weakest model and
    // say so, rather than the page listing only the flattering ones.
    expect(classes.some((c) => c.trust_model === "self_signed")).toBe(true);
    expect(
      classes.some((c) => c.trust_model === "third_party_observation"),
    ).toBe(true);
    expect(classes.some((c) => c.trust_model === "custody_only")).toBe(true);
  });

  it("says what each signature does NOT prove", async () => {
    for (const entry of ARTIFACT_CLASSES) {
      expect(
        entry.does_not_prove.length,
        `${entry.id} does not say what it fails to prove`,
      ).toBeGreaterThan(0);
    }
  });

  it("calls the weakest model the weakest, in those words", () => {
    expect(TRUST_MODELS.self_signed.weakness).toContain(
      "weakest trust model there is",
    );
    // And refuses the flattering read of a signature.
    expect(TRUST_MODELS.self_signed.weakness).toContain(
      "receipt, not evidence",
    );
  });

  it("lists what this store does not have, unprompted", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/attestation`)
    ).json()) as Record<string, unknown>;
    const missing = (body["not_built"] as string[]).join(" ").toLowerCase();
    for (const absence of [
      "continuity chain",
      // WAS "rotation", until the store rotated on 2026-07-31 and the
      // absence stopped being an absence. The durable one underneath it
      // is the successor key: no key is pre-announced against the key
      // now in service, and a handover therefore still depends on the
      // outgoing key being able to sign at the time.
      "successor key",
      "threshold",
      "hardware security module",
      "audit",
      "patent",
    ]) {
      expect(missing, `the page never admits: no ${absence}`).toContain(
        absence,
      );
    }
    expect(NOT_BUILT.length).toBeGreaterThan(4);
  });

  it("quotes the criticism that survived, without softening it", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/attestation`)
    ).json()) as Record<string, unknown>;
    const held = String(body["held_against_us"]);
    // Their sentence, kept as theirs.
    expect(held).toContain("narrower, more honestly-scoped system");
    expect(held).toContain("not a more capable one");
    expect(held).toContain("Disclosing a limitation is not the same as solving it");
    // And no rebuttal bolted onto the end.
    expect(held.toLowerCase()).not.toContain("however");
    expect(held.toLowerCase()).not.toContain("but we");
  });

  it("declares the key architecture rather than leaving it to be found", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/attestation`)
    ).json()) as Record<string, unknown>;
    const key = body["key_architecture"] as Record<string, unknown>;
    expect(key["algorithm"]).toBe("ed25519");
    expect(key["key_count"]).toBe(1);
    expect(String(key["public_key_url"])).toContain("scvd-signing-key");
    /**
     * PINNED TO THE PROPERTY, NOT THE COUNT. This asserted "none" and
     * broke the afternoon the store performed its first handover —
     * a test encoding a fact with an expiry date rather than the
     * commitment that outlives it. What must always be true of this
     * field is the ordering and the outgoing signature, whatever the
     * number of rotations happens to be.
     */
    const rotation = String(key["rotation"]).toLowerCase();
    expect(rotation).toContain("outgoing key");
    expect(rotation).toContain("before");
    expect(String(key["holder"])).toContain("no third party");
  });

  it("explains why it serves bytes instead of a canonicalization recipe", async () => {
    // The critic named the bug class better than we had: a verifier
    // rebuilding "what should have been signed" and getting it wrong.
    const body = (await (
      await SELF.fetch(`${BASE}/attestation`)
    ).json()) as Record<string, unknown>;
    const why = String(body["why_signed_payload"]).toLowerCase();
    expect(why).toContain("canonicalization mismatch");
    expect(why).toContain("nothing to rebuild");
  });

  it("is a page a person can read and a crawler can find", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/attestation`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("What we sign");
    expect(page).toContain("What this store does not have");
    const xml = await (await SELF.fetch(`${BASE}/sitemap.xml`)).text();
    expect(xml).toContain(`<loc>${BASE}/attestation</loc>`);
  });
});

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { NOT_BUILT } from "@/store/attestation-spec";
import { KEY_BACKUP_EXISTS, SUCCESSION_PROTOCOL } from "@/store/key-continuity";

const BASE = "https://scvd.store";

/**
 * KEY CONTINUITY — the two claims that must never get ahead of the
 * facts, and the one that must never be quietly true.
 *
 * The keeper asked whether the store could say it has a succession plan
 * without explaining it. Half of that is fine and half of it is the
 * exact species of claim /attestation exists to stop making, so the
 * split is enforced here rather than left to whoever edits the copy
 * next.
 */
describe("no continuity claim runs ahead of the fact", () => {
  it("serves the pending wording, not the shipped wording, while the flag is false", async () => {
    // A durability promise made slightly early is indistinguishable
    // from one made honestly, right up until the day it matters.
    //
    // WHAT THIS COVERS AND WHAT IT DOES NOT, because the first draft
    // pretended to cover more: it asserts the PRESENT copy is not being
    // served while the flag is false, which catches the actual likely
    // mistake — somebody editing the reassuring paragraph into place
    // and forgetting the boolean. It does NOT catch a backup claimed in
    // brand new words somewhere else, and no regex here could: the
    // first attempt tried, and flagged a menu item that says a
    // certificate is for people who "want it on paper". An instrument
    // that fires on unrelated copy is worse than a narrower one that
    // does not, which is the lesson from the 500px screenshot.
    if (KEY_BACKUP_EXISTS) {
      return;
    }
    const SHIPPED_WORDING = [
      "The signing key exists offline",
      "more than one physical location",
    ];
    for (const path of ["/attestation", "/llms.txt", "/.well-known/scvd-signing-key"]) {
      const text = await (await SELF.fetch(`${BASE}${path}`)).text();
      for (const phrase of SHIPPED_WORDING) {
        expect(
          text,
          `${path} claims a key backup that has not been made yet`,
        ).not.toContain(phrase);
      }
    }
  });

  it("keeps the NOT_BUILT entry in step with the flag, rather than typed", () => {
    // This entry used to be a fixed string saying "no rotation and no
    // recovery". It would have gone false the day a backup existed and
    // sat there contradicting the continuity section on the same page.
    const entry = NOT_BUILT.find((line) => line.includes("key rotation"));
    expect(entry).toBeTruthy();
    if (KEY_BACKUP_EXISTS) {
      expect(entry).toContain("Recovery from LOSS only");
      expect(entry).not.toContain("No recovery either");
    } else {
      expect(entry).toContain("No recovery either");
    }
  });
});

describe("the succession plan publishes the part a secret would ruin", () => {
  it("says a successor key does not exist, rather than leaving it inferred", async () => {
    // An absence nobody states is an absence a summariser fills in.
    const body = (await (await SELF.fetch(`${BASE}/attestation`)).json()) as {
      key_continuity: {
        succession: { successor_key_exists: boolean };
        backup: { exists: boolean; protects_against: string[] };
      };
    };
    expect(body.key_continuity.succession.successor_key_exists).toBe(false);
    expect(body.key_continuity.backup.exists).toBe(KEY_BACKUP_EXISTS);
  });

  it("rides the key endpoint itself, where a caching client will look", async () => {
    // The client that holds a stale copy of this key is the exact
    // client that needs to know how to read a change to it. Telling it
    // on a page it never fetches is telling nobody.
    const body = (await (
      await SELF.fetch(`${BASE}/.well-known/scvd-signing-key`)
    ).json()) as {
      continuity?: { successor_key_exists?: boolean; if_this_key_ever_changes?: string };
    };
    expect(body.continuity?.successor_key_exists).toBe(false);
    expect(body.continuity?.if_this_key_ever_changes).toMatch(/outgoing key/i);
  });

  it("commits to the one rule that is a check rather than a promise", () => {
    // Everything else in the protocol is intent. This is the only line
    // a holder can verify without trusting us, so it is the line that
    // must survive an edit.
    const signed = SUCCESSION_PROTOCOL.some((entry) =>
      /signed by the outgoing key/i.test(entry.rule),
    );
    const ordering = SUCCESSION_PROTOCOL.some((entry) =>
      /before it signs anything/i.test(entry.rule),
    );
    const badCase = SUCCESSION_PROTOCOL.some((entry) =>
      /cannot sign the announcement/i.test(entry.rule),
    );
    expect(signed, "nothing commits the handover to the outgoing key").toBe(true);
    expect(ordering, "nothing commits to announcing before signing").toBe(true);
    expect(
      badCase,
      "the protocol never says what happens when the old key is gone, which is the case that would be improvised",
    ).toBe(true);
  });

  it("names what is withheld, on the page, not only in the commit", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/attestation`, { headers: { Accept: "text/html" } })
    ).text();
    expect(page).toContain("If the key is lost, stolen, or handed on");
    expect(page.toLowerCase()).toContain("where key material physically lives");
  });
});

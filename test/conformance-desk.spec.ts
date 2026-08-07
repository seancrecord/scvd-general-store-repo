import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE FREE CONFORMANCE DESK, and the property that makes it worth
 * having: it is not about us.
 *
 * The verifier has been MIT and correct for a while and lived in a
 * GitHub folder, which meant using it required cloning a repo and
 * running node. The audience this store serves — an agent holding an
 * offer it does not trust — could not reach it. Serving the same code
 * changes nothing about the method and everything about who can use
 * it.
 *
 * These tests hold three things: the checks are real, the verdict
 * states its own limits, and a competitor's artifact gets the same
 * treatment ours does.
 */
async function post(
  body: unknown,
  path = "/api/conformance/v1",
): Promise<{ status: number; json: any }> {
  const res = await SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

/**
 * A JWS BUILT HERE, BY HAND, FROM A KEY THAT IS NOT OURS.
 *
 * Deliberately not minted through our own signing path: a desk that
 * only ever sees its issuer's output is not a conformance desk, and a
 * test that only feeds it our artifacts would not notice if it had
 * quietly become one.
 */
async function foreignOffer(
  overrides: Record<string, unknown> = {},
): Promise<{ jws: string; publicKeyHex: string }> {
  const keyPair = (await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const rawPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
  );
  const publicKeyHex = [...rawPublic]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  const b64url = (bytes: Uint8Array): string =>
    btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const encode = (value: unknown): string =>
    b64url(new TextEncoder().encode(JSON.stringify(value)));

  const header = { alg: "EdDSA", kid: "did:web:example.test#key-1" };
  // Spec 5.1 field names, read from OFFER_REQUIRED_FIELDS rather than
  // guessed. The first cut of this fixture invented snake_case names
  // and an ISO expiry; the desk correctly refused it, which is the
  // test catching the test.
  const payload = {
    version: 1,
    resourceUrl: "https://example.test/api/buy/thing",
    scheme: "exact",
    network: "eip155:8453",
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    payTo: "0x0000000000000000000000000000000000000001",
    amount: "1000",
    validUntil: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  const signingInput = `${encode(header)}.${encode(payload)}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "Ed25519",
      keyPair.privateKey,
      new TextEncoder().encode(signingInput),
    ),
  );
  return { jws: `${signingInput}.${b64url(signature)}`, publicKeyHex };
}

describe("the conformance desk checks somebody else's artifact", () => {
  it("passes a well-formed foreign offer, verified offline", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { status, json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
    });
    expect(status).toBe(200);
    expect(
      json.verdict,
      `a valid offer from a key that is not ours did not pass: ${JSON.stringify(json.checks)}`,
    ).toBe("conforms");
    expect(json.kind).toBe("offer");
    // Offline means offline: no network request made in the caller's name.
    expect(json.key_resolution).toBe("offline");
  });

  it("fails a tampered payload, which is the whole job", async () => {
    // A signature is only evidence if breaking it is detected. Flip a
    // byte in the payload segment and keep everything else.
    const { jws, publicKeyHex } = await foreignOffer();
    const [header, payload, signature] = jws.split(".");
    const tamperedPayload = `${payload!.slice(0, -2)}${payload!.slice(-2) === "AA" ? "AB" : "AA"}`;
    const { json } = await post({
      artifact: `${header}.${tamperedPayload}.${signature}`,
      public_key_hex: publicKeyHex,
    });
    expect(json.verdict).not.toBe("conforms");
  });

  /**
   * EXPIRY IS REPORTED, NOT FOLDED INTO THE VERDICT, and the first cut
   * of this test asserted the opposite before the library corrected
   * me. An expired offer is a genuine artifact — correctly shaped,
   * correctly signed — that you can no longer pay against. Somebody
   * auditing last month's offers needs "conforms" to stay true;
   * somebody about to settle needs the expiry in their face. Two
   * questions, two fields, which is the same lesson as `made_by` and
   * the office channel table.
   */
  it("keeps an expired offer conforming while marking it not live", async () => {
    const { jws, publicKeyHex } = await foreignOffer({
      validUntil: Math.floor(Date.now() / 1000) - 600,
    });
    const { json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
    });
    expect(json.verdict).toBe("conforms");
    expect(json.live, "an offer that expired ten minutes ago reported live").toBe(false);
    expect(json.what_this_means).toContain("EXPIRED");
    expect(json.liveness).toContain("expired at");
  });

  it("reports a live offer as live", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
    });
    expect(json.verdict).toBe("conforms");
    expect(json.live).toBe(true);
  });

  it("names the missing fields rather than just saying no", async () => {
    const { jws, publicKeyHex } = await foreignOffer({ payTo: undefined });
    const { json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
    });
    const schema = json.checks.find(
      (check: { name: string }) => check.name === "schema",
    );
    expect(schema.ok).toBe(false);
    expect(schema.detail).toContain("payTo");
  });
});

describe("the desk states what it cannot tell you", () => {
  it("carries its limits on every verdict, not only on failures", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
    });
    const limits = json.what_this_cannot_tell_you.join(" ");
    // The three assumptions a "conforms" verdict invites, each denied.
    expect(limits).toContain("not the artifact an issuer served");
    expect(limits).toContain("CONFORMANCE IS NOT ENDORSEMENT");
    expect(limits).toContain("WE CHECK STRUCTURE, SIGNATURE AND TIME");
  });

  it("declares the conflict of interest in the response body", async () => {
    // Not on a policy page somebody has to go find. We sell x402 goods
    // and will be asked about competitors' artifacts; a verdict from a
    // rival is worth its method, so the response says to reproduce it.
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
    });
    expect(json.our_conflict_of_interest).toContain("WE COMPETE WITH SOME OF THE ISSUERS");
    expect(json.run_it_yourself).toContain("verifier");
  });

  it("says plainly when no signature was checked at all", async () => {
    const { jws } = await foreignOffer();
    const { json } = await post({ artifact: jws, resolve_key: false });
    expect(json.key_resolution).toBe("not_attempted");
    expect(json.what_this_cannot_tell_you.join(" ")).toContain(
      "NO SIGNATURE WAS CHECKED",
    );
  });
});

describe("the desk refuses what a stranger should not be able to do", () => {
  it("caps the artifact size", async () => {
    const { status, json } = await post({ artifact: "x".repeat(20_000) });
    expect(status).toBe(413);
    expect(json.error).toContain("ceiling");
  });

  it("asks for an artifact rather than guessing", async () => {
    const { status } = await post({});
    expect(status).toBe(400);
  });

  it("does not 500 on a body that is not an object", async () => {
    const res = await SELF.fetch(`${BASE}/api/conformance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(["not", "an", "object"]),
    });
    expect(res.status).toBe(400);
  });

  it("does not 500 on a body that is not JSON at all", async () => {
    const res = await SELF.fetch(`${BASE}/api/conformance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{{{",
    });
    expect(res.status).toBe(400);
  });

  it("treats junk in the artifact slot as a verdict, not an error", async () => {
    // A caller pasting the wrong string should get a readable "this is
    // not a JWS", never a stack trace or a 500 — the desk's whole
    // audience is people holding something they do not understand.
    const { status, json } = await post({ artifact: "not-a-jws" });
    expect(status).toBe(200);
    expect(json.verdict).not.toBe("conforms");
    expect(json.checks[0].name).toBe("parse");
  });
});

describe("the desk documents itself before anybody posts to it", () => {
  it("says what it checks and what it costs", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/api/conformance`)
    ).json()) as Record<string, any>;
    expect(body.method).toBe("POST");
    expect(String(body.summary)).toContain("Free");
    expect(body.what_it_checks.length).toBeGreaterThan(3);
    // The required-field lists come from the verifier itself rather
    // than being retyped here (rule 1): a field added there shows up
    // in the documentation without anybody remembering.
    expect(body.required_fields.offer).toContain("payTo");
    expect(body.required_fields.receipt.length).toBeGreaterThan(0);
  });

  it("publishes the limits before use, not only after", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/api/conformance`)
    ).json()) as Record<string, any>;
    expect(body.what_it_cannot_tell_you.join(" ")).toContain(
      "CONFORMANCE IS NOT ENDORSEMENT",
    );
    expect(String(body.why_it_is_free)).toContain("a price is a decision");
  });
});


/**
 * THE REQUESTBIN LESSON, WHICH IS IN PROBLEMS.md FOR A REASON.
 *
 * httpbin and RequestBin were beloved, free and unmonetised, and
 * RequestBin died of free-target abuse. FM4 names the shape it would
 * take here: frameworks hardcode a free endpoint into CI, every PR
 * across dozens of repositories hits our edge, and identical
 * top-of-hour POST spikes arrive from runner ranges.
 *
 * Two defences, and they are different in kind. The CONTRACT is
 * frozen so a schema change cannot break hundreds of builds and turn
 * us into the unstable dependency somebody flags. The NETWORK is
 * budgeted so a free desk cannot be drained for outbound requests.
 * Neither is retrofittable once abuse shows up, which is why both are
 * here before it ships.
 */
describe("the desk is bounded before anybody finds it", () => {
  it("serves the frozen contract at a versioned path", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/api/conformance/v1`)
    ).json()) as Record<string, any>;
    expect(body.version).toBe("v1");
    expect(String(body.contract)).toContain("FROZEN");
    expect(String(body.url)).toContain("/api/conformance/v1");
  });

  it("tells an automated caller to pin the version", async () => {
    // The unversioned door still answers — refusing it would be
    // pointless friction for somebody exploring — but it must not let
    // a CI pipeline settle on it by accident.
    const body = (await (
      await SELF.fetch(`${BASE}/api/conformance`)
    ).json()) as Record<string, any>;
    expect(String(body.pin_this_instead)).toContain("/api/conformance/v1");
    expect(String(body.why)).toContain("CI");
  });

  it("stamps the version on every verdict, so a stored one is readable later", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({ artifact: jws, public_key_hex: publicKeyHex });
    expect(json.version).toBe("v1");
  });

  /**
   * THE FREEZE, PINNED. Every field a v1 caller may depend on, listed
   * once. Removing or renaming any of them fails here, which is the
   * entire point of promising a frozen contract: the promise has to
   * be enforced by something other than everybody remembering.
   *
   * ADDING a field must NOT fail — additive change is explicitly
   * allowed by the contract — so this asserts presence, never an
   * exact key set.
   */
  it("keeps every field the v1 contract promises", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({ artifact: jws, public_key_hex: publicKeyHex });
    for (const field of [
      "version",
      "verdict",
      "kind",
      "checks",
      "live",
      "liveness",
      "key_resolution",
      "anchored_key_history",
      "what_this_means",
      "what_this_cannot_tell_you",
      "our_conflict_of_interest",
      "run_it_yourself",
    ]) {
      expect(json, `v1 dropped a promised field: ${field}`).toHaveProperty(field);
    }
    // The shapes callers will branch on, not just the keys.
    expect(typeof json.verdict).toBe("string");
    expect(Array.isArray(json.checks)).toBe(true);
    expect(Array.isArray(json.what_this_cannot_tell_you)).toBe(true);
  });

  it("both paths answer identically, so pinning costs nothing", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const pinned = await post(
      { artifact: jws, public_key_hex: publicKeyHex },
      "/api/conformance/v1",
    );
    const bare = await post(
      { artifact: jws, public_key_hex: publicKeyHex },
      "/api/conformance",
    );
    expect(bare.json.verdict).toBe(pinned.json.verdict);
    expect(bare.json.version).toBe(pinned.json.version);
  });

  /**
   * THE BUDGET DEGRADES TOWARD THE BETTER MODE RATHER THAN DENYING.
   *
   * The offline path is unbounded because it is cheap; only did:web
   * resolution is budgeted, because that is an outbound request to a
   * host a stranger picked. A caller past the budget is not refused —
   * they are handed the shape and time checks plus an instruction to
   * pass a public key, which is what a CI pipeline should have been
   * doing anyway.
   */
  it("never denies the offline path, however much it is hammered", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const { status, json } = await post({
        artifact: jws,
        public_key_hex: publicKeyHex,
      });
      if (status !== 200 || json.verdict !== "conforms") {
        throw new Error(
          `the offline path was throttled at attempt ${attempt}: ${status} ${JSON.stringify(json)}`,
        );
      }
    }
  });

  it("says the budget was ours, not a fact about their artifact", async () => {
    /**
     * Spend the minute's resolution budget, then confirm the caller is
     * told plainly that nothing is wrong with what they sent.
     *
     * THE ATTEMPT CEILING RACES A CLOCK, so it is generous rather than
     * tight. The budget is 60 per WALL-CLOCK MINUTE and resets on the
     * boundary, so a loop of 70 that happens to straddle :00 can spend
     * 40 in one minute and 30 in the next and never bind — which is
     * exactly how this failed on a loaded CI runner while passing on
     * the identical commit a job earlier. A flaky test is worse than no
     * test: it teaches everybody to disbelieve a red light, and this
     * repo spent today learning what that costs.
     *
     * The ceiling now survives one reset with room to spare. The claim
     * is unchanged — the budget must still BIND — and a budget that
     * genuinely stopped bounding still fails here, which is the whole
     * point of the assertion.
     */
    const { jws } = await foreignOffer();
    let exhausted: any = null;
    for (let attempt = 0; attempt < 200 && !exhausted; attempt += 1) {
      const { json } = await post({ artifact: jws });
      if (json.key_resolution === "budget_exhausted") exhausted = json;
    }
    expect(
      exhausted,
      "the resolution budget never bound across 200 requests, which is more than three full minutes' worth; it is not bounding anything",
    ).not.toBeNull();
    const limits = exhausted.what_this_cannot_tell_you.join(" ");
    expect(limits).toContain("OUR LIMIT RATHER THAN YOUR REQUEST");
    expect(limits).toContain("NOTHING IS WRONG WITH YOUR ARTIFACT");
    expect(limits).toContain("public_key_hex");
    /**
     * 30s, not the 5s default: the widened attempt ceiling fixed the
     * minute-boundary race and promptly introduced a TIMEOUT race —
     * 200 sequential requests on a loaded CI runner can take longer
     * than five seconds, and the same commit went green on one runner
     * and red on its twin. The loop exits the moment the budget binds
     * (~request 61 in the normal case), so this ceiling is slack for
     * the slow path, never a cost on the fast one.
     */
  }, 30_000);
});

/**
 * THE ANCHORED-KEY-HISTORY CHECK, which is the one that makes this
 * desk different from "does this signature verify."
 *
 * Signature validity answers: was this signed by the key it names.
 * It cannot answer: was that key the issuer's key AT THE TIME, and
 * can the issuer prove they did not rewrite that history afterwards?
 * A self-hosted key registry is editable after the fact; an
 * append-only chain anchored into Bitcoin via OpenTimestamps is not,
 * or at least not invisibly.
 *
 * CORRECTION THAT PROMPTED THIS: the endpoint shipped WITHOUT it. The
 * function had been in the library for a while and I did not wire it,
 * while the capability was being described outward as though it were
 * there. Building it was the right repair rather than softening the
 * description — but the gap was real, and it is the same overclaim
 * shape this codebase spent the day finding elsewhere.
 */
describe("the anchored-key-history check", () => {
  it("is absent unless asked for, so nobody pays for a request they did not want", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({ artifact: jws, public_key_hex: publicKeyHex });
    expect(json.anchored_key_history).toBeNull();
  });

  it("reports unavailable rather than failing when an issuer publishes no log", async () => {
    // The normal case for almost every issuer alive. `available:
    // false` is information, never a mark against them, and must not
    // move the verdict.
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
      check_anchor: true,
    });
    expect(json.anchored_key_history).not.toBeNull();
    expect(json.anchored_key_history.available).toBe(false);
    expect(
      json.verdict,
      "a missing anchor log changed the conformance verdict, which would mark the entire ecosystem non-conformant for not adopting something almost nobody has adopted",
    ).toBe("conforms");
  });

  it("refuses to search a chain by a key it does not have", async () => {
    // An anchor log is searched BY public key. Without one the lookup
    // would answer a question nobody asked — the same empty-key trap
    // the library guards internally.
    const { jws } = await foreignOffer();
    const { json } = await post({
      artifact: jws,
      resolve_key: false,
      check_anchor: true,
    });
    expect(json.anchored_key_history.available).toBe(false);
    expect(json.anchored_key_history.reason).toContain("searched BY key");
  });

  it("carries the limit that matters most", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { json } = await post({
      artifact: jws,
      public_key_hex: publicKeyHex,
      check_anchor: true,
    });
    // Only present once the check actually ran against a log; when it
    // short-circuits there is nothing to caveat.
    if (json.anchored_key_history.what_it_does_not_prove) {
      expect(json.anchored_key_history.what_it_does_not_prove).toContain(
        "never WHO SHOULD HAVE",
      );
    }
  });

  it("documents itself on the versioned contract", async () => {
    const body = (await (
      await SELF.fetch(`${BASE}/api/conformance/v1`)
    ).json()) as Record<string, any>;
    expect(String(body.request.check_anchor)).toContain("anchor-log.json");
    expect(body.what_it_checks.join(" ")).toContain("anchored key history");
  });
});

/**
 * THE READABLE TWIN. /pulse's own comment makes the argument: a
 * surface only machines can read is the one place a person has to
 * take our word. This desk's entire pitch is "check it yourself
 * rather than trust us," which would be a half-claim if the
 * explanation were available only as JSON.
 *
 * It is also the link somebody can be handed in a chat window, which
 * a curl invocation is not.
 */
describe("the desk has a page a person can read", () => {
  it("serves HTML to a browser and JSON to everything else", async () => {
    const html = await SELF.fetch(`${BASE}/api/conformance/v1`, {
      headers: { Accept: "text/html" },
    });
    expect(html.headers.get("content-type")).toContain("text/html");
    const json = await SELF.fetch(`${BASE}/api/conformance/v1`);
    expect(json.headers.get("content-type")).toContain("application/json");
  });

  it("carries the limits and the conflict on the human page too", async () => {
    // A caveat stated in JSON and dropped in prose is a caveat stated
    // to nobody — the same failure the blind-spot sweep found on /pulse.
    const page = await (
      await SELF.fetch(`${BASE}/api/conformance/v1`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("CONFORMANCE IS NOT ENDORSEMENT");
    expect(page).toContain("WE COMPETE WITH SOME OF THE ISSUERS");
    expect(page).toContain("Why you should not trust this page");
  });

  it("shows a command somebody could actually paste", async () => {
    const page = await (
      await SELF.fetch(`${BASE}/api/conformance/v1`, {
        headers: { Accept: "text/html" },
      })
    ).text();
    expect(page).toContain("curl");
    expect(page).toContain("/api/conformance/v1");
  });
});

/**
 * THE ENTRY-POINT FRAMING, ruled on by the keeper 2026-08-02: the
 * upstream-of-checkout reading is an ADDITIONAL value-add and not the
 * whole proposition, and it has to be value-facing because it is a
 * critical early entry point.
 *
 * So the test holds both halves. The evaluation layer is named where
 * an arriving agent reads first, AND the store is still a store — a
 * version of this copy that quietly renamed us "the cheap evaluation
 * layer" would satisfy the first half and fail the ruling.
 */
describe("llms.txt names the evaluation layer without becoming it", () => {
  it("offers the free checks as a thing to do before committing", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(text).toContain("/api/conformance/v1");
    expect(text).toContain("BEFORE YOU COMMIT TO ANYTHING BIGGER");
  });

  it("still says it is a shop", async () => {
    const text = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(text).toContain("general store");
    expect(
      text,
      "the evaluation layer was allowed to eat the store's own description",
    ).toContain("The shop is still a shop");
  });
});

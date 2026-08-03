import { beforeEach, describe, expect, it } from "vitest";
import { COUNTERPARTS, isAllowedCounterpart } from "@/store/counterparts";
import {
  clearCounterpartCache,
  counterpartKeyUrl,
  MAX_CROSS_REFS,
  MAX_KEY_DOC_BYTES,
  crossRefShapeProblem,
  keyAcceptableAt,
  verifyCrossReference,
  verifyCrossReferences,
} from "@/services/cross-reference";
import {
  canonicalizeCertificate,
  certificateSignatureForm,
  signCertificate,
} from "@/lib/signing";
import { CROSS_REF_ACCEPTED_FOR, type Certificate, type CrossReference } from "@/types";

/**
 * CROSS-PLATFORM RECEIPT RECOGNITION (CORRESPONDENCE T4/T15).
 *
 * Two properties carry this feature and both are tested by attacking
 * them rather than by demonstrating them:
 *
 *   1. THE CLAIM IS NARROW AND STAYS NARROW. `issuer_verified_settlement`
 *      is the only value v0 accepts, and anything else is REFUSED
 *      rather than quietly treated as a weaker claim.
 *   2. IT FAILS CLOSED. Every step that cannot complete reads as
 *      unverified. An unreachable counterpart is an unproven claim,
 *      never an assumed one — this is a statement about somebody
 *      else's operator, riding inside our signature.
 */

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);
const TEST_SEED = "42".repeat(32);
const ALLOW_ALL = { allowHost: () => true };

beforeEach(() => clearCounterpartCache());

function ref(overrides: Partial<CrossReference> = {}): CrossReference {
  return {
    counterpart_issuer: "zooid.fund",
    counterpart_key_fingerprint: KEY_A,
    counterpart_artifact_id: "donation_row_991",
    accepted_for: CROSS_REF_ACCEPTED_FOR,
    verified_at_mint: true,
    ...overrides,
  };
}

/**
 * The body is read as TEXT and parsed by us, so the size ceiling can be
 * applied before a host we do not control gets to allocate memory in
 * our isolate. The mock mirrors that rather than the old .json() shape.
 */
function keyDocFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    }) as unknown as Response) as unknown as typeof fetch;
}

describe("the claim stays narrow", () => {
  it("refuses any accepted_for outside the single v0 value", () => {
    // The guardrail CV and causeclaw flagged independently. An
    // unrecognised claim must be REFUSED, never downgraded to
    // something we happen to tolerate.
    for (const bad of [
      "quality_verified",
      "delivery_confirmed",
      "endorsement",
      "",
    ]) {
      const problem = crossRefShapeProblem(ref({ accepted_for: bad as never }));
      expect(problem, `accepted_for="${bad}" was not refused`).toContain(
        "accepted_for must be",
      );
    }
  });

  it("accepts the one legal value", () => {
    expect(crossRefShapeProblem(ref())).toBeNull();
  });

  it("rejects a reference missing any required field", () => {
    for (const field of [
      "counterpart_issuer",
      "counterpart_key_fingerprint",
      "counterpart_artifact_id",
    ]) {
      const broken = { ...ref() } as Record<string, unknown>;
      delete broken[field];
      expect(crossRefShapeProblem(broken)).toContain(field);
    }
  });

  it("will not take a verified_at_mint that is not a boolean", () => {
    // A truthy string here would read as "we checked" without us
    // having checked anything.
    expect(
      crossRefShapeProblem(ref({ verified_at_mint: "yes" as never })),
    ).toContain("verified_at_mint");
  });
});

describe("the issuer never becomes a URL unchecked", () => {
  it("derives the key document location from a plain hostname", () => {
    expect(counterpartKeyUrl("zooid.fund")).toBe(
      "https://zooid.fund/.well-known/scvd-signing-key",
    );
  });

  it("refuses anything that is not a bare hostname", () => {
    /**
     * The issuer arrives inside a signed artifact, but it was
     * originally supplied by a buyer — so it is untrusted input that
     * happens to be countersigned. A scheme, a path, or credentials
     * in there would make our own verifier fetch wherever an attacker
     * pointed it.
     */
    for (const bad of [
      "https://zooid.fund",
      "zooid.fund/../../etc",
      "user:pass@zooid.fund",
      "localhost",
      "127.0.0.1",
      "",
      "zooid fund",
    ]) {
      expect(counterpartKeyUrl(bad), `"${bad}" was turned into a URL`).toBeNull();
    }
  });
});

describe("key acceptability at a date", () => {
  const doc = {
    current: { public_key: KEY_A },
    retired: [{ public_key: KEY_B, retired_on: "2026-06-01" }],
  };

  it("accepts the counterpart's current key", () => {
    const verdict = keyAcceptableAt(doc, KEY_A, new Date("2026-08-02"));
    expect(verdict.ok).toBe(true);
  });

  it("accepts a retired key for an artifact that predates its retirement", () => {
    // Refusing these would mean a counterpart's rotation retroactively
    // broke every cross-reference they had ever been part of, which
    // would teach operators that rotating is dangerous.
    const verdict = keyAcceptableAt(doc, KEY_B, new Date("2026-05-01"));
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toContain("in service");
  });

  it("refuses a retired key for an artifact dated after retirement", () => {
    const verdict = keyAcceptableAt(doc, KEY_B, new Date("2026-07-01"));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("already retired");
  });

  it("refuses a key that appears nowhere in their history", () => {
    const verdict = keyAcceptableAt(doc, "c".repeat(64), new Date());
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("appears nowhere");
  });

  it("refuses rather than guesses when a retirement date is unreadable", () => {
    const broken = {
      current: { public_key: KEY_A },
      retired: [{ public_key: KEY_B, retired_on: "sometime last year" }],
    };
    const verdict = keyAcceptableAt(broken, KEY_B, new Date("2026-05-01"));
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain("unreadable");
  });
});

describe("it fails closed", () => {
  it("verifies a good reference against a reachable counterpart", async () => {
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: keyDocFetch({ key_history: { current: { public_key: KEY_A } } }),
    });
    expect(check.verified).toBe(true);
    // Even the success message refuses to imply more than it proved.
    expect(check.reason.toLowerCase()).toContain("nothing here speaks to quality");
  });

  it("reads an unreachable counterpart as UNVERIFIED, not as fine", async () => {
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: keyDocFetch(null, 503),
    });
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("503");
    expect(check.reason).toContain("never an assumed one");
  });

  it("reads a network failure as unverified", async () => {
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("unreachable");
  });

  it("does not trust the artifact's own verified_at_mint claim", async () => {
    /**
     * The field says what WE did at mint. It is signed, so it cannot
     * be forged — but it is still a past-tense claim, and a checker
     * today must resolve the key itself rather than reading a boolean
     * and stopping.
     */
    const check = await verifyCrossReference(ref({ verified_at_mint: true }), {
      ...ALLOW_ALL,
      fetch: keyDocFetch({ key_history: { current: { public_key: KEY_B } } }),
    });
    expect(check.verified_at_mint).toBe(true);
    expect(check.verified).toBe(false);
  });

  it("checks every reference on a certificate, keeping order", async () => {
    const checks = await verifyCrossReferences(
      [ref({ counterpart_artifact_id: "one" }), ref({ counterpart_artifact_id: "two" })],
      { ...ALLOW_ALL, fetch: keyDocFetch({ key_history: { current: { public_key: KEY_A } } }) },
    );
    expect(checks.map((c) => c.counterpart_artifact_id)).toEqual(["one", "two"]);
  });

  it("returns nothing for a certificate with no references", async () => {
    expect(await verifyCrossReferences(undefined)).toEqual([]);
  });
});

describe("a counterpart that goes away forever", () => {
  /**
   * The keeper's question, and the one that decides whether this
   * feature is safe to ship at all: if causeclaw vanishes, does any of
   * OUR stuff break?
   *
   * The answer has to be no, in two separate senses — the certificate
   * must stay valid, AND our own verify endpoint must not hang waiting
   * on a corpse.
   */
  const cert: Certificate = {
    cert_id: "cert_orphan",
    item: "dibs",
    patron_number: 7,
    date: "2026-08-02",
    cross_ref: [ref()],
  };

  it("leaves OUR signature completely unaffected", async () => {
    const { signature, publicKey } = await signCertificate(cert, TEST_SEED);
    // No network anywhere in this check. That is the point: our
    // signature is ours, over our own fields, against our own key.
    expect(await certificateSignatureForm(cert, signature, publicKey)).toBe(
      "current",
    );
  });

  it("gives up on a hanging counterpart instead of waiting forever", async () => {
    /**
     * A dead DNS entry fails fast. A host that ACCEPTS the connection
     * and never answers does not — and this resolution runs inside
     * /api/verify, the endpoint promised free and forever. Without a
     * bound, one silent counterpart holds a stranger's request open.
     */
    const hangingFetch = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("TimeoutError: signal timed out")),
        );
      })) as unknown as typeof fetch;

    const started = Date.now();
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: hangingFetch,
      timeoutMs: 50,
    });
    expect(check.verified).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(check.reason).toContain("unreachable");
  });

  it("passes an abort signal, so the bound is real and not decorative", async () => {
    let sawSignal = false;
    const spyFetch = ((_url: string, init?: RequestInit) => {
      sawSignal = init?.signal instanceof AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ key_history: { current: { public_key: KEY_A } } }),
      } as unknown as Response);
    }) as unknown as typeof fetch;

    await verifyCrossReference(ref(), { ...ALLOW_ALL, fetch: spyFetch });
    expect(sawSignal).toBe(true);
  });

  it("keeps a permanently dead domain to one unverified line", async () => {
    const checks = await verifyCrossReferences([ref()], {
      ...ALLOW_ALL,
      fetch: (async () => {
        throw new Error("getaddrinfo ENOTFOUND zooid.fund");
      }) as unknown as typeof fetch,
    });
    expect(checks).toHaveLength(1);
    expect(checks[0]!.verified).toBe(false);
    // And it still says WHOSE record it was, so the keeper can act.
    expect(checks[0]!.counterpart_issuer).toBe("zooid.fund");
  });
});

describe("what a passing check does NOT claim", () => {
  it("says it resolved the issuer, not the artifact", async () => {
    /**
     * We fetch their KEY document. We never fetch their record. So a
     * green result means "that key really is theirs", not "their
     * receipt exists and agrees with ours" — and a reader who took the
     * stronger reading would think two operators had agreed when one
     * of them merely named a key the other owns.
     */
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: keyDocFetch({ key_history: { current: { public_key: KEY_A } } }),
    });
    expect(check.verified).toBe(true);
    expect(check.reason).toContain("not the artifact");
    expect(check.reason).toContain("cannot say it exists");
  });
});

describe("the signature covers it", () => {
  /**
   * The correction to the spec as relayed, which proposed cross_ref as
   * additive and OUTSIDE the signing pipeline. It cannot be: a
   * cross-reference is a provenance claim about a third party, so an
   * unsigned one could be stapled onto a copy of our certificate with
   * our signature still verifying.
   */
  const cert: Certificate = {
    cert_id: "cert_xref",
    item: "graffiti_on_a_train",
    patron_number: 42,
    date: "2026-08-02",
    cross_ref: [ref()],
  };

  it("puts cross_ref inside the canonical signed form", () => {
    expect(canonicalizeCertificate(cert)).toContain("cross_ref");
    expect(canonicalizeCertificate(cert)).toContain("zooid.fund");
  });

  it("breaks the signature if a reference is added after minting", async () => {
    const bare: Certificate = { ...cert };
    delete bare.cross_ref;
    const { signature, publicKey } = await signCertificate(bare, TEST_SEED);

    // Honest article verifies.
    expect(await certificateSignatureForm(bare, signature, publicKey)).toBe(
      "current",
    );

    // Now staple a cross-reference onto it, the forgery this ordering
    // exists to prevent.
    const forged: Certificate = { ...bare, cross_ref: [ref()] };
    expect(await certificateSignatureForm(forged, signature, publicKey)).toBe(
      "invalid",
    );
  });

  it("breaks the signature if a reference is altered after minting", async () => {
    const { signature, publicKey } = await signCertificate(cert, TEST_SEED);
    expect(await certificateSignatureForm(cert, signature, publicKey)).toBe(
      "current",
    );
    const tampered: Certificate = {
      ...cert,
      cross_ref: [ref({ counterpart_artifact_id: "some_other_row" })],
    };
    expect(await certificateSignatureForm(tampered, signature, publicKey)).toBe(
      "invalid",
    );
  });
});

describe("RED TEAM: the allowlist ends the URL-filter arms race", () => {
  /**
   * Every clever hostname filter is a game of catching the next
   * bypass, and the defender loses that game eventually. So the real
   * control is that /api/verify does not fetch a host we did not
   * deliberately add — the filters below are the belt to that braces.
   */
  it("refuses to fetch a host that is not on the list, at all", async () => {
    let fetched = false;
    const check = await verifyCrossReference(ref(), {
      fetch: (async () => {
        fetched = true;
        return { ok: true, status: 200, text: async () => "{}" } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    expect(fetched, "an unlisted host was contacted").toBe(false);
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("not a counterpart this store resolves");
  });

  it("says absence from the list is not a judgment about them", () => {
    // Otherwise the reason string becomes an accusation we cannot back.
    expect(COUNTERPARTS).toEqual([]);
    expect(isAllowedCounterpart("zooid.fund")).toBe(false);
  });

  it("rejects wildcard-DNS hosts that resolve to internal addresses", () => {
    /**
     * These all pass a naive bare-hostname regex because they end in a
     * real TLD, and every one of them resolves to loopback or a
     * private range. This is the bypass class the allowlist exists for.
     */
    for (const host of [
      "127.0.0.1.nip.io",
      "10.0.0.1.sslip.io",
      "192.168.1.1.nip.io",
      "169.254.169.254.nip.io",
      "127-0-0-1.nip.io",
    ]) {
      expect(counterpartKeyUrl(host), `${host} was allowed`).toBeNull();
    }
  });

  it("rejects internal-only suffixes including cloud metadata names", () => {
    for (const host of [
      "metadata.google.internal",
      "printer.local",
      "foo.localhost",
      "thing.home.arpa",
      "box.lan",
      "app.corp",
    ]) {
      expect(counterpartKeyUrl(host), `${host} was allowed`).toBeNull();
    }
  });

  it("rejects hostnames long enough to be a payload", () => {
    expect(counterpartKeyUrl(`${"a".repeat(300)}.com`)).toBeNull();
    expect(counterpartKeyUrl(`${"a".repeat(64)}.com`)).toBeNull();
    expect(counterpartKeyUrl("a..b.com")).toBeNull();
  });
});

describe("RED TEAM: resource exhaustion and amplification", () => {
  it("caps how many references one certificate can fan out to", async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ key_history: { current: { public_key: KEY_A } } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const many = Array.from({ length: 50 }, (_unused, i) =>
      ref({ counterpart_artifact_id: `row_${i}` }),
    );
    const checks = await verifyCrossReferences(many, {
      ...ALLOW_ALL,
      fetch: counting,
    });
    expect(calls).toBeLessThanOrEqual(MAX_CROSS_REFS);
    // And the truncation is REPORTED, never silent.
    const note = checks[checks.length - 1]!;
    expect(note.reason).toContain("only the first");
    expect(note.reason).toContain("NOT verified");
  });

  it("collapses duplicate references to one lookup", async () => {
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ key_history: { current: { public_key: KEY_A } } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    await verifyCrossReferences([ref(), ref(), ref()], {
      ...ALLOW_ALL,
      fetch: counting,
    });
    expect(calls).toBe(1);
  });

  it("refuses an oversized key document instead of parsing it", async () => {
    const huge = (async () =>
      ({
        ok: true,
        status: 200,
        text: async () => "x".repeat(MAX_KEY_DOC_BYTES + 1),
      }) as unknown as Response) as unknown as typeof fetch;
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: huge,
    });
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("exceeds");
  });

  it("does not re-hit a counterpart on every public verification", async () => {
    /**
     * The amplification case: /api/verify is free and unlimited, so
     * without memoisation a stranger could loop one URL and make this
     * store hammer whoever that certificate names.
     */
    let calls = 0;
    const counting = (async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ key_history: { current: { public_key: KEY_A } } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    for (let i = 0; i < 10; i += 1) {
      await verifyCrossReference(ref(), { ...ALLOW_ALL, fetch: counting });
    }
    expect(calls).toBe(1);
  });

  it("remembers a FAILURE too, so a dead host is not re-dialled per request", async () => {
    let calls = 0;
    const failing = (async () => {
      calls += 1;
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    for (let i = 0; i < 5; i += 1) {
      const check = await verifyCrossReference(ref(), {
        ...ALLOW_ALL,
        fetch: failing,
      });
      expect(check.verified).toBe(false);
    }
    expect(calls).toBe(1);
  });
});

describe("RED TEAM: redirects and key spelling", () => {
  it("refuses to follow a redirect", async () => {
    /**
     * An allowed host answering 302 to a link-local address would hand
     * back the exact bypass the allowlist removes.
     *
     * THIS TEST USED TO ASSERT `redirect === "error"` — the MECHANISM
     * rather than the PROPERTY — and in doing so it pinned a value
     * that never worked. Workers refuses to construct a request with
     * redirect: "error" (TypeError, "won't be implemented"), so the
     * option this test was guarding would have thrown on every real
     * call. Found 2026-08-03 when the same option broke the conformance
     * desk's did:web resolution in production.
     *
     * A test that asserts HOW something is done cannot notice that the
     * how does not work. So this asserts WHAT must be true: a 3xx is
     * refused and never chased, whichever mechanism gets us there.
     */
    let sawRedirectMode: string | undefined;
    const spy = ((_url: string, init?: RequestInit) => {
      sawRedirectMode = init?.redirect;
      return Promise.resolve({
        ok: false,
        status: 302,
        headers: { get: () => null },
        text: async () => "",
      } as unknown as Response);
    }) as unknown as typeof fetch;
    const result = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: spy,
    });

    // The property: a redirect is not followed, and the reference is
    // reported unverified with the reason named.
    expect(result.verified).toBe(false);
    expect(String(result.reason ?? "")).toMatch(/redirect|302/i);

    // And the mechanism is one this runtime will actually construct.
    expect(
      ["manual", "follow"],
      `redirect: "${sawRedirectMode}" is not constructible in Workers`,
    ).toContain(sawRedirectMode);
  });

  it("treats 0x-prefixed keys as the same key, not as a mismatch", async () => {
    // Failing this way would be a false accusation dressed as a
    // security finding: their key IS ours, spelled differently.
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: keyDocFetch({
        key_history: { current: { public_key: `0x${KEY_A.toUpperCase()}` } },
      }),
    });
    expect(check.verified).toBe(true);
  });
});

describe("RED TEAM: a HOSTILE counterpart, not merely an absent one", () => {
  /**
   * CV's sharpest note: everything up to here modelled a
   * well-behaved-but-imperfect partner. This block models someone who
   * stood up a .well-known key document specifically to see what our
   * resolution can be tricked into doing. "We fetch a URL we do not
   * control" is the threat model; slow and wrong are the easy cases.
   */
  const hostile = (body: string, headers: Record<string, string> = {}) =>
    (async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
        text: async () => body,
      }) as unknown as Response) as unknown as typeof fetch;

  it("refuses a document that declares itself oversized, before reading it", async () => {
    let read = false;
    const liar = (async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => String(MAX_KEY_DOC_BYTES + 1) },
        text: async () => {
          read = true;
          return "{}";
        },
      }) as unknown as Response) as unknown as typeof fetch;
    const check = await verifyCrossReference(ref(), { ...ALLOW_ALL, fetch: liar });
    expect(check.verified).toBe(false);
    expect(read, "an oversized body was read anyway").toBe(false);
  });

  it("does not let a crafted document reach past the two fields we read", async () => {
    // __proto__ in JSON is an own property, not pollution — but the
    // resolver drops everything it does not understand rather than
    // depending on that staying true in every runtime.
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: hostile(
        JSON.stringify({
          __proto__: { polluted: true },
          key_history: {
            current: { public_key: KEY_A, extra: { deeply: { nested: 1 } } },
            retired: "not-an-array",
            constructor: { prototype: { x: 1 } },
          },
        }),
      ),
    });
    expect(check.verified).toBe(true);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  it("cannot match by sending a non-string key that stringifies oddly", async () => {
    for (const evil of [{ toString: "x" }, ["a".repeat(64)], 12345, null, true]) {
      const check = await verifyCrossReference(ref(), {
        ...ALLOW_ALL,
        fetch: hostile(
          JSON.stringify({ key_history: { current: { public_key: evil } } }),
        ),
      });
      expect(check.verified, `${JSON.stringify(evil)} matched`).toBe(false);
    }
  });

  it("cannot smuggle a match through a malformed retired list", async () => {
    for (const retired of [
      [{ public_key: KEY_A }],
      [{ retired_on: "2026-01-01" }],
      [null, "string", 42],
      [{ public_key: KEY_A, retired_on: null }],
    ]) {
      const check = await verifyCrossReference(ref(), {
        ...ALLOW_ALL,
        fetch: hostile(
          JSON.stringify({
            key_history: { current: { public_key: KEY_B }, retired },
          }),
        ),
      });
      expect(check.verified, `${JSON.stringify(retired)} matched`).toBe(false);
    }
  });

  it("a hostile host can only ever affect claims about ITSELF", async () => {
    /**
     * The cache is keyed by the counterpart's own URL, so a malicious
     * document cannot poison the resolution of a reference to somebody
     * else. Worth pinning: cache poisoning across issuers would turn
     * one bad actor into a lever against every partner we have.
     */
    const perHost = (async (url: string) =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            key_history: {
              current: {
                public_key: url.includes("evil.example") ? KEY_A : KEY_B,
              },
            },
          }),
      }) as unknown as Response) as unknown as typeof fetch;

    const evil = await verifyCrossReference(
      ref({ counterpart_issuer: "evil.example" }),
      { ...ALLOW_ALL, fetch: perHost },
    );
    const honest = await verifyCrossReference(
      ref({ counterpart_issuer: "honest.example" }),
      { ...ALLOW_ALL, fetch: perHost },
    );
    expect(evil.verified).toBe(true);
    // The hostile answer did not become the honest host's answer.
    expect(honest.verified).toBe(false);
  });

  it("collapses a concurrent stampede into one request", async () => {
    /**
     * The cache stops REPEAT lookups; it does not stop fifty
     * simultaneous cold misses all dialling the same host — the
     * amplification we closed, reopened by concurrency.
     */
    let calls = 0;
    const slow = (async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 20));
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({ key_history: { current: { public_key: KEY_A } } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const results = await Promise.all(
      Array.from({ length: 25 }, () =>
        verifyCrossReference(ref(), { ...ALLOW_ALL, fetch: slow }),
      ),
    );
    expect(calls, "a stampede reached the counterpart").toBe(1);
    expect(results.every((r) => r.verified)).toBe(true);
  });
});

describe("RED TEAM: the counterpart rotates between mint and verification", () => {
  /**
   * CV asked for this named explicitly rather than assumed covered.
   * A cross-reference is minted at T against key K. The counterpart
   * rotates afterwards. The first person to verify arrives later, and
   * must still get a true answer about what was true at T.
   */
  const rotated = (retiredOn: string) =>
    (async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () =>
          JSON.stringify({
            key_history: {
              current: { public_key: KEY_B },
              retired: [{ public_key: KEY_A, retired_on: retiredOn }],
            },
          }),
      }) as unknown as Response) as unknown as typeof fetch;

  it("still verifies a reference minted BEFORE their rotation", async () => {
    // The artifact is dated 2026-08-02; they rotated on 2026-09-01.
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: rotated("2026-09-01"),
      asOf: new Date("2026-08-02"),
    });
    expect(check.verified).toBe(true);
    expect(check.reason).toContain("in service");
  });

  it("refuses a reference dated AFTER their rotation", async () => {
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: rotated("2026-07-01"),
      asOf: new Date("2026-08-02"),
    });
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("already retired");
  });

  it("fails closed when a rotating counterpart drops the old key entirely", async () => {
    /**
     * Their hygiene problem, our correct answer: a counterpart who
     * replaces `current` without listing the retired key orphans every
     * artifact signed under it. We report unverified rather than
     * guessing they are the same operator — and the reason names what
     * they would have to publish to fix it.
     */
    const check = await verifyCrossReference(ref(), {
      ...ALLOW_ALL,
      fetch: (async () =>
        ({
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: async () =>
            JSON.stringify({ key_history: { current: { public_key: KEY_B } } }),
        }) as unknown as Response) as unknown as typeof fetch,
    });
    expect(check.verified).toBe(false);
    expect(check.reason).toContain("appears nowhere");
  });
});

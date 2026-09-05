import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { firstPartyScriptCsp } from "@/lib/csp";

const BASE = "https://scvd.store";
const AS_A_BROWSER = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

/**
 * THE DESK'S FORM — the declarative WebMCP surface, and the first
 * thing on this store a person in a browser can actually use.
 *
 * Two properties are worth a test and the third is worth two.
 *
 * IT IS A REAL FORM. The desk had been free and public since it
 * opened and unusable without a terminal; the room printed curl and
 * left everybody else at the door.
 *
 * IT DECLARES ITSELF. `toolname` / `tooldescription` /
 * `toolparamdescription` are the declarative WebMCP attributes, read
 * first-hand from webmachinelearning/webmcp's declarative-api
 * explainer on 2026-08-29. The browser compiles the form to an input
 * schema itself, so there is no second definition to drift.
 *
 * IT CANNOT ACT ON ITS OWN, and that gets its own test with the rule
 * number in it. `toolautosubmit` is the attribute that lets an agent
 * submit on the visitor's behalf. Its ABSENCE is the ruling: an agent
 * may fill this form, and a person presses the button. A future edit
 * that adds it would sail through every other test in this file.
 */
async function room(): Promise<{ status: number; html: string; csp: string | null }> {
  const response = await SELF.fetch(`${BASE}/conformance`, {
    headers: AS_A_BROWSER,
  });
  return {
    status: response.status,
    html: await response.text(),
    csp: response.headers.get("Content-Security-Policy"),
  };
}

async function submit(fields: Record<string, string>) {
  const response = await SELF.fetch(`${BASE}/conformance`, {
    method: "POST",
    headers: {
      ...AS_A_BROWSER,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
  });
  return {
    status: response.status,
    html: await response.text(),
    cache: response.headers.get("Cache-Control"),
    csp: response.headers.get("Content-Security-Policy"),
  };
}

/** A foreign offer, signed by a key that is not ours. */
async function foreignOffer(): Promise<{ jws: string; publicKeyHex: string }> {
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
  const payload = {
    version: 1,
    resourceUrl: "https://example.test/api/buy/thing",
    scheme: "exact",
    network: "eip155:8453",
    asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    payTo: "0x0000000000000000000000000000000000000001",
    amount: "1000",
    validUntil: Math.floor(Date.now() / 1000) + 3600,
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

describe("the conformance desk has a form a person can use", () => {
  it("serves one, pointed at its own door", async () => {
    const { status, html } = await room();
    expect(status).toBe(200);
    expect(html).toContain('<form method="post" action="/conformance"');
    expect(html).toContain('name="artifact"');
    expect(html).toContain('name="public_key_hex"');
    expect(html).toContain('type="submit"');
  });

  it("checks a foreign artifact and renders the desk's own verdict", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const { status, html, cache } = await submit({
      artifact: jws,
      public_key_hex: publicKeyHex,
    });
    expect(status).toBe(200);
    // The desk's verdict word, rendered for eyes rather than parsed.
    expect(html).toContain("conforms");
    expect(html).toContain("The checks");
    // A verdict about an artifact somebody does not trust is not
    // served to the next caller out of a cache.
    expect(cache).toBe("no-store");
  });

  it("refuses an empty submission without pretending it checked something", async () => {
    const { status, html } = await submit({ artifact: "" });
    expect(status).toBe(200);
    expect(html).toContain("Nothing to check");
    expect(html).not.toContain("The checks");
    // And it hands the form back rather than dead-ending.
    expect(html).toContain('name="artifact"');
  });

  it("renders a real refusal for a malformed artifact, not a shrug", async () => {
    // The desk does not error on garbage; it reaches a verdict and
    // names the check that failed. The page has to carry BOTH — the
    // word and the reason — or a reader learns nothing they could act
    // on, which is the whole complaint this store has about verdicts
    // published as a single word.
    const { html } = await submit({ artifact: "not-a-jws" });
    expect(html).toContain("does not conform");
    expect(html).toContain("parse");
    expect(html).not.toContain(">conforms<");
  });

  it("never echoes the submitted artifact back into the page", async () => {
    // Third-party bytes are read, never rendered as ours (rule 18).
    const { jws, publicKeyHex } = await foreignOffer();
    const { html } = await submit({ artifact: jws, public_key_hex: publicKeyHex });
    expect(html).not.toContain(jws);
  });
});

describe("the form declares itself to a browser agent", () => {
  it("carries the declarative WebMCP attributes on the form and its inputs", async () => {
    const { html } = await room();
    expect(html).toContain('toolname="check_conformance"');
    expect(html).toMatch(/tooldescription="[^"]{40,}"/);
    // Every named input describes itself, or the browser compiles a
    // schema with anonymous parameters — which is the lineup's
    // complaint about browser automation, reintroduced by hand.
    const inputs = html.match(/<(input|textarea)[^>]*name="[^"]+"[^>]*>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(2);
    for (const input of inputs) {
      expect(input, `${input} has no toolparamdescription`).toContain(
        "toolparamdescription=",
      );
    }
  });

  it("does NOT carry toolautosubmit — rule 17, in one missing attribute", async () => {
    const { html } = await room();
    // With it, an agent submits on the visitor's behalf. Without it,
    // the browser focuses the button and the person presses it.
    // Nothing the store hands you can act without your decision.
    expect(html).not.toContain("toolautosubmit");
  });

  it("declares the imperative tools too, behind the script fence", async () => {
    const { html, csp } = await room();
    expect(html).toContain('<script src="/webmcp.js"');
    // Shipping a script means shipping a fence (the P7 condition).
    expect(csp).toBe(firstPartyScriptCsp(BASE));
  });

  it("keeps the fence on the answer page too, not just the form", async () => {
    const { csp } = await submit({ artifact: "" });
    expect(csp).toBe(firstPartyScriptCsp(BASE));
  });
});

describe("the desk's three doors cannot disagree", () => {
  it("gives the form and the JSON API the same verdict for the same artifact", async () => {
    const { jws, publicKeyHex } = await foreignOffer();
    const api = await SELF.fetch(`${BASE}/api/conformance/v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artifact: jws, public_key_hex: publicKeyHex }),
    });
    const verdict = (await api.json()) as { verdict: string; checks: unknown[] };
    const { html } = await submit({ artifact: jws, public_key_hex: publicKeyHex });
    // One desk, three doors: the form calls the same service function
    // the API and the MCP tool call, so the word cannot differ.
    expect(html).toContain(verdict.verdict.replace(/_/g, " "));
  });

  it("still answers JSON to a caller that did not ask for HTML", async () => {
    const response = await SELF.fetch(`${BASE}/conformance`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.what_this_is).toBeTruthy();
  });
});

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AGENT_TOOLS_VERIFY,
  agentToolsVerifyField,
  OPENAI_APPS_CHALLENGE,
  VERIFICATION_TAGS,
  X402LIST_TOKENS,
  x402listTokenFile,
} from "@/store/site-verification";

const BASE = "https://scvd.store";

/**
 * The proof-of-control meta tags directories ask for. The assertion
 * loops over the declared list rather than naming tags by hand (rule
 * 1): a tag added to the list and missing from the page is exactly
 * the silent failure that costs a verification round-trip with a
 * third party.
 */
describe("site verification tags", () => {
  it("serves every declared tag in the homepage head", async () => {
    const html = await (await SELF.fetch(`${BASE}/`)).text();
    const head = html.slice(0, html.indexOf("</head>"));
    for (const tag of VERIFICATION_TAGS) {
      expect(head, `${tag.issuer}'s tag is missing from the head`).toContain(
        `<meta name="${tag.name}" content="${tag.content}">`,
      );
    }
  });

  it("carries the Base app ownership tag (added 2026-08-10)", () => {
    // Pins today's change: the directory entry exists in the list at
    // all, so deleting it later is a deliberate act with a diff.
    const base = VERIFICATION_TAGS.find((tag) => tag.name === "base:app_id");
    expect(base?.content).toBe("6a7a377832200665f69b0f4d");
  });
});

/**
 * THE TOKEN FILE THAT ENDS ITS OWN ROUND. Four rounds of x402-list
 * verification hard-coded a nonce with a "remove after" note, and the
 * 08-26 token was still served on 09-02. The file now renders from a
 * dated list with an injected clock, so an expired token is proven
 * absent here rather than remembered about later.
 */
describe("the x402-list token file", () => {
  // The newest token: the file goes quiet on ITS last day, since every
  // older one has already gone by then (2026-09-03: a second round).
  const live = X402LIST_TOKENS[X402LIST_TOKENS.length - 1]!;
  const dayBefore = new Date(`${live.serve_until}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);

  it("serves each token until its own last day, and not from that day on", () => {
    for (const entry of X402LIST_TOKENS) {
      const before = new Date(`${entry.serve_until}T00:00:00Z`);
      before.setUTCDate(before.getUTCDate() - 1);
      expect(x402listTokenFile(before)).toContain(`\n${entry.token}\n`);
      expect(x402listTokenFile(new Date(`${entry.serve_until}T00:00:00Z`))).not.toContain(entry.token);
    }
    const onTheDay = x402listTokenFile(new Date(`${live.serve_until}T00:00:00Z`));
    expect(onTheDay).not.toMatch(/^x402list-verify-/m);
    expect(onTheDay).toContain("# No verification in progress.");
  });

  it("only ever prints comments and tokens, so their parser ignores everything but the nonce", () => {
    for (const line of x402listTokenFile(dayBefore).split("\n")) {
      expect(line === "" || line.startsWith("#") || line.startsWith("x402list-verify-")).toBe(true);
    }
  });

  it("answers at the well-known path as plain text, uncached", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/x402list.txt`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("# x402-list.com domain-ownership tokens");
  });

  it("pins the tokens in flight (issued 2026-09-02 and 2026-09-03) so retiring one early is a diff", () => {
    const first = X402LIST_TOKENS[0]!;
    expect(first.token).toBe("x402list-verify-4CmBDdTm1wU4eq-Q6Artnjthyrn5-tz_6H5WoML3jco");
    expect(first.request_id).toBe("d766c4a7-1918-4f4f-b0f3-2215ec15bb72");
    expect(live.token).toBe("x402list-verify-Jw6U5W79yD9dD5SmQ6Z4_LgEnoN2cTcva-wav7VQ1Ow");
    expect(live.request_id).toBe("56532116-de53-447b-aeac-b46d68d039ff");
  });
});

/**
 * The OpenAI plugin directory's domain check reads one fixed path at
 * the origin root and wants the bare token: no JSON, no comments, no
 * trailing second line. When no token is set the path must not
 * answer 200 — an empty body would be "the token is the empty
 * string", which is a lie the checker would take at face value.
 */
describe("/.well-known/openai-apps-challenge", () => {
  it("serves exactly the token as text/plain, or 404 when none is set", async () => {
    const response = await SELF.fetch(
      `${BASE}/.well-known/openai-apps-challenge`,
    );
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("no-store");
    if (OPENAI_APPS_CHALLENGE) {
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(OPENAI_APPS_CHALLENGE);
      expect(OPENAI_APPS_CHALLENGE).not.toMatch(/\s/);
    } else {
      expect(response.status).toBe(404);
    }
  });
});

/**
 * The Agent Tools ownership claim rides inside the documents the store
 * already serves rather than a path of its own, so the failure mode is
 * not a 404 — it is a field quietly missing from a 200 that otherwise
 * looks right. Both documents are asserted because well-known.ts
 * serves two and a checker picks one.
 */
describe("agent tools ownership claim", () => {
  it.each([
    "/.well-known/x402",
    "/.well-known/x402.json",
    "/.well-known/agent-card.json",
    "/.well-known/agent.json",
    "/.well-known/a2a.json",
  ])(
    "serves agentToolsVerify at %s",
    async (path) => {
      const doc = (await (await SELF.fetch(`${BASE}${path}`)).json()) as Record<string, unknown>;
      expect(doc["agentToolsVerify"]).toBe(AGENT_TOOLS_VERIFY);
    },
  );

  /*
   * THE FIELD BEING PRESENT IS NOT ENOUGH, AND THAT COST A ROUND.
   *
   * Agent Tools reported "agentToolsVerify not found in
   * /.well-known/x402" while the field was demonstrably served on
   * that path. It sat at byte 331,526 of a 333,690-byte document,
   * because `resources` alone serialises to ~344 KB and the claim had
   * been appended after it. A checker with any read cap never reached
   * it. `serves agentToolsVerify` above passed the whole time, because
   * SELF.fetch has no cap and JSON.parse does not care about order.
   *
   * So the assertion that matters is WHERE. A proof-of-control field
   * is read by somebody else's fetcher, under somebody else's limits.
   */
  /*
   * EVERY PATH THE CHECKER NAMES, not just the one we thought of.
   * Agent Tools reported the claim missing from three paths; it was on
   * one of them, buried. Two answered 200 without it at all, which to
   * a checker is indistinguishable from never having published.
   */
  it.each([
    "/.well-known/x402",
    "/.well-known/x402.json",
    "/.well-known/agent-card.json",
    "/.well-known/agent.json",
    "/.well-known/a2a.json",
  ])(
    "puts the claim in the first 2 KB of %s, where a truncating checker will find it",
    async (path) => {
      const body = await (await SELF.fetch(`${BASE}${path}`)).text();
      const at = body.indexOf("agentToolsVerify");
      expect(at, `${path} does not carry the claim at all`).toBeGreaterThan(-1);
      expect(
        at,
        `${path} buries the claim at byte ${at} of ${body.length}; a checker that truncates will report it missing`,
      ).toBeLessThan(2048);
    },
  );

  it("still serves the claim even in a document too large to read whole", async () => {
    // The size is the reason the position matters; if these documents
    // ever became small this test would stop being interesting, so it
    // asserts the condition rather than assuming it.
    const body = await (await SELF.fetch(`${BASE}/.well-known/x402`)).text();
    expect(body.length).toBeGreaterThan(50_000);
    expect(body.slice(0, 2048)).toContain(AGENT_TOOLS_VERIFY);
  });

  it("is a top-level field, which is what the issuer asked for", async () => {
    const doc = (await (await SELF.fetch(`${BASE}/.well-known/x402`)).json()) as Record<string, unknown>;
    expect(Object.keys(doc)).toContain("agentToolsVerify");
  });

  it("does not disturb the fields an indexer already learned", async () => {
    // This document's standing rule is additive-only: version and
    // resources keep their exact shape and position.
    const doc = (await (await SELF.fetch(`${BASE}/.well-known/x402`)).json()) as Record<string, unknown>;
    expect(doc["version"]).toBe(1);
    expect(Array.isArray(doc["resources"])).toBe(true);
    expect(doc["name"]).toBeTruthy();
  });

  it("omits the field entirely when there is no claim, rather than serving an empty string", () => {
    // An empty token published as a field is a claim that the token is
    // the empty string, which is the failure the OpenAI challenge note
    // above records for its own path.
    expect(agentToolsVerifyField()).toEqual({ agentToolsVerify: AGENT_TOOLS_VERIFY });
    expect(AGENT_TOOLS_VERIFY).not.toBe("");
    expect(AGENT_TOOLS_VERIFY.startsWith("atc_")).toBe(true);
  });
});

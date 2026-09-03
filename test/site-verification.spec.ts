import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
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

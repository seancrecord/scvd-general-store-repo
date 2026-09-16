import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE SWEEP THAT SHOULD HAVE COME FIRST.
 *
 * The first markdown pass closed nine landing pages and the per-host
 * route, and called the fallback fixed. It had found its nine by
 * probing a list chosen by hand. Enumerating the sitemap afterwards
 * found eighty-two content pages with no markdown representation —
 * /how-it-works among them, which is how the gap came back.
 *
 * So this list is not a sample. It is every static page that was
 * missing one, held here by name so the next room added without a
 * markdown twin fails this build instead of waiting for an outside
 * scan to notice. The week-stamped rooms (/corpus/round/{week},
 * /ledger/{week}, /corpus/brief, /corpus/month) are covered in
 * markdown-landing-twins.spec.ts against whatever the chain holds,
 * since a fixture with no signed weeks has no such page to ask for.
 */
const ROOMS = [
  "/a2a-desk",
  "/almanac",
  "/attestation",
  "/becoming",
  "/bot-auth",
  "/coverage",
  "/credit",
  "/defects/advertised-version-unpayable",
  "/defects/amount-not-atomic",
  "/defects/delivered-nothing",
  "/defects/discovery-info-invalid",
  "/defects/inputs-undeclared",
  "/defects/mpp-amount-not-integer",
  "/defects/mpp-challenge-expired-at-issue",
  "/defects/mpp-challenge-id",
  "/defects/mpp-challenge-realm",
  "/defects/mpp-currency-unnamed",
  "/defects/mpp-intent-unregistered-or-missing",
  "/defects/mpp-method-unregistered",
  "/defects/mpp-recipient-missing",
  "/defects/mpp-request-not-canonical",
  "/defects/mpp-request-undecodable",
  "/defects/no-402",
  "/defects/nonce-unbound-from-settlement",
  "/defects/offer-contradicts-challenge",
  "/defects/payto-moved",
  "/defects/rail-cannot-receive",
  "/defects/re-challenges-spent-authorization",
  "/defects/replay-accepted",
  "/defects/settlement-error",
  "/defects/surface-contradicts-challenge",
  "/defects/transfer-method-unrecognized",
  "/defects/unparseable-challenge",
  "/defects/unpayable-payto",
  "/defects/unsignable-offer",
  "/defects/wrong-network",
  "/design",
  "/directory",
  "/directory/agentic-market",
  "/directory/the-train",
  "/directory/x402scan",
  "/directory/x402scout",
  "/disagreements",
  "/feeds",
  "/fresh-set",
  "/how-it-works",
  "/inflows",
  "/ledger",
  "/mcp-ward",
  "/menu",
  "/neighbours",
  "/observatory",
  "/operators",
  "/passport",
  "/privacy",
  "/profiles",
  "/pulse",
  "/rails",
  "/registry",
  "/samples",
  "/sources",
  "/stack",
  "/train",
  "/trust",
  "/try",
  "/visitors",
  "/what",
  "/wind-down",
] as const;

describe("every room that was missing a markdown representation", () => {
  it("serves markdown to a caller that asks for it", async () => {
    const failures: string[] = [];
    for (const path of ROOMS) {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/markdown" },
      });
      const type = response.headers.get("content-type") ?? "";
      if (!response.ok || !type.includes("text/markdown")) {
        failures.push(`${path} -> ${response.status} ${type}`);
      }
    }
    expect(failures, `rooms still without markdown:\n${failures.join("\n")}`).toEqual([]);
  });

  it("answers the .md suffix with the same document", async () => {
    const failures: string[] = [];
    for (const path of ROOMS) {
      const twin = await SELF.fetch(`${BASE}${path}.md`);
      if (!twin.ok) {
        failures.push(`${path}.md -> ${twin.status}`);
        continue;
      }
      if (!(twin.headers.get("content-type") ?? "").includes("text/markdown")) {
        failures.push(`${path}.md is not markdown`);
        continue;
      }
      /*
       * THE SAME DOCUMENT, NOT THE SAME BYTES. Some of these rooms
       * stamp the moment they were rendered — /stack signs an
       * `issued_at`, the counted surfaces carry live figures — so two
       * fetches a millisecond apart differ honestly. What must hold is
       * that the suffix reaches the same document at the same
       * canonical address, and the twin says so in its own front
       * matter.
       */
      const body = await twin.text();

      /*
       * Two ways a twin names the page it is a copy of, and one of
       * them must hold. The derived renderer writes front matter with
       * a `canonical`; /menu is rendered by the shelf renderer that
       * predates that convention and carries none. Both come through
       * the suffix handler, which sets a canonical Link header on
       * every twin it serves — so the header is the assertion that
       * covers all of them, and the front matter is checked wherever
       * there is front matter to check.
       */
      const link = twin.headers.get("Link") ?? "";
      if (!link.includes(`<${BASE}${path}>; rel="canonical"`)) {
        failures.push(`${path}.md does not link ${path} as its canonical`);
      }
      if (body.startsWith("---\n") && !body.includes(`canonical: "${BASE}${path}"`)) {
        failures.push(`${path}.md has front matter that names a different canonical`);
      }
    }
    expect(failures, `twin failures:\n${failures.join("\n")}`).toEqual([]);
  });

  it("still answers HTML to a browser and JSON to an agent", async () => {
    const failures: string[] = [];
    for (const path of ROOMS) {
      const html = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (!html.ok || !(html.headers.get("content-type") ?? "").includes("text/html")) {
        failures.push(`${path} broke for a browser: ${html.status}`);
      }
      const json = await SELF.fetch(`${BASE}${path}`, {
        headers: { Accept: "application/json" },
      });
      // /menu answers JSON with a 301 to /menu.json on purpose — one
      // canonical JSON document at one address. A redirect is still an
      // answer; what it must not be is the markdown representation.
      const okJson = json.ok || json.status === 301;
      if (!okJson) failures.push(`${path} broke for an agent: ${json.status}`);
    }
    expect(failures, `negotiation regressions:\n${failures.join("\n")}`).toEqual([]);
  });
});

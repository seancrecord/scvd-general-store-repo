import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { VERIFICATION_TAGS } from "@/store/site-verification";

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

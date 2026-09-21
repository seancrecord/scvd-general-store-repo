import { installBuyerHarness } from "./helpers/buyer-harness";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";
const MANIFESTS = [`${BASE}/.well-known/x402`, `${BASE}/.well-known/x402.json`];

installBuyerHarness();

type Manifest = {
  version?: unknown;
  x402Version?: unknown;
  kind?: unknown;
  resources?: unknown;
};

async function manifest(url: string): Promise<Manifest> {
  const response = await SELF.fetch(url);
  expect(response.status, `${url} must be readable`).toBe(200);
  return (await response.json()) as Manifest;
}

/**
 * THE DOCUMENT THAT WOULD HAVE PASSED WHILE SAYING NOTHING.
 *
 * x402#2979 (specs/extensions/discovery.md, unmerged when this was
 * written) claims the exact path this store has served for months,
 * and makes three demands of it: `x402Version` as an integer, never
 * spelled `version`; `kind`; and resource entries a consumer can
 * actually dereference — a bare pointer carrying `url`, a complete
 * payment description, or a bare string coerced to `{url}`.
 *
 * Our entries named their target `resource` and `resourceUrl`, which
 * are two spellings of a field the extension does not read, and
 * `resources` is only a MAY — so a conforming consumer discards the
 * array with no error surface and files this store as a valid
 * manifest with nothing for sale.
 *
 * That is why the three fields are ONE change and get ONE spec. The
 * two MUST fields alone would have moved this store from "fails shape
 * validation, gets skipped" to "passes validation, publishes an empty
 * shelf" — which is worse, because it looks like an answer. Any
 * future hand that adds a version field without a target, or renames
 * `url` back to one of our own spellings, fails here.
 */
describe("both well-known manifests answer the x402 discovery extension", () => {
  it.each(MANIFESTS)("%s carries x402Version as an integer, not a string", async (url) => {
    const body = await manifest(url);
    expect(
      Number.isInteger(body.x402Version),
      "the extension requires a JSON number; a string fails a conforming reader",
    ).toBe(true);
  });

  it("quotes the version its own 402 challenge states, not a hand-typed copy", async () => {
    /**
     * THE DERIVATION, NOT A SIXTH HARDCODED 2 (AT_SCALE rule 1).
     *
     * The extension's Migration section says to confirm the manifest's
     * value by reading your own 402 response. The authority is the
     * live challenge in the PAYMENT-REQUIRED header; the manifests
     * quote MANIFEST_X402_VERSION. This test is the thing that keeps
     * the quote and the money path from drifting apart in silence —
     * bump one without the other and it fails here rather than in a
     * crawler's index six weeks later.
     */
    const challenge = await SELF.fetch(`${BASE}/api/buy/hello`);
    expect(challenge.status).toBe(402);
    const header = challenge.headers.get("PAYMENT-REQUIRED");
    expect(header, "a 402 with no PAYMENT-REQUIRED header proves nothing here").toBeTruthy();
    const live = (JSON.parse(atob(header as string)) as { x402Version: unknown }).x402Version;
    expect(Number.isInteger(live)).toBe(true);

    for (const url of MANIFESTS) {
      const body = await manifest(url);
      expect(
        body.x402Version,
        `${url} claims a protocol version this store's own 402 does not speak`,
      ).toBe(live);
    }
  });

  it.each(MANIFESTS)("%s declares what this host is, and does not overclaim", async (url) => {
    const body = await manifest(url);
    /*
     * `resource-server`, never `facilitator` and never `both`: this
     * store serves no /supported, /verify or /settle and routes its
     * payments through someone else's facilitator. Claiming otherwise
     * would advertise a capability a consumer MUST then go looking
     * for at a baseUrl we do not answer on.
     */
    expect(body.kind).toBe("resource-server");
  });

  it("keeps the legacy version key, because the additive law still holds", async () => {
    /**
     * The extension's MUST-NOT binds how the VERSION FIELD is spelled,
     * and the same document says unknown fields MUST be ignored. So
     * `version: 1` may stay for the readers that learned it, and a
     * conforming reader takes `x402Version` and discards this one.
     * Pinned so nobody "finishes the migration" by deleting a key the
     * spec never asked us to remove.
     */
    const body = await manifest(`${BASE}/.well-known/x402`);
    expect(body.version).toBe(1);
  });

  it.each(MANIFESTS)("%s gives every resource a url a consumer can dereference", async (url) => {
    const body = await manifest(url);
    const resources = body.resources as Record<string, unknown>[];
    expect(Array.isArray(resources)).toBe(true);
    expect(resources.length, "a manifest with no resources is an empty shelf").toBeGreaterThan(0);

    for (const resource of resources) {
      /*
       * Same-origin, and that is the spec's rule rather than ours:
       * each `url` MUST be HTTPS and on the manifest's own domain,
       * because this document invites indexers to fetch what it
       * lists. An unconstrained field is request forgery by
       * specification.
       */
      expect(
        typeof resource.url === "string" && (resource.url as string).startsWith(`${BASE}/`),
        `a resource entry has no same-origin https url: ${JSON.stringify(resource.resource ?? resource)}`,
      ).toBe(true);
      // The older spellings stay beside it for the readers that
      // learned them; losing them would be a break, not a migration.
      expect(resource.url).toBe(resource.resourceUrl);
      expect(resource.url).toBe(resource.resource);
    }
  });
});

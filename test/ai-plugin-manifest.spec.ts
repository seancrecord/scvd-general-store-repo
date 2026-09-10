import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { AI_PLUGIN_MANIFEST_PATH } from "@/routes/well-known";
import { VALUE_PROPOSITION } from "@/store/copy/position";
import { STORE_CONTACT_EMAIL, STORE_SERVICE_NAME } from "@/store";

/**
 * THE RETIRED PLUGIN MANIFEST (2026-09-10). Crawlers kept asking for
 * it and the store kept saying 404. What this file holds: the path
 * answers; every field is derived from the constants the rest of the
 * store serves, never a second copy; every URL in it resolves on this
 * store; and the manifest's own length limits (name_for_human 20,
 * name_for_model 50, description_for_human 100) hold.
 */
const BASE = "https://scvd.store";

describe("/.well-known/ai-plugin.json", () => {
  it("answers with a v1 manifest whose fields are the store's own constants", async () => {
    const res = await SELF.fetch(`${BASE}${AI_PLUGIN_MANIFEST_PATH}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const manifest = (await res.json()) as Record<string, any>;
    expect(manifest.schema_version).toBe("v1");
    expect(manifest.name_for_human).toBe(STORE_SERVICE_NAME);
    expect(manifest.name_for_human.length).toBeLessThanOrEqual(20);
    expect(manifest.name_for_model).toMatch(/^[a-z0-9_]{1,50}$/);
    expect(manifest.description_for_human.length).toBeLessThanOrEqual(100);
    expect(manifest.description_for_model).toContain(VALUE_PROPOSITION);
    expect(manifest.auth).toEqual({ type: "none" });
    expect(manifest.api.type).toBe("openapi");
    expect(manifest.contact_email).toBe(STORE_CONTACT_EMAIL);
  });

  it("points only at doors this store actually serves", async () => {
    const res = await SELF.fetch(`${BASE}${AI_PLUGIN_MANIFEST_PATH}`);
    const manifest = (await res.json()) as Record<string, any>;
    for (const url of [manifest.api.url, manifest.logo_url, manifest.legal_info_url]) {
      // The parsed origin, not a prefix: "https://scvd.store.example" starts with BASE too.
      expect(new URL(url).origin).toBe(BASE);
      const door = await SELF.fetch(url, { redirect: "manual" });
      expect(door.status, `${url} does not answer`).toBe(200);
    }
    expect(manifest.api.url).toBe(`${BASE}/openapi.json`);
  });
});

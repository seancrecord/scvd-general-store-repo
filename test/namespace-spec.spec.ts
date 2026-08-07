import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { CERT_FIELDS } from "@/lib/signing";
import { ARTIFACT_CLASSES } from "@/store/attestation-spec";
import { MENU_ITEMS } from "@/store";

const BASE = "https://scvd.store";

/**
 * THE NAMESPACE DOC — scvd-attestation/v1 (the corpus strategy's last
 * step). The claim under test is the one the page makes about itself:
 * a verifier written against it is coupled to a contract, not to our
 * code — which is only true if the page derives from the code it
 * describes, carries its version in its path, and never names an
 * artifact or item the store no longer has.
 */
describe("the scvd-attestation/v1 spec", () => {
  it("serves at its versioned URL, and the unversioned alias serves the current version", async () => {
    const versioned = await SELF.fetch(`${BASE}/spec/scvd-attestation/v1`);
    expect(versioned.status).toBe(200);
    const doc = (await versioned.json()) as Record<string, any>;
    expect(doc.namespace).toBe("scvd-attestation");
    expect(doc.version).toBe("v1");
    // The URL it names for itself is the versioned one — the pinnable
    // citation, not the floating alias.
    expect(doc.url).toBe(`${BASE}/spec/scvd-attestation/v1`);

    const alias = (await (
      await SELF.fetch(`${BASE}/spec/scvd-attestation`)
    ).json()) as Record<string, any>;
    expect(alias.version).toBe("v1");
  });

  it("derives the certificate field list from the signing code, byte for byte", async () => {
    const doc = (await (
      await SELF.fetch(`${BASE}/spec/scvd-attestation/v1`)
    ).json()) as Record<string, any>;
    // Not "contains": EQUALS, in order. The order is the contract.
    expect(doc.certificate.signed_fields_in_order).toEqual([...CERT_FIELDS]);
  });

  it("indexes every artifact class the attestation page declares — one source, two surfaces", async () => {
    const doc = (await (
      await SELF.fetch(`${BASE}/spec/scvd-attestation/v1`)
    ).json()) as Record<string, any>;
    const ids = doc.artifacts.map((entry: { id: string }) => entry.id);
    for (const entry of ARTIFACT_CLASSES) {
      expect(ids, `spec is missing artifact class ${entry.id}`).toContain(
        entry.id,
      );
    }
    expect(ids.length).toBe(ARTIFACT_CLASSES.length);
    // Every entry keeps the honest half: what a valid signature does
    // NOT prove travels with what it covers.
    for (const entry of doc.artifacts) {
      expect(
        String(entry.does_not_prove).length,
        `${entry.id} lost its does_not_prove in transit`,
      ).toBeGreaterThan(0);
    }
  });

  it("binds attests conventions only to items that exist on the menu", async () => {
    const doc = (await (
      await SELF.fetch(`${BASE}/spec/scvd-attestation/v1`)
    ).json()) as Record<string, any>;
    const menuIds = new Set(MENU_ITEMS.map((item) => item.id));
    for (const itemId of Object.keys(doc.attests_binding.per_item)) {
      expect(
        menuIds.has(itemId),
        `spec documents an attests binding for "${itemId}", which is not on the menu`,
      ).toBe(true);
    }
  });

  it("states its stability promise and its honest limit", async () => {
    const doc = (await (
      await SELF.fetch(`${BASE}/spec/scvd-attestation/v1`)
    ).json()) as Record<string, any>;
    expect(doc.stability.promise).toContain("additive only");
    expect(doc.stability.promise).toContain("v2 at a new URL");
    // Naming a format does not make its issuer trustworthy — the spec
    // says so about itself rather than leaving it to be worked out.
    expect(doc.honest_limit).toContain("does not make its issuer trustworthy");
  });

  it("is reachable from the surfaces agents actually read (rule 44)", async () => {
    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain("/spec/scvd-attestation/v1");
    const agents = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(agents).toContain("/spec/scvd-attestation/v1");
  });
});

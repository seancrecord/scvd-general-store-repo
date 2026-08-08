import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BASE = "https://scvd.store";

/**
 * THE TAB'S RULE-44 SWEEP, held mechanically: the free MCP server is
 * a product of this store, and a product nobody can find may as well
 * not exist (the /attestation lesson, again). The surfaces agents
 * actually read must name it and point at the code.
 *
 * Deliberately NOT on menu.json: the menu is the PAID catalog — every
 * entry answers a 402 and settles through the till. The Tab is free,
 * so it lives beside the verifier on the free-tools surfaces; listing
 * it as a shelf item would put an unsellable good in the one catalog
 * whose whole claim is "everything here can be bought."
 */
describe("the tab is findable where agents read", () => {
  it("rides llms.txt with the repo path and the honest register", async () => {
    const llms = await (await SELF.fetch(`${BASE}/llms.txt`)).text();
    expect(llms).toContain("scvd-tab");
    expect(llms).toContain("/tree/main/tab");
    // The register survives the listing: facts, never advice.
    expect(llms).toContain("never advice");
  });

  it("rides agents.md beside the verifier, both free tools named", async () => {
    const agents = await (await SELF.fetch(`${BASE}/agents.md`)).text();
    expect(agents).toContain("scvd-tab");
    expect(agents).toContain("/tree/main/tab");
    expect(agents).toContain("/tree/main/verifier");
  });
});

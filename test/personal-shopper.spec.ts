import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import skill from "../skills/scvd-personal-shopper/SKILL.md?raw";
import wallet from "../skills/scvd-personal-shopper/references/wallet.md?raw";
import { sha256Hex } from "@/lib/idempotency";

const BASE = "https://scvd.store";
const PATH = "/.well-known/agent-skills/scvd-personal-shopper/SKILL.md";

describe("personal-agent shopping handoff", () => {
  it("publishes the installable skill and its reachable wallet reference with a matching digest", async () => {
    const index = await (await SELF.fetch(`${BASE}/.well-known/agent-skills/index.json`)).json() as {
      skills: Array<{name: string; url: string; digest: string}>;
    };
    const row = index.skills.find(s => s.name === "scvd-personal-shopper");
    expect(row).toBeDefined();
    expect(row!.url).toBe(`${BASE}${PATH}`);
    const response = await SELF.fetch(row!.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(skill);
    expect(row!.digest).toBe(`sha256:${await sha256Hex(skill)}`);
    const reference = new URL("references/wallet.md", row!.url);
    const walletResponse = await SELF.fetch(reference.href);
    expect(walletResponse.status).toBe(200);
    expect(await walletResponse.text()).toBe(wallet);
    expect((await SELF.fetch(new URL("references/not-a-file.md", row!.url).href)).status).toBe(404);
  });

  it("puts a copyable scoped prompt on the storefront and links the skill from agent discovery", async () => {
    const home = await (await SELF.fetch(BASE)).text();
    expect(home).toContain('id="buy-with-agent"');
    expect(home).toContain("Buy with your agent");
    expect(home).toContain('readonly');
    expect(home).toContain(`${BASE}${PATH}`);
    expect(home).toContain("Get my approval");
    for (const path of ["/llms.txt", "/llms-full.txt", "/skill.md"]) {
      expect(await (await SELF.fetch(`${BASE}${path}`)).text(), path).toContain(PATH);
    }
  });
});

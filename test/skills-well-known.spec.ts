import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/idempotency";

const BASE = "https://scvd.store";
const ROOT = "/.well-known/skills";
interface Entry { name: string; description: string; files: string[] }

describe("website skill discovery used by Hermes and skills.sh", () => {
  it("enumerates installable files and serves the same bytes as the digested catalog", async () => {
    const response = await SELF.fetch(`${BASE}${ROOT}/index.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    const index = await response.json() as { skills: Entry[] };
    const digested = await (await SELF.fetch(`${BASE}/.well-known/agent-skills/index.json`)).json() as {
      skills: Array<{name: string; description: string; url: string; digest: string; type: string}>;
    };
    expect(index.skills.map(s => s.name)).toEqual(digested.skills.map(s => s.name));
    for (const skill of index.skills) {
      const original = digested.skills.find(s => s.name === skill.name)!;
      expect(skill.description).toBe(original.description);
      expect(skill.files).toContain("SKILL.md");
      for (const file of skill.files) {
        const artifact = await SELF.fetch(`${BASE}${ROOT}/${skill.name}/${file}`);
        expect(artifact.status, `${skill.name}/${file}`).toBe(200);
        expect(artifact.headers.get("content-type")).toContain("text/markdown");
        const body = await artifact.text();
        expect(body).toBe(await (await SELF.fetch(new URL(file, original.url))).text());
        if (file === "SKILL.md" && original.type === "skill-md") expect(`sha256:${await sha256Hex(body)}`).toBe(original.digest);
      }
    }
    expect(index.skills.find(s => s.name === "scvd-personal-shopper")!.files)
      .toEqual(["SKILL.md", "references/wallet.md", "references/hosts.md"]);
  });

  it("makes the index and files accessible to cross-origin installers", async () => {
    for (const path of ["index.json", "scvd-personal-shopper/references/hosts.md"]) {
      const response = await SELF.fetch(`${BASE}${ROOT}/${path}`, { headers: { Origin: "https://client.example" } });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("refuses unlisted support files instead of exposing repository paths", async () => {
    for (const suffix of ["missing/SKILL.md", "scvd-personal-shopper/references/missing.md", "scvd-personal-shopper/HOUSE_RULES.md"]) {
      expect((await SELF.fetch(`${BASE}${ROOT}/${suffix}`)).status).toBe(404);
    }
  });

  it("links the installer guidance from the store front and operational manual", async () => {
    const hosts = "/.well-known/agent-skills/scvd-personal-shopper/references/hosts.md";
    for (const path of ["/", "/agents.md"]) {
      expect(await (await SELF.fetch(`${BASE}${path}`)).text()).toContain(hosts);
    }
    expect(await (await SELF.fetch(`${BASE}/llms-full.txt`)).text()).toContain(`${ROOT}/index.json`);
  });
});

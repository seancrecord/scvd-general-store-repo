import { gunzipSync } from "node:zlib";
import { PERSONAL_SHOPPER } from "@/store/personal-shopper";
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AGENT_SKILLS_INDEX_PATH,
  AGENT_SKILLS_SCHEMA,
  frontmatterDescription,
  type AgentSkillsIndex,
} from "@/routes/agent-skills-index";
import { sha256HexBytes } from "@/lib/idempotency";
import verificationSkill from "../skills/scvd-x402-verification/SKILL.md?raw";

const BASE = "https://scvd.store";

/**
 * THE INDEX IS A SET OF CLAIMS ABOUT BYTES, so the test fetches the
 * bytes. A digest the artifact does not match is worse than no index:
 * the RFC has the client refuse the skill, and a store whose own
 * index disowns its own skill has published an instruction to ignore
 * it. Every entry is knocked on, hashed, and compared.
 */
describe("the Agent Skills discovery index", () => {
  async function index(): Promise<AgentSkillsIndex> {
    const response = await SELF.fetch(`${BASE}${AGENT_SKILLS_INDEX_PATH}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    return (await response.json()) as AgentSkillsIndex;
  }

  it("serves the RFC's v0.2.0 shape with the published skills", async () => {
    const body = await index();
    expect(body.$schema).toBe(AGENT_SKILLS_SCHEMA);
    expect(body.skills.map((s) => s.name).sort()).toEqual([
      "execution-contract",
      "scvd-general-store",
      "scvd-personal-shopper",
      "scvd-x402-verification",
    ]);
    for (const skill of body.skills) {
      expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.name.length).toBeLessThanOrEqual(64);
      expect(skill.type).toBe(skill.name === PERSONAL_SHOPPER.name ? "archive" : "skill-md");
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
      expect(skill.url).toBe(`${BASE}/.well-known/agent-skills/${skill.name}/${skill.type === "archive" ? "skill.tar.gz" : "SKILL.md"}`);
      expect(skill.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("serves the focused buyer skill unchanged from its installable source", async () => {
    const body = await index();
    const buyer = body.skills.find((skill) => skill.name === "scvd-x402-verification");
    expect(buyer, "a buyer must discover the focused skill from the public index").toBeDefined();
    const response = await SELF.fetch(buyer!.url);
    expect(await response.text()).toBe(verificationSkill);
  });

  it("every digest matches the raw bytes at its url, and the description is the artifact's own", async () => {
    const body = await index();
    for (const skill of body.skills) {
      const response = await SELF.fetch(skill.url);
      expect(response.status, `${skill.url} must serve`).toBe(200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      expect(`sha256:${await sha256HexBytes(bytes)}`, `${skill.name} digest`).toBe(skill.digest);
      const artifact = skill.type === "archive"
        ? unpack(bytes)["SKILL.md"]! : new TextDecoder().decode(bytes);
      expect(frontmatterDescription(artifact)).toBe(skill.description);
      // A SKILL.md, per the Agent Skills spec: frontmatter with a name.
      expect(artifact).toContain(`name: ${skill.name}`);
    }
  });

  it("the digested store skill is stable across requests — the live line is the pointer, not the number", async () => {
    const url = `${BASE}/.well-known/agent-skills/scvd-general-store/SKILL.md`;
    const [a, b] = await Promise.all([SELF.fetch(url), SELF.fetch(url)]);
    const [first, second] = await Promise.all([a.text(), b.text()]);
    expect(first).toBe(second);
    expect(first).toContain(`The live numbers answer at ${BASE}/stats.`);
    // and it is the same document /skill.md serves, line for line,
    // except at most the one line that carries the live numbers.
    const live = (await (await SELF.fetch(`${BASE}/skill.md`)).text()).split("\n");
    const digested = first.split("\n");
    expect(live.length).toBe(digested.length);
    const differing = digested.filter((line, i) => line !== live[i]);
    expect(differing.length).toBeLessThanOrEqual(1);
    for (const line of differing) {
      expect(line).toBe(`- The live numbers answer at ${BASE}/stats.`);
    }
  });

  it("answers 404 for a skill it does not publish", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/agent-skills/not-a-skill/SKILL.md`);
    expect(response.status).toBe(404);
  });

  it("reads a quoted and an unquoted frontmatter description", () => {
    expect(frontmatterDescription('---\nname: x\ndescription: "A \\"quoted\\" one."\n---\n# x')).toBe('A "quoted" one.');
    expect(frontmatterDescription("---\nname: x\ndescription: Plain one.\n---\n# x")).toBe("Plain one.");
    expect(frontmatterDescription("# no frontmatter")).toBe("");
  });
});

// Read the archive as a consumer: gunzip, walk POSIX headers, compare every
// extracted file against the source rather than the archive producer's helper.
function unpack(bytes: Uint8Array): Record<string, string> {
  const tar = gunzipSync(bytes);
  const files: Record<string, string> = {};
  for (let at = 0; at + 512 <= tar.length && tar[at];) {
    const header = tar.subarray(at, at + 512);
    const name = header.subarray(0, 100).toString().split("\0")[0]!;
    const size = Number.parseInt(header.subarray(124, 136).toString(), 8);
    const checksum = Number.parseInt(header.subarray(148, 156).toString(), 8);
    expect(header[156]).toBe(48); // regular file; never a link
    expect(header.subarray(257, 263).toString()).toBe("ustar\0");
    expect(header.reduce((sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte), 0)).toBe(checksum);
    expect(name).not.toMatch(/(^\/|\.\.|\\)/);
    at += 512;
    files[name] = tar.subarray(at, at + size).toString();
    at += Math.ceil(size / 512) * 512;
  }
  return files;
}

it("installs the whole shopper from the preferred digested index, with stable archive bytes", async () => {
  const index = await (await SELF.fetch(`${BASE}${AGENT_SKILLS_INDEX_PATH}`)).json() as AgentSkillsIndex;
  const shopper = index.skills.find(s => s.name === PERSONAL_SHOPPER.name)!;
  expect(shopper.type).toBe("archive");
  const first = await SELF.fetch(shopper.url);
  expect(first.headers.get("content-type")).toContain("application/gzip");
  const bytes = new Uint8Array(await first.arrayBuffer());
  expect(unpack(bytes)).toEqual({"SKILL.md": PERSONAL_SHOPPER.markdown, ...PERSONAL_SHOPPER.files});
  expect(new Uint8Array(await (await SELF.fetch(shopper.url)).arrayBuffer())).toEqual(bytes);
  expect((await SELF.fetch(`${BASE}/.well-known/agent-skills/not-published/skill.tar.gz`)).status).toBe(404);
  expect((await SELF.fetch(`${BASE}/.well-known/agent-skills/execution-contract/skill.tar.gz`)).status).toBe(404);
});

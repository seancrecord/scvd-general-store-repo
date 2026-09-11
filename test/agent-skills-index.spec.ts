import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  AGENT_SKILLS_INDEX_PATH,
  AGENT_SKILLS_SCHEMA,
  frontmatterDescription,
  type AgentSkillsIndex,
} from "@/routes/agent-skills-index";
import { sha256Hex } from "@/lib/idempotency";

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

  it("serves the RFC's v0.2.0 shape with both published skills", async () => {
    const body = await index();
    expect(body.$schema).toBe(AGENT_SKILLS_SCHEMA);
    expect(body.skills.map((s) => s.name).sort()).toEqual([
      "execution-contract",
      "scvd-general-store",
    ]);
    for (const skill of body.skills) {
      expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.name.length).toBeLessThanOrEqual(64);
      expect(skill.type).toBe("skill-md");
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
      expect(skill.url).toBe(`${BASE}/.well-known/agent-skills/${skill.name}/SKILL.md`);
      expect(skill.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("every digest matches the raw bytes at its url, and the description is the artifact's own", async () => {
    const body = await index();
    for (const skill of body.skills) {
      const response = await SELF.fetch(skill.url);
      expect(response.status, `${skill.url} must serve`).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/markdown");
      const artifact = await response.text();
      expect(`sha256:${await sha256Hex(artifact)}`, `${skill.name} digest`).toBe(skill.digest);
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

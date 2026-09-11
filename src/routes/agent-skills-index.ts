import { Hono } from "hono";
import { sha256Hex } from "@/lib/idempotency";
import { renderExecutionContract } from "@/routes/execution-contract";
import { renderSkillMarkdown } from "@/routes/skill";
import type { Env, HonoEnv } from "@/types";

/**
 * /.well-known/agent-skills/index.json — the Agent Skills discovery
 * index (Cloudflare's agent-skills-discovery-rfc, v0.2.0), and the two
 * artifacts it names, at the paths the RFC says a client will guess.
 *
 * WHAT THIS IS FOR. The store has published a SKILL.md at /skill.md
 * since the skill format existed, and a second, free, product-less
 * one at /skills/execution-contract.md. A reader who knew the URL got
 * them; a client that only knew the convention — fetch the index at
 * the fixed path, read the list, verify each artifact against its
 * digest — got a 404 that reads as "publishes no skills" (2026-09-11,
 * Cloudflare's readiness scan: "Agent Skills index not found"). Same
 * false negative /.well-known/mcp.json and /.well-known/agent-card.json
 * were added to close, same fix: the document the convention expects,
 * at the path it expects, derived from what already exists.
 *
 * THE RFC'S SHAPE, NOTHING ADDED. `$schema` names the index version;
 * each entry carries `name`, `type`, `description`, `url`, `digest`.
 * The digest is `sha256:{hex}` over the raw bytes at `url`, and the
 * RFC has clients REFUSE an artifact that does not match — which is
 * why the artifact behind each `url` is rendered here by the same
 * function that computes the digest, in the same request. The index
 * and the artifact cannot disagree, because the index is computed
 * from the artifact.
 *
 * THE LIVE LINE STAYS OUT OF THE DIGESTED COPY. /skill.md prints the
 * store's track record as of the request; a digest over a number that
 * moves with every purchase would fail every client that fetched the
 * index before the purchase. The copy served under /.well-known/
 * agent-skills/ is the same document with that one line rendered as
 * the pointer to /stats it already prints when the books are
 * unreadable (routes/skill.ts, `live: false`). The description in each
 * entry is read out of the artifact's own frontmatter, per the RFC's
 * SHOULD, so it cannot drift from the file either.
 */

export const AGENT_SKILLS_INDEX_PATH = "/.well-known/agent-skills/index.json";
export const AGENT_SKILLS_SCHEMA =
  "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

interface PublishedSkill {
  /** Agent Skills name: 1–64 chars, lowercase alphanumeric and hyphens. */
  name: string;
  render(env: Env): Promise<string> | string;
}

const PUBLISHED_SKILLS: readonly PublishedSkill[] = [
  {
    name: "scvd-general-store",
    render: (env) => renderSkillMarkdown(env, { live: false }),
  },
  {
    name: "execution-contract",
    render: (env) => renderExecutionContract(env.STORE_BASE_URL),
  },
];

export function skillArtifactPath(name: string): string {
  return `/.well-known/agent-skills/${name}/SKILL.md`;
}

/**
 * The `description:` line of a SKILL.md's frontmatter, unquoted. Both
 * artifacts here are rendered from template literals whose frontmatter
 * puts the description on one line, so a one-line reader is the whole
 * parser; a frontmatter this store does not write is not this file's
 * problem.
 */
export function frontmatterDescription(markdown: string): string {
  if (!markdown.startsWith("---\n")) return "";
  const end = markdown.indexOf("\n---\n", 4);
  if (end < 0) return "";
  for (const line of markdown.slice(4, end).split("\n")) {
    if (!line.startsWith("description:")) continue;
    const raw = line.slice("description:".length).trim();
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
      return raw.slice(1, -1).replace(/\\"/g, '"');
    }
    return raw;
  }
  return "";
}

export interface AgentSkillsIndex {
  $schema: string;
  skills: {
    name: string;
    type: "skill-md";
    description: string;
    url: string;
    digest: string;
  }[];
}

export async function agentSkillsIndex(env: Env): Promise<AgentSkillsIndex> {
  const base = env.STORE_BASE_URL;
  const skills = await Promise.all(
    PUBLISHED_SKILLS.map(async (skill) => {
      const artifact = await skill.render(env);
      return {
        name: skill.name,
        type: "skill-md" as const,
        description: frontmatterDescription(artifact),
        url: `${base}${skillArtifactPath(skill.name)}`,
        digest: `sha256:${await sha256Hex(artifact)}`,
      };
    }),
  );
  return { $schema: AGENT_SKILLS_SCHEMA, skills };
}

export const agentSkillsIndexRoutes = new Hono<HonoEnv>();

agentSkillsIndexRoutes.get(AGENT_SKILLS_INDEX_PATH, async (c) =>
  c.json(await agentSkillsIndex(c.env)),
);

agentSkillsIndexRoutes.get("/.well-known/agent-skills/:name/SKILL.md", async (c) => {
  const skill = PUBLISHED_SKILLS.find((row) => row.name === c.req.param("name"));
  if (!skill) {
    // The RFC: 404 for a skill that does not exist. Not a redirect
    // to the index, which a digest-verifying client cannot use.
    return c.json({ error: "no such skill", index: `${c.env.STORE_BASE_URL}${AGENT_SKILLS_INDEX_PATH}` }, 404);
  }
  return c.text(await skill.render(c.env), 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
});

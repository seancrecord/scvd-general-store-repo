import markdown from "../../skills/scvd-x402-verification/SKILL.md";

// The installable file is also the served artifact; neither its name
// nor its instructions get a second, independently maintained copy.
const name = /^---\n(?:[^\n]*\n)*?name: ([a-z0-9-]+)\n/.exec(markdown)?.[1];
if (!name) throw new Error("Verification skill requires a frontmatter name");

export const VERIFICATION_SKILL = {
  name,
  markdown,
  path: `/.well-known/agent-skills/${name}/SKILL.md`,
};

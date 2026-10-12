import markdown from "../../skills/scvd-personal-shopper/SKILL.md";
import wallet from "../../skills/scvd-personal-shopper/references/wallet.md";
import hosts from "../../skills/scvd-personal-shopper/references/hosts.md";

// The installed and served instructions share bytes, including relative references.
const name = /^---\n(?:[^\n]*\n)*?name: ([a-z0-9-]+)\n/.exec(markdown)?.[1];
if (!name) throw new Error("Personal shopper skill requires a frontmatter name");

export const PERSONAL_SHOPPER = {
  name,
  markdown,
  wallet,
  hosts,
  files: { "references/wallet.md": wallet, "references/hosts.md": hosts } as Readonly<Record<string, string>>,
  hostsPath: `/.well-known/agent-skills/${name}/references/hosts.md`,
  path: `/.well-known/agent-skills/${name}/SKILL.md`,
  walletPath: `/.well-known/agent-skills/${name}/references/wallet.md`,
};

export function personalShopperPrompt(base: string): string {
  return `Help me choose and buy something useful from ${base} for my current task. Read ${base}${PERSONAL_SHOPPER.path} and the current menu. Explain the best fit and its price first; use a free option if it does the job. Check whether you have a compatible wallet. If setup is needed, explain it and help me through the official provider flow with my approval. Never ask for wallet secrets. Get my approval for funding and for the specific purchase before spending. Stay within the approved amount, preserve the purchase's retry identity, and return the artifact, receipt and verification result. If you cannot pay here, tell me what capability is missing.`;
}

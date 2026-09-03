/**
 * OpenAI Agents SDK (JavaScript) — an agent that is about to pay an
 * x402 door, and checks first.
 *
 *   npm install @openai/agents zod
 *   OPENAI_API_KEY=… node examples/openai-agents/agent.mjs https://door.example/api/paid-answer
 *
 * Two ways in, both shown: a local tool that runs the shared walk
 * (examples/shared/decide.mjs), and the store's own read-only MCP
 * door (/mcp/verifier) mounted as a hosted MCP tool, for a client that
 * should never see a paid tool. Nothing here signs or pays; the
 * decision is returned to the agent with every reason named, and the
 * agent's own payment step (an x402 client with a wallet) is yours.
 */
import { Agent, hostedMcpTool, run, tool } from "@openai/agents";
import { z } from "zod";
import { DEFAULT_BASE, DOORS, beforeYouPayWalk } from "../shared/decide.mjs";

const POLICY = {
  allowed_networks: ["eip155:8453", "eip155:137", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"],
  max_amount_usd: 1,
};

const beforeYouPay = tool({
  name: "before_you_pay",
  description:
    "Before paying an x402 URL: read its 402 terms, run scvd.store's free preflight and dry run over the same bytes, and return a decision (pay / do_not_pay / cannot_tell) with the reasons, the terms (network, asset, recipient, amount) and the named defects. Evidence, not a recommendation; it does not establish delivery.",
  parameters: z.object({ url: z.string().url() }),
  async execute({ url }) {
    const walk = await beforeYouPayWalk(url, { policy: POLICY });
    return walk.decision;
  },
});

const verifier = hostedMcpTool({
  serverLabel: "scvd_x402_verifier",
  serverUrl: `${DEFAULT_BASE}${DOORS.verifier_mcp}`,
  requireApproval: "never",
});

const agent = new Agent({
  name: "x402 buyer",
  instructions:
    "You are about to pay an x402 endpoint on the user's behalf. Call before_you_pay first. If the decision is do_not_pay or cannot_tell, do not pay; report the reasons verbatim. If it is pay, report the terms (network, asset, recipient, amount) and what the check does not establish, then hand off to the payment step. Never treat a pass as proof of delivery.",
  tools: [beforeYouPay, verifier],
});

const url = process.argv[2];
if (!url) {
  console.error("usage: node agent.mjs <x402 url>");
  process.exit(2);
}
const result = await run(agent, `I want to buy from ${url}. Should I pay it, and on what terms?`);
console.log(result.finalOutput);

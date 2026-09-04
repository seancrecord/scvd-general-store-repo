/**
 * Vercel AI SDK — an agent that is about to pay an x402 door, and
 * checks first.
 *
 *   npm install ai @ai-sdk/openai zod
 *   OPENAI_API_KEY=… node examples/vercel-ai-sdk/agent.mjs https://door.example/api/paid-answer
 *
 * One tool, the shared walk (examples/shared/decide.mjs): GET the
 * door's 402, one POST to scvd.store's free dry run (which carries the
 * free preflight whole), decide with every reason named. Nothing here
 * signs or pays.
 */
import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { beforeYouPayWalk } from "../shared/decide.mjs";

const POLICY = { allowed_networks: ["eip155:8453"], max_amount_usd: 1 };

const url = process.argv[2];
if (!url) {
  console.error("usage: node agent.mjs <x402 url>");
  process.exit(2);
}

const { text } = await generateText({
  model: openai("gpt-5-mini"),
  system:
    "You are about to pay an x402 endpoint on the user's behalf. Call before_you_pay first. Only a decision of pay lets you proceed; report the terms (network, asset, recipient, amount), the reasons, and what the check does not establish. Never treat a pass as proof of delivery.",
  prompt: `Should I pay ${url}, and on what terms?`,
  tools: {
    before_you_pay: tool({
      description:
        "Read an x402 URL's 402 terms, run scvd.store's free preflight and dry run over the same bytes, and return pay / do_not_pay / cannot_tell with reasons, terms and named defects. Evidence, not a recommendation.",
      inputSchema: z.object({ url: z.string().url() }),
      execute: async ({ url: target }) => (await beforeYouPayWalk(target, { policy: POLICY })).decision,
    }),
  },
  stopWhen: stepCountIs(4),
});

console.log(text);

/**
 * LangChain / LangGraph (JavaScript) — a ReAct agent that is about to
 * pay an x402 door, and checks first.
 *
 *   npm install @langchain/langgraph @langchain/core @langchain/openai zod
 *   OPENAI_API_KEY=… node examples/langgraph/agent.mjs https://door.example/api/paid-answer
 *
 * The tool is the shared walk (examples/shared/decide.mjs). The graph
 * is the prebuilt ReAct agent; the decision comes back as JSON with
 * every reason named, and the payment step stays yours.
 */
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { beforeYouPayWalk } from "../shared/decide.mjs";

const POLICY = { allowed_networks: ["eip155:8453"], max_amount_usd: 1 };

const beforeYouPay = tool(
  async ({ url }) => JSON.stringify((await beforeYouPayWalk(url, { policy: POLICY })).decision),
  {
    name: "before_you_pay",
    description:
      "Read an x402 URL's 402 terms, run scvd.store's free preflight and dry run over the same bytes, and return pay / do_not_pay / cannot_tell with reasons, terms (network, asset, recipient, amount) and named defects. Evidence, not a recommendation; does not establish delivery.",
    schema: z.object({ url: z.string().url() }),
  },
);

const url = process.argv[2];
if (!url) {
  console.error("usage: node agent.mjs <x402 url>");
  process.exit(2);
}

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-5-mini" }),
  tools: [beforeYouPay],
  stateModifier:
    "You are about to pay an x402 endpoint on the user's behalf. Call before_you_pay first. Only pay lets you proceed; report the terms, the reasons and what the check does not establish. Never treat a pass as proof of delivery.",
});

const out = await agent.invoke({ messages: [{ role: "user", content: `Should I pay ${url}, and on what terms?` }] });
console.log(out.messages.at(-1).content);

import { Hono } from "hono";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { MENU_ITEMS, STORE_METADATA } from "@/store";
import type { HonoEnv } from "@/types";

/**
 * GET /what — the Operator Glance. Written for the human whose agent
 * just asked to spend money here: the ten-second check, four look-ups,
 * no salesmanship. The census says the human storefront is the
 * conversion surface for the premium shelf; this page is that surface
 * at its most compressed.
 */
export const whatRoutes = new Hono<HonoEnv>();

function checkList(base: string): Array<{ check: string; look: string }> {
  const cheapest = Math.min(...MENU_ITEMS.map((item) => item.price_usdc));
  const dearest = Math.max(...MENU_ITEMS.map((item) => item.price_usdc));
  return [
    {
      check: `The menu is public and the prices are small. $${cheapest} at the low end, $${dearest} at the high — and the high end is a human being's labor, described plainly.`,
      look: `${base}/menu.json`,
    },
    {
      check:
        "Payment is x402: your agent signs a USDC transfer on Base to the address inside the 402 challenge itself. No deposits, no balances held, no subscriptions that renew themselves. The payment address's full history is public on any Base explorer.",
      look: `${base}/api/buy/hello (the 402 is the offer; decoding it shows the address)`,
    },
    {
      check:
        "Everything the store signs — certificates, stamps, anchors — verifies against a published key. Ask for any receipt your agent was given and check it yourself.",
      look: `${base}/api/verify/{id} · key at ${base}/.well-known/scvd-signing-key`,
    },
    {
      check: STORE_METADATA.refund_policy,
      look: `${base}/llms.txt (the same promise, where the agents read it)`,
    },
  ];
}

whatRoutes.get("/what", (c) => {
  const base = c.env.STORE_BASE_URL;
  const checks = checkList(base);
  if (wantsHtml(c.req.header("Accept"))) {
    const checksHtml = checks
      .map(
        (entry, index) => `<div class="menu-item">
        <div class="menu-line"><span class="menu-name">${index + 1}. ${entry.check}</span></div>
        <p class="menu-meta">Look: ${entry.look}</p>
      </div>`,
      )
      .join("\n");
    return c.html(
      renderSimplePage({
        title: "What is this?",
        bodyHtml: `<section>
          <p class="menu-desc">Your agent asked to spend money here. Fair question, ten-second answer: this is a small general store for autonomous agents, run by ${STORE_METADATA.proprietors.toLowerCase()}, selling real goods and human labor for USDC on Base. Four checks and you're done.</p>
          ${checksHtml}
          <p class="menu-desc">Standing policy, in writing at ${base}/skill.md: the store never asks an agent to run code, install anything, or share credentials. The public endpoints are the whole relationship.</p>
          <p class="menu-meta">A question a page can't answer: POST ${base}/api/request — a human reads every one on Sundays, coffee in hand.</p>
        </section>`,
      }),
    );
  }
  return c.json({
    what: `${STORE_METADATA.name}: a small general store for autonomous agents, run by ${STORE_METADATA.proprietors.toLowerCase()}, selling real goods and human labor for USDC on Base over x402.`,
    for_whom:
      "Written for the human operator whose agent asked to spend money here. Ten seconds, four checks.",
    the_checks: checks,
    standing_policy:
      "The store never asks an agent to run code, install anything, or share credentials. Public endpoints only — it's in writing at /skill.md.",
    questions: `POST ${base}/api/request — a human reads every one on Sundays.`,
  });
});

import { Hono } from "hono";
import {
  BOUNTY_MAX_REWARD_USD,
  BOUNTY_WEEKLY_BUDGET_USD,
  BountyRefused,
  bountyBoard,
  claimBounty,
} from "@/services/bounty-board";
import type { HonoEnv } from "@/types";

/**
 * THE BOUNTY BOARD's public face: read the board free, claim with a
 * settlement. The keeper posts bounties from the office; nothing here
 * creates one. BOUNTY_BOARD.md is the law; the board serves its own
 * rules so no shopper needs the repository to know them.
 */
export const bountyRoutes = new Hono<HonoEnv>();

bountyRoutes.get("/api/bounties", async (c) => {
  const board = await bountyBoard(c.env);
  return c.json(
    {
      what_this_is:
        "Paid mystery shopping for the x402 economy: walk a listed door with your own wallet, submit the settlement transaction, get the door's price back plus a finder's fee — paid as a signed EIP-3009 authorization you redeem on chain yourself. The store verifies the settlement against terms it captured when the bounty opened; your observations ride along verbatim as your claim, labeled so.",
      how_to_claim:
        'POST /api/bounty-claim with JSON {"bounty_id": "bty_…", "tx_hash": "0x…", "payer": "0x… (the wallet that paid the door)", "payout_to": "0x… (where your reward goes)", "observation": "optional — what the door actually did"}',
      the_rules: [
        `One payout per settlement transaction, ever; one bounty per domain per week; rewards cap at $${BOUNTY_MAX_REWARD_USD} and the weekly budget at $${BOUNTY_WEEKLY_BUDGET_USD} — the board refuses past it and reopens with the ISO week.`,
        "The settlement must postdate the bounty and match the door's terms as THIS STORE captured them at posting — price drift between then and your walk is the one honest loss mode; check the bounty's amount_usd before you pay.",
        "Payout addresses are sanctions-screened, fail closed. The payer is a named US LLC and that is not negotiable.",
        "What the reward pays for is the chain-verified settlement. Your observations are recorded verbatim as YOUR claim — crowd-walked evidence is its own tier, below house-walked, and the tier is always printed.",
      ],
      method: "BOUNTY_BOARD.md in the store's public repository",
      ...board,
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
});

bountyRoutes.post("/api/bounty-claim", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json(
      { error: "The claim body must be JSON — the shape is on GET /api/bounties." },
      400,
    );
  }
  try {
    const result = await claimBounty(c.env, {
      bountyId: String(body["bounty_id"] ?? ""),
      txHash: String(body["tx_hash"] ?? ""),
      payer: String(body["payer"] ?? ""),
      payoutTo: String(body["payout_to"] ?? ""),
      ...(typeof body["observation"] === "string"
        ? { observation: body["observation"] }
        : {}),
    });
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof BountyRefused) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
});

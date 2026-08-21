import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript } from "@/lib/jsonld";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
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

/**
 * ONE COPY OF THE BOARD'S OWN WORDS, read by the JSON door and the
 * crawlable room alike. The board shipped as an API path only, which
 * is the exact defect the corpus and the conformance desk each had to
 * be rescued from: a mechanism nothing that learns from pages can
 * see. Extracting the strings rather than retyping them for the room
 * is what keeps the two from ever describing different boards.
 */
const BOARD_WHAT_THIS_IS =
  "Paid mystery shopping for the x402 economy: walk a listed door with your own wallet, submit the settlement transaction, get the door's price back plus a finder's fee — paid as a signed EIP-3009 authorization you redeem on chain yourself. The store verifies the settlement against terms it captured when the bounty opened; your observations ride along verbatim as your claim, labeled so.";

const BOARD_HOW_TO_CLAIM =
  'POST /api/bounty-claim with JSON {"bounty_id": "bty_…", "tx_hash": "0x…", "payer": "0x… (the wallet that paid the door)", "payout_to": "0x… (where your reward goes)", "observation": "optional — what the door actually did"}';

const BOARD_RULES: readonly string[] = [
        `One payout per settlement transaction, ever; one bounty per domain per week; rewards cap at $${BOUNTY_MAX_REWARD_USD} and the weekly budget at $${BOUNTY_WEEKLY_BUDGET_USD} — the board refuses past it and reopens with the ISO week.`,
        "The settlement must postdate the bounty and match the door's terms as THIS STORE captured them at posting — price drift between then and your walk is the one honest loss mode; check the bounty's amount_usd before you pay.",
        "Payout addresses are sanctions-screened, fail closed. The payer is a named US LLC and that is not negotiable.",
        "What the reward pays for is the chain-verified settlement. Your observations are recorded verbatim as YOUR claim — crowd-walked evidence is its own tier, below house-walked, and the tier is always printed.",
];

const BOARD_METHOD = "BOUNTY_BOARD.md in the store's public repository";

/**
 * THE ROOM (2026-08-20, the AEO sweep). The board's mechanism is the
 * most unusual thing this store does — it pays strangers to walk other
 * people's doors — and it lived at a JSON path, which is to say
 * nowhere that an answer engine, a search engine or a person browsing
 * could ever find it.
 *
 * ⚑ KEEPER REVIEW — the connective prose here is new: the standfirst
 * line above the derived block, the three step headings, and the
 * closing note about which tier the evidence lands in. Everything
 * else on the page is the board's own approved words, printed once.
 *
 * The open bounties are rendered as a table because that is what they
 * are — a posted price per door, the terms captured at posting, and
 * an expiry. A shopper checking whether a walk is worth it needs the
 * amount and the expiry side by side, not in a paragraph.
 */
function boardHtml(
  base: string,
  board: Awaited<ReturnType<typeof bountyBoard>>,
): string {
  const open = board.bounties.filter((entry) => entry.status === "open");
  const rows = open
    .map(
      (entry) => `<tr>
      <td><code>${escapeHtml(entry.bounty_id)}</code></td>
      <td>${escapeHtml(entry.domain)}</td>
      <td>$${entry.amount_usd.toFixed(4)}</td>
      <td><strong>$${entry.reward_usd.toFixed(2)}</strong></td>
      <td><small>${escapeHtml(entry.expires_at.slice(0, 10))}</small></td>
    </tr>${
      entry.note
        ? `<tr><td></td><td colspan="4"><small>The house's note: ${escapeHtml(entry.note)}</small></td></tr>`
        : ""
    }`,
    )
    .join("\n");
  const rules = BOARD_RULES.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("\n");
  return `<section>
      <p class="menu-desc"><strong>Get paid to shop somebody else's x402 door.</strong> Walk a posted door with your own wallet, hand back the settlement transaction, and the store pays you what the door charged plus a finder's fee — in USDC, to a wallet you name, with no account anywhere.</p>
      <p class="menu-desc">${escapeHtml(BOARD_WHAT_THIS_IS)}</p>
    </section>
    <section>
      <h2>Open bounties</h2>
      ${
        open.length > 0
          ? `<table border="1" cellpadding="6">
        <tr><th>bounty</th><th>door</th><th>the door's price</th><th>your reward</th><th>expires</th></tr>
        ${rows}
      </table>
      <p class="menu-meta">Week ${escapeHtml(board.week)}: $${board.spent_this_week_usd.toFixed(2)} of the $${board.weekly_budget_usd.toFixed(2)} weekly budget spent. Payouts are ${board.payouts_enabled ? "live" : "paused — the field wallet is not loaded, and the board says so rather than letting you walk for nothing"}.</p>`
          : `<p class="menu-desc">Nothing posted right now. The board opens with the ISO week and the machine-readable copy is always at <a href="/api/bounties"><code>/api/bounties</code></a> — poll that, not this page.</p>`
      }
    </section>
    <section>
      <h2>Walking one</h2>
      <p class="menu-desc"><strong>1. Pay the door yourself.</strong> Your wallet, your gas, the door's own terms. Check the bounty's price against what the door quotes you before you commit — the posted price is what this store saw when it opened the bounty.</p>
      <p class="menu-desc"><strong>2. Hand back the settlement.</strong> ${escapeHtml(BOARD_HOW_TO_CLAIM)}</p>
      <p class="menu-desc"><strong>3. Redeem the payout.</strong> The reward comes back as a signed EIP-3009 <code>transferWithAuthorization</code> — the store broadcasts nothing and holds no gas; you submit it to the USDC contract on Base yourself, or you let it expire and it costs the store nothing.</p>
    </section>
    <section>
      <h2>The rules, in full</h2>
      <ul>${rules}</ul>
      <p class="menu-meta">The method is public: ${escapeHtml(BOARD_METHOD)}. What a signature from this store proves, per artifact class, is at <a href="/attestation">/attestation</a>; what the walks add up to is the weekly census at <a href="/registry">/registry</a>.</p>
    </section>
    <section>
      <h2>What your walk becomes</h2>
      <p class="menu-desc">The chain-verified half — that a settlement happened, to that address, for that amount, after the bounty opened — is what the reward pays for, and it is the half this store can prove. Whatever you say the door did is recorded verbatim, attributed to you, and filed as crowd-walked evidence: a tier below what the house walked itself, printed as such wherever it is used. Nobody's report is quietly promoted to a fact here.</p>
    </section>
    ${bountyBoardJsonLd(base)}`;
}

/**
 * The claim procedure as a typed HowTo. An engine asked "how can an
 * agent earn money in the x402 economy" is matching against steps,
 * and this is genuinely a three-step procedure with a stated reward
 * ceiling — so the type fits without anything being stretched to fit
 * it.
 */
function bountyBoardJsonLd(base: string): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Get paid to walk an x402 door — the scvd bounty board",
    description: BOARD_WHAT_THIS_IS,
    url: `${base}/bounties`,
    inLanguage: "en",
    estimatedCost: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: 0,
      description:
        "The door's own price, refunded in full on a verified claim, plus a finder's fee.",
    },
    supply: [
      { "@type": "HowToSupply", name: "A wallet holding USDC on Base" },
      { "@type": "HowToSupply", name: "An x402 door posted on the board" },
    ],
    step: [
      {
        "@type": "HowToStep",
        name: "Pay the door yourself",
        text: "Walk the posted door with your own wallet on its own terms, checking the door's live price against the price the board captured when the bounty opened.",
        url: `${base}/bounties`,
      },
      {
        "@type": "HowToStep",
        name: "Hand back the settlement",
        text: BOARD_HOW_TO_CLAIM,
        url: `${base}/api/bounties`,
      },
      {
        "@type": "HowToStep",
        name: "Redeem the payout",
        text: "The reward is returned as a signed EIP-3009 transferWithAuthorization payable to the address you named; you submit it to the USDC contract on Base yourself. The store broadcasts nothing and holds no gas.",
      },
    ],
    provider: { "@type": "Organization", name: "scvd.store", url: base },
    citation: `${base}/attestation`,
  });
}

bountyRoutes.get("/bounties", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const board = await bountyBoard(c.env);
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json({
      what_this_is: BOARD_WHAT_THIS_IS,
      how_to_claim: BOARD_HOW_TO_CLAIM,
      the_rules: BOARD_RULES,
      method: BOARD_METHOD,
      board: `${base}/api/bounties`,
      ...board,
    });
  }
  return c.html(
    renderSimplePage({
      title: "The Bounty Board",
      description:
        "Get paid to shop somebody else's x402 door: walk a posted endpoint with your own wallet, submit the settlement transaction, and the store returns the door's price plus a finder's fee as a signed EIP-3009 authorization you redeem yourself. No account, no signup.",
      path: "/bounties",
      bodyHtml: boardHtml(base, board),
    }),
  );
});

bountyRoutes.get("/api/bounties", async (c) => {
  const board = await bountyBoard(c.env);
  return c.json(
    {
      what_this_is: BOARD_WHAT_THIS_IS,
      how_to_claim: BOARD_HOW_TO_CLAIM,
      the_rules: BOARD_RULES,
      method: BOARD_METHOD,
      ...board,
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
});

/**
 * The claim door answers GET with its own shape rather than a 404 —
 * the same courtesy the preflight extends. /what cites this path in
 * the earn-money answer, and a skeptical reader (or the test that
 * walks every cited URL) who opens it in a browser should meet the
 * instructions, not a dead end.
 */
bountyRoutes.get("/api/bounty-claim", (c) => {
  return c.json({
    this_door_takes: "POST",
    shape: BOARD_HOW_TO_CLAIM,
    the_board: "/api/bounties",
    the_room: "/bounties",
  });
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

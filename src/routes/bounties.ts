import { Hono } from "hono";
import type { Context } from "hono";
import { recordBountyClaim, type EventSignals } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { JSONLD_PRICE_CURRENCY, jsonLdScript, organizationRef } from "@/lib/jsonld";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  BOUNTY_AUTH_VALID_SECONDS,
  BOUNTY_MAX_REWARD_USD,
  BOUNTY_OPEN_DAYS,
  BOUNTY_REFUSALS,
  BOUNTY_WEEKLY_BUDGET_USD,
  BountyRefused,
  bountyBoard,
  claimBounty,
} from "@/services/bounty-board";
import { BASE_USDC } from "@/lib/base-rpc";
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
  'POST /api/bounty-claim with JSON {"bounty_id": "bty_…", "tx_hash": "the settlement on the bounty\'s rail — 0x… on Base or Polygon, a base58 signature on Solana", "payer": "the wallet that paid the door, in that rail\'s own address shape", "payout_to": "0x… (where your reward goes — Base USDC on every rail)", "observation": "optional — what the door actually did"}';

const BOARD_RULES: readonly string[] = [
        `One payout per settlement transaction, ever; one bounty per domain per week; rewards cap at $${BOUNTY_MAX_REWARD_USD} and the weekly budget at $${BOUNTY_WEEKLY_BUDGET_USD} — the board refuses past it and reopens with the ISO week.`,
        "The settlement must postdate the bounty and match the door's terms as THIS STORE captured them at posting — price drift between then and your walk is the one honest loss mode; check the bounty's amount_usd before you pay.",
        "Payout addresses are sanctions-screened, fail closed. The payer is a named US LLC and that is not negotiable.",
        "Doors on Base, Polygon and Solana can be posted; the settlement is verified on the door's own rail. The reward pays in Base USDC to a 0x address on every rail — the store signs authorizations and broadcasts nothing, and Solana has no authorization a recipient can redeem.",
        "What the reward pays for is the chain-verified settlement. Your observations are recorded verbatim as YOUR claim — crowd-walked evidence is its own tier, below house-walked, and the tier is always printed.",
];

const BOARD_METHOD = "BOUNTY_BOARD.md in the store's public repository";

/**
 * BEFORE YOU SPEND YOUR OWN MONEY (2026-09-08). The board's three
 * steps start at "pay the door", which is the first irreversible act
 * on the page. Everything a walker can check for free happens before
 * it, and until today none of it was written down anywhere a walker
 * would read in time. Each line names a field on the board's own JSON,
 * so the check is one read and not a judgement call.
 */
const BOARD_BEFORE_YOU_WALK: readonly string[] = [
  "Read the board on the minute you walk, not from a cached page: `status` is derived from the clock on every read, and a listing that reads `expired` will refuse the claim you paid for.",
  "Compare the door's live 402 against the bounty's `amount_usd` and `network` before you pay. The claim is verified against the terms THIS STORE captured at posting; a price that moved between then and your walk is the one loss mode a careful walker still eats.",
  "Check `payouts_enabled` is true and that `spent_this_week_usd` leaves room under `weekly_budget_usd` — a spent week refuses claims until the ISO week turns over.",
  "Settle on the bounty's own rail. The claim door reads the chain named in `network` and nothing else; a payment on another chain cannot claim the listing however real it is.",
  "Have a 0x Base address you control ready for `payout_to`. Rewards pay in Base USDC on every rail, Solana doors included, and the address is sanctions-screened before a cent is signed.",
  `A listing runs ${BOUNTY_OPEN_DAYS} days and one bounty stands per domain per week. Nothing here needs an account, an email, or a signup — the board never learns who you are, only which wallet paid.`,
];

/**
 * ONE WALK, END TO END, IN COMMANDS (2026-09-08). The board described
 * the loop in prose and served the claim's JSON shape as a sentence.
 * An agent reading this page has to turn that sentence into a request,
 * and a person deciding whether the walk is worth it has to picture
 * the whole thing — including the redemption, which is the step that
 * actually turns the reward into money and the only one this store
 * cannot take for them. So: the four commands, no price typed by hand,
 * and every id marked as the example it is.
 */
function workedWalk(base: string) {
  return {
    note: "Ids, hashes and addresses below are illustrative — take the real ones off the board. The reward is a signed authorization, not a transfer: the last command is yours to send, and nobody sends it for you.",
    steps: [
      {
        step: "1. Read the board and pick an open listing",
        shell: `curl -sS ${base}/api/bounties | jq '.bounties[] | select(.status == "open")'`,
        note: "Keep the row: bounty_id, target_url, network, amount_usd and pay_to are the terms your claim is verified against.",
      },
      {
        step: "2. Walk the door with your own wallet",
        note: "No command of ours here: your x402 client, your wallet, your gas, the door's own terms. Check the 402's amount and network against the bounty's before you sign anything, then keep the settlement's transaction id and whatever the door returned.",
      },
      {
        step: "3. Hand back the settlement",
        shell: [
          `curl -sS -X POST ${base}/api/bounty-claim \\`,
          `  -H 'Content-Type: application/json' \\`,
          `  -d '{"bounty_id":"bty_01J8EXAMPLE","tx_hash":"0xabc…","payer":"0xYourPayingWallet","payout_to":"0xWhereTheRewardGoes","observation":"402 quoted the posted price on Base; paid; 200 with a PAYMENT-RESPONSE receipt and the goods delivered."}'`,
        ].join("\n"),
        note: "observation is optional and rides along verbatim as YOUR claim. The reward does not depend on it and is never withheld for what it says.",
      },
      {
        step: "4. Redeem the authorization yourself",
        shell: [
          `cast send ${BASE_USDC} \\`,
          `  'transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes)' \\`,
          `  $FROM $TO $VALUE $VALID_AFTER $VALID_BEFORE $NONCE $SIGNATURE \\`,
          `  --rpc-url https://mainnet.base.org --private-key $YOUR_KEY`,
        ].join("\n"),
        note: `Every argument comes back in the claim's payout.authorization, and the signature beside it. transferWithAuthorization is submittable by anyone, so any relayer can carry it instead of you. It expires ${BOUNTY_AUTH_VALID_SECONDS / 86_400} days after it is signed; unredeemed, the money returns to the week's budget and costs the store nothing.`,
      },
    ],
  };
}

/**
 * ONE COPY OF THE BOARD'S WORDS for every face that serves them: the
 * room, the JSON board, and the claim door's own GET. The rules,
 * the checklist, the worked walk and the refusal catalogue are the
 * same strings in all three or the board is describing a store that
 * does not exist.
 */
function boardWords(base: string) {
  return {
    what_this_is: BOARD_WHAT_THIS_IS,
    how_to_claim: BOARD_HOW_TO_CLAIM,
    before_you_walk: BOARD_BEFORE_YOU_WALK,
    a_walk_end_to_end: workedWalk(base),
    why_a_claim_is_refused: BOUNTY_REFUSALS,
    the_rules: BOARD_RULES,
    method: BOARD_METHOD,
  };
}

/**
 * THE ROOM (2026-08-20, the AEO sweep). The board's mechanism is the
 * most unusual thing this store does — it pays strangers to walk other
 * people's doors — and it lived at a JSON path, which is to say
 * nowhere that an answer engine, a search engine or a person browsing
 * could ever find it.
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
  const checklist = BOARD_BEFORE_YOU_WALK.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("\n");
  const walk = workedWalk(base);
  const walkSteps = walk.steps
    .map(
      (step) => `<h3>${escapeHtml(step.step)}</h3>
      ${"shell" in step && step.shell ? `<pre class="menu-desc"><code>${escapeHtml(step.shell)}</code></pre>` : ""}
      <p class="menu-desc">${escapeHtml(step.note)}</p>`,
    )
    .join("\n");
  const refusals = BOUNTY_REFUSALS.map(
    (row) => `<tr>
      <td>${escapeHtml(row.check)}</td>
      <td>${escapeHtml(row.refused_when)}</td>
      <td>${escapeHtml(row.then_what)}</td>
    </tr>`,
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
      <h2>Before you spend your own money</h2>
      <p class="menu-desc">Everything below is free to check and each line names a field on <a href="/api/bounties"><code>/api/bounties</code></a>. The first irreversible act on this page is paying somebody else's door; these are the checks that go before it.</p>
      <ul>${checklist}</ul>
    </section>
    <section>
      <h2>A walk, end to end</h2>
      <p class="menu-desc">${escapeHtml(walk.note)}</p>
      ${walkSteps}
    </section>
    <section>
      <h2>Why a claim is refused</h2>
      <p class="menu-desc">Every way this store will say no to a claim, in the order the claim door checks them, with what each one costs you. A refusal read for the first time by somebody already out of pocket is a refusal published too late — so it is published here instead, and a test drives every row against the live door.</p>
      <table border="1" cellpadding="6">
        <tr><th>the check</th><th>refused when</th><th>then what</th></tr>
        ${refusals}
      </table>
      <p class="menu-meta">Only one refusal locks a settlement out for good: one that has already been claimed. Every other refusal releases it, and the store signs nothing and spends nothing on a claim it refuses. That is not the same as a second chance — a listing already paid or expired has nothing left to pay whoever walks it, whatever your transaction is still free to claim.</p>
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
      // ISO code for the validator (JSONLD_PRICE_CURRENCY); the payouts
      // really are USDC and the description says so.
      currency: JSONLD_PRICE_CURRENCY,
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
    provider: organizationRef(base),
    citation: `${base}/attestation`,
  });
}

bountyRoutes.get("/bounties", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const board = await bountyBoard(c.env);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({
      ...boardWords(base),
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
      ...boardWords(c.env.STORE_BASE_URL),
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
    /*
     * THE REFUSALS BELONG AT THE DOOR THAT REFUSES (2026-09-08). An
     * agent that reads anything before POSTing here reads this, and
     * the ways this door says no are exactly what it should know
     * before its walker's money is already gone.
     */
    before_you_walk: BOARD_BEFORE_YOU_WALK,
    why_a_claim_is_refused: BOUNTY_REFUSALS,
    a_walk_end_to_end: workedWalk(c.env.STORE_BASE_URL),
    the_board: "/api/bounties",
    the_room: "/bounties",
  });
});

/**
 * Attribution for the claim's row in the books — the same signals
 * the till reads, so a claim from the keeper's own test script books
 * house and a stranger's books organic.
 */
function claimSignals(c: Context<HonoEnv>): EventSignals {
  const signals: EventSignals = {};
  const userAgent = c.req.header("User-Agent");
  if (userAgent) signals.userAgent = userAgent;
  const referrer = c.req.header("Referer");
  if (referrer) signals.referrer = referrer;
  const declared = c.req.query("src") ?? c.req.query("source");
  if (declared) signals.declaredSource = declared;
  const houseHeader = c.req.header("X-House");
  if (houseHeader) signals.houseHeader = houseHeader;
  const houseParam = c.req.query("house");
  if (houseParam) signals.houseParam = houseParam;
  return signals;
}

bountyRoutes.post("/api/bounty-claim", async (c) => {
  /*
   * EVERY CLAIM PRESENTED LEAVES A ROW (2026-09-04). A refused claim
   * used to leave nothing but its 400, so the sanctions screen could
   * refuse every walker for ninety minutes and the desk showed a
   * quiet board. The row is written whichever way the claim goes,
   * and never delays or changes the answer.
   */
  const book = (
    bountyId: string,
    outcome: "paid" | "refused" | "error",
    reason: string,
  ): Promise<void> =>
    recordBountyClaim(c.env, bountyId, outcome, reason, claimSignals(c)).catch(
      () => undefined,
    );
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    await book("", "refused", "the claim body was not JSON");
    return c.json(
      { error: "The claim body must be JSON — the shape is on GET /api/bounties." },
      400,
    );
  }
  const bountyId = String(body["bounty_id"] ?? "");
  try {
    const result = await claimBounty(c.env, {
      bountyId,
      txHash: String(body["tx_hash"] ?? ""),
      payer: String(body["payer"] ?? ""),
      payoutTo: String(body["payout_to"] ?? ""),
      ...(typeof body["observation"] === "string"
        ? { observation: body["observation"] }
        : {}),
    });
    await book(
      bountyId,
      "paid",
      `$${result.reward_usd} authorized to ${result.payout.authorization.to}`,
    );
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof BountyRefused) {
      await book(bountyId, "refused", error.message);
      return c.json({ error: error.message }, 400);
    }
    await book(
      bountyId,
      "error",
      String(error instanceof Error ? error.message : error),
    );
    throw error;
  }
});

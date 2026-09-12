import { Hono } from "hono";
import type { Context } from "hono";
import { recordBountyClaim, type EventSignals } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { JSONLD_PRICE_CURRENCY, jsonLdScript, organizationRef } from "@/lib/jsonld";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  bountyRailNames,
  BOUNTY_REPORT_FIELDS,
  BOUNTY_REPORT_TEMPLATE,
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
import { crowdFindings, type CrowdFindings } from "@/services/crowd-findings";
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
  'POST /api/bounty-claim with JSON {"bounty_id": "bty_…", "tx_hash": "the settlement on the bounty\'s rail — 0x… on Base or Polygon, a base58 signature on Solana", "payer": "the wallet that paid the door, in that rail\'s own address shape", "payout_to": "0x… (where your reward goes — Base USDC on every rail)", "observation": "optional — what the door actually did, in your words", "report": {"status": 200, "payment_response": true, "body_sha256": "hex sha256 of the response body", "bytes": 1234, "latency_ms": 850, "content_type": "application/json"}}';

/**
 * WHAT A USEFUL REPORT CONTAINS (2026-09-08). Ten walks arrived
 * carrying fifty-one characters each and were paid in full, which was
 * correct: nothing on this board had ever said what to send. The
 * `report` object is optional, never a condition of payment, and every
 * field of it is still the walker's own claim — but a body digest from
 * two different wallets at one door either agrees or does not, and
 * that comparison needs neither walker to be trusted.
 */
const BOARD_WHAT_WE_NEED_BACK: readonly string[] = [
  "`report.status` — the HTTP status the PAID request returned, not the 402.",
  "`report.payment_response` — true if the paid response carried a PAYMENT-RESPONSE receipt header, false if it did not. Both answers are worth the same to us; the absence is the finding nobody publishes.",
  "`report.body_sha256` — sha256 of the response body, hex. This is the one field another walker can contradict, which is what makes it worth more than a sentence.",
  "`report.bytes`, `report.latency_ms`, `report.content_type` — what you got, how big, how long it took.",
  "`observation` — free text, and the place for anything the fields above cannot hold: what the goods actually were, whether they matched what the door advertises, what broke.",
  "None of it is a condition. The reward pays for the chain-verified settlement; a report withheld or malformed costs you nothing, because a store that graded a stranger's homework with money would be buying the answers it wanted.",
];

const BOARD_RULES: readonly string[] = [
        `One payout per settlement transaction, ever; one bounty per domain per week; rewards cap at $${BOUNTY_MAX_REWARD_USD} and the weekly budget at $${BOUNTY_WEEKLY_BUDGET_USD} — the board refuses past it and reopens with the ISO week.`,
        "The settlement must postdate the bounty and match the door's terms as THIS STORE captured them at posting — price drift between then and your walk is the one honest loss mode; check the bounty's amount_usd before you pay.",
        "Payout addresses are sanctions-screened, fail closed. The payer is a named US LLC and that is not negotiable.",
        `Doors on ${bountyRailNames()} can be posted; the settlement is verified on the door's own rail, and a listing says which rail it captured. The reward pays in Base USDC to a 0x address on every rail — the store signs authorizations and broadcasts nothing, and Solana has no authorization a recipient can redeem.`,
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
    redeeming_without_gas: REDEEMING_WITHOUT_GAS,
  };
}

/**
 * "I HAVE NO GAS" — THE QUESTION STEP 4 LEFT HANGING (2026-09-11).
 *
 * A visitor wrote to ask whether this store offers a gas-sponsored
 * redemption route, or knows a relayer whose fee is under the reward.
 * Their venture held no funded Base account at all. Step 4 said the
 * authorization "is submittable by anyone" in a single clause and left
 * every practical consequence of that clause unwritten, so the
 * question was fair and the page owed an answer.
 *
 * TWO THINGS ARE TRUE AND THEY ARE OFTEN CONFUSED. The COST of
 * redeeming is nearly nothing. Having a BALANCE AT ALL is a
 * precondition you cannot buy your way out of with a small number.
 * A wallet with zero ETH cannot send a transaction that costs a
 * hundredth of a cent any more than one that costs ten dollars. The
 * letter asked about fees; the blocker is the balance.
 *
 * WHAT THIS STORE WILL NOT DO, stated so nobody has to infer it: we
 * sponsor no gas, run no relayer, and broadcast nothing. That is the
 * same property that makes the reward safe — the store never holds
 * your money and never needs your key — and it is not a gap we are
 * planning to close. Saying "not offered" is a cleaner answer than
 * inventing a service we would then have to keep running.
 *
 * WHAT WE CAN DO IS POINT AT THE CHAIN, which is the whole business:
 * a reward of ours was redeemed by a third party's transaction, and
 * the walker paid no gas themselves. That is an observation, not an
 * endorsement, and it is named here with its hash so a reader checks
 * it rather than believing us.
 */
const REDEEMING_WITHOUT_GAS = {
  does_the_store_sponsor_gas: "No. The store holds no gas, runs no relayer and broadcasts nothing — the same design that means it never holds your money and never needs your key. A reward is a signed authorization, and sending it is yours.",
  what_it_actually_costs:
    "One redemption of ours used 92,332 gas (transaction 0xa59a9232267f5dcad1b07ae58e0f063a8777e7eeab75cff9d0e2d8287d7f381e, Base). At the base fee in force that day the fee was a small fraction of one cent — under two percent of the $0.10 reward it released. Multiply the gas by the current base fee yourself rather than trusting that figure; the point is the order of magnitude, not the number.",
  the_real_blocker:
    "Cost is not what stops a wallet with nothing in it. Any transaction needs a non-zero balance, however cheap it is, so a walker holding only USDC — or only some other chain's coin — cannot send the redemption at all. This is a bootstrapping problem, not a pricing one, and reading it as a pricing one sends you looking for a cheaper relayer when what you need is any submitter.",
  why_that_is_survivable:
    "transferWithAuthorization is a BEARER instrument: the signature authorises a transfer from the store's wallet to YOUR address, and the transaction carrying it may be sent by any address at all. Whoever submits it pays the gas and cannot redirect the money — the destination is inside the signed payload. So a submitter needs no trust from you beyond the gas they are spending.",
  observed_in_the_wild:
    "We have seen this work without arranging it. Transaction 0xa59a9232267f5dcad1b07ae58e0f063a8777e7eeab75cff9d0e2d8287d7f381e moved $0.10 of a bounty reward to the walker's address, and was submitted by a different address entirely, through the public Multicall3 contract at 0xcA11bde05977b3631167028862bE2a173976CA11. The walker spent no gas. We did not provide, arrange, endorse or verify that route, and we name no relayer as recommended — it is simply what the chain shows happened.",
  if_you_still_cannot_send:
    "The authorization does not rot before it expires, so a reward can wait while you fund an address. Nothing is lost by claiming first and redeeming later, as long as it is inside the window on the authorization. What the store will never do is hold the money for you in the meantime.",
} as const;

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
    what_we_need_back: BOARD_WHAT_WE_NEED_BACK,
    /*
     * THE ASK AS A SHAPE, not a sentence: 49 walks read the prose
     * version and sent none of it. A template with keys and nulls is
     * the thing a client can act on without anybody reading anything.
     */
    report_template: BOUNTY_REPORT_TEMPLATE,
    report_fields: BOUNTY_REPORT_FIELDS,
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
  findings: CrowdFindings,
): string {
  const open = board.bounties.filter((entry) => entry.status === "open");
  const rows = open
    .map(
      (entry) => `<tr>
      <td><code>${escapeHtml(entry.bounty_id)}</code></td>
      <td>${escapeHtml(entry.domain)}</td>
      <td>$${entry.amount_usd.toFixed(4)}</td>
      <td><strong>$${entry.reward_usd.toFixed(2)}</strong></td>
      <td><small>${escapeHtml(entry.expires_at.slice(0, 10))}${entry.tier ? ` <em>(${escapeHtml(entry.tier)})</em>` : ""}</small></td>
    </tr>${
      entry.note
        ? `<tr><td></td><td colspan="4"><small>The house's note: ${escapeHtml(entry.note)}</small></td></tr>`
        : ""
    }${
      entry.distinct_payer_required
        ? `<tr><td></td><td colspan="4"><small><strong>Second walk:</strong> this one pays a wallet that has not already been paid for walking this door — a repeat by the same wallet is refused, and the listing stays open for somebody else.</small></td></tr>`
        : ""
    }${
      entry.asks && entry.asks.length > 0
        ? `<tr><td></td><td colspan="4"><small><strong>What we want observed here:</strong> ${entry.asks
            .map((ask) => escapeHtml(ask))
            .join(" · ")}</small></td></tr>`
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
  const limits = findings.limits
    .map((line) => `<li><small>${escapeHtml(line)}</small></li>`)
    .join("\n");
  const needBack = BOARD_WHAT_WE_NEED_BACK.map(
    (line) => `<li>${escapeHtml(line)}</li>`,
  ).join("\n");
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
      <h2>What we need back</h2>
      <p class="menu-desc">The reward pays for the chain-verified settlement and nothing else — this list is what makes a walk worth more than its own receipt, not a condition of being paid. A report you leave out costs you nothing.</p>
      <ul>${needBack}</ul>
      <p class="menu-meta">Two walkers at one door either hand back the same <code>body_sha256</code> or they do not, and that comparison needs neither of them to be trusted — which is the only way a claim on this board becomes evidence without the store pretending it saw the transcript.</p>
    </section>
    <section>
      <h2>The rules, in full</h2>
      <ul>${rules}</ul>
      <p class="menu-meta">The method is public: ${escapeHtml(BOARD_METHOD)}. What a signature from this store proves, per artifact class, is at <a href="/attestation">/attestation</a>; what the walks add up to is the weekly census at <a href="/registry">/registry</a>.</p>
    </section>
    <section>
      <h2>What the walks have shown</h2>
      <p class="menu-desc">${escapeHtml(findings.headline)}</p>
      <table border="1" cellpadding="6">
        <tr><th>what</th><th>count</th><th>whose fact it is</th></tr>
        <tr><td>settlements verified on chain</td><td><strong>${findings.walks.settlements}</strong></td><td>ours, proven</td></tr>
        <tr><td>distinct paying wallets</td><td><strong>${findings.walks.distinct_payers}</strong></td><td>ours, proven</td></tr>
        <tr><td>distinct doors walked</td><td><strong>${findings.walks.distinct_doors}</strong></td><td>ours, proven</td></tr>
        <tr><td>walks carrying a report</td><td>${findings.reports.reported} <small>of ${findings.walks.settlements}</small></td><td>theirs, claimed</td></tr>
        <tr><td>paid responses said to carry a PAYMENT-RESPONSE receipt</td><td>${findings.reports.receipt_seen} <small>· said to carry none: ${findings.reports.receipt_absent} · not reported: ${findings.walks.settlements - findings.reports.receipt_seen - findings.reports.receipt_absent}</small></td><td>theirs, claimed</td></tr>
        <tr><td>our own knock said ready and the walk returned 2xx</td><td>${findings.house_vs_walker.both_good}</td><td>ours observed, theirs claimed</td></tr>
        <tr><td>our knock said ready and the walk did not</td><td>${findings.house_vs_walker.house_ready_walk_failed}</td><td>ours observed, theirs claimed</td></tr>
        <tr><td>our knock said NOT ready and the walk worked anyway</td><td>${findings.house_vs_walker.house_unready_walk_worked}</td><td>ours observed, theirs claimed</td></tr>
      </table>
      ${
        findings.digests.length > 0
          ? `<p class="menu-desc"><strong>Two wallets, one door:</strong> ${findings.digests
              .map(
                (row) =>
                  `${escapeHtml(row.host)} — ${row.walks} walk${row.walks === 1 ? "" : "s"} from ${row.payers} wallet${row.payers === 1 ? "" : "s"}, bodies ${escapeHtml(row.agreement)}`,
              )
              .join(" · ")}. A digest two strangers agree on needs neither of them trusted.</p>`
          : ""
      }
      <ul>${limits}</ul>
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
      what_the_walks_show: crowdFindings(board.bounties),
      ...board,
    });
  }
  return c.html(
    renderSimplePage({
      title: "The Bounty Board",
      description:
        "Get paid to shop somebody else's x402 door: walk a posted endpoint with your own wallet, submit the settlement transaction, and the store returns the door's price plus a finder's fee as a signed EIP-3009 authorization you redeem yourself. No account, no signup.",
      path: "/bounties",
      bodyHtml: boardHtml(base, board, crowdFindings(board.bounties)),
    }),
  );
});

bountyRoutes.get("/api/bounties", async (c) => {
  const board = await bountyBoard(c.env);
  return c.json(
    {
      ...boardWords(c.env.STORE_BASE_URL),
      what_the_walks_show: crowdFindings(board.bounties),
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
    what_we_need_back: BOARD_WHAT_WE_NEED_BACK,
    report_template: BOUNTY_REPORT_TEMPLATE,
    report_fields: BOUNTY_REPORT_FIELDS,
    /**
     * The claim body, complete and fillable. The shape door answers
     * with the whole example rather than a description of one.
     */
    example_claim: {
      bounty_id: "bty_…",
      tx_hash: "the settlement on the bounty's rail",
      payer: "the wallet that paid the door",
      payout_to: "0x… (Base USDC, every rail)",
      observation: "one line: what the goods actually were",
      report: BOUNTY_REPORT_TEMPLATE,
      note: "report fields are also accepted at the top level of this body if that is easier — nested wins on a conflict, and the answer says which arrived",
    },
    why_a_claim_is_refused: BOUNTY_REFUSALS,
    a_walk_end_to_end: workedWalk(c.env.STORE_BASE_URL),
    the_board: "/api/bounties",
    the_room: "/bounties",
  });
});

/**
 * THE REPORT, WHEREVER THE WALKER PUT IT (2026-09-09).
 *
 * The board asked for a nested `report` object and got nothing at all
 * from forty-nine walks. Some of that is clients never reading the
 * ask; some of it, predictably, will be clients that read it and put
 * the fields at the top level of the claim body, which is the
 * flatter and frankly more obvious shape. Refusing those on a
 * technicality would be this store failing the same way the doors it
 * audits fail — a correct payload rejected for its packaging.
 *
 * So both are taken, nested wins on a conflict, and the answer tells
 * them which shape arrived. Being generous about the envelope costs
 * nothing; the fields themselves are still shape-checked at the door.
 */
export function claimedReport(
  body: Record<string, unknown>,
): Parameters<typeof claimBounty>[1]["report"] | undefined {
  const nested =
    body["report"] && typeof body["report"] === "object"
      ? (body["report"] as Record<string, unknown>)
      : {};
  const flat: Record<string, unknown> = {};
  for (const entry of BOUNTY_REPORT_FIELDS) {
    if (body[entry.field] !== undefined) flat[entry.field] = body[entry.field];
  }
  const merged = { ...flat, ...nested };
  return Object.keys(merged).length > 0
    ? (merged as Parameters<typeof claimBounty>[1]["report"])
    : undefined;
}

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
      {
        error: "The claim body must be JSON — here is the shape rather than a pointer to it.",
        example_claim: {
          bounty_id: "bty_…",
          tx_hash: "the settlement on the bounty's rail",
          payer: "the wallet that paid the door",
          payout_to: "0x… (Base USDC, every rail)",
          report: BOUNTY_REPORT_TEMPLATE,
        },
      },
      400,
    );
  }
  const bountyId = String(body["bounty_id"] ?? "");
  try {
    const { walkerOffer } = await import("@/services/walker-offer");
    const result = await claimBounty(c.env, {
      bountyId,
      txHash: String(body["tx_hash"] ?? ""),
      payer: String(body["payer"] ?? ""),
      payoutTo: String(body["payout_to"] ?? ""),
      ...(typeof body["observation"] === "string"
        ? { observation: body["observation"] }
        : {}),
      ...(claimedReport(body) ? { report: claimedReport(body) } : {}),
    });
    await book(
      bountyId,
      "paid",
      `$${result.reward_usd} authorized to ${result.payout.authorization.to}`,
    );
    /*
     * ONE LINE, ON THE WAY OUT, TO SOMEBODY WHO WAS JUST PAID. Never
     * on a refusal (walker-offer.ts states why), and never a condition
     * of anything above it — the reward was decided by the chain.
     */
    // The Bounty Hunter card (Paywall): pressed to the wallet the reward
    // went to, on the way out; never a condition of the payout above.
    const { clearConditions, earnedPressing } = await import("@/services/cards");
    const { pressingSummary } = await import("@/services/instant-goods");
    const hunter = await earnedPressing(c.env, { key: "bounty-hunter", certId: `bounty:${bountyId}`, payer: result.payout.authorization.to }).catch(() => null);
    // An Unclaimed Bounty in that wallet's binder burns on the claim.
    const cleared = await clearConditions(c.env, result.payout.authorization.to, { itemId: "bounty_claim", certId: `bounty:${bountyId}` }).catch(() => []);
    return c.json(
      {
        ...result,
        spend_it_here: walkerOffer(c.env.STORE_BASE_URL),
        ...(hunter ? { pressing: pressingSummary(c.env.STORE_BASE_URL, hunter.card) } : {}),
        ...(cleared.length > 0 ? { conditions_cleared: cleared.map((burn) => ({ card_id: burn.burn.card_id, key: burn.burn.key, cleared_by: burn.burn.cleared_by })) } : {}),
      },
      200,
    );
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

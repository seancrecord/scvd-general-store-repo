import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import {
  HIGH_SHELF_FLOOR_USDC,
  highShelf,
  type MarketAggregates,
} from "@/services/market";
import type { bountyBoard } from "@/services/bounty-board";
import {
  BOUNTY_MAX_REWARD_USD,
  BOUNTY_WEEKLY_BUDGET_USD,
  bountyRails,
} from "@/services/bounty-board";
import type { BountyPlan } from "@/services/bounty-plan";
import {
  BOUNTY_BATCH_CAP,
  BOUNTY_BATCH_DEFAULT_REWARD,
  type BountyCandidate,
} from "@/services/bounty-batch";
import type { WardRound } from "@/services/ward-round";

type BoardState = Awaited<ReturnType<typeof bountyBoard>>;

/** The standing order as the desk shows it: the plan and its condition. */
export interface StandingOrderView {
  plan: BountyPlan | null;
  /** What this week has already promised — spent AND still open. */
  committed: { spent: number; open: number; headroom: number } | null;
  notice?: string;
}

/**
 * THE POSTING LIST (2026-09-08, the keeper: "i should probably do up
 * to ten bounties and then like tracking what we are doing with it").
 *
 * The desk had one URL field, so ten bounties was ten trips with a
 * URL hunt between each, and nothing on the page said which doors
 * this store had already sent a walker to. The list is the week's own
 * ready rows with OUR history beside each — never walked, open now,
 * paid on a date, expired unclaimed — so the tenth press is as
 * informed as the first.
 *
 * A BLOCKED DOOR IS SHOWN, DISABLED, WITH ITS REASON. Filtering it
 * away would answer the keeper's question by hiding it, and he would
 * ask it again next week.
 */
function candidatesHtml(candidates: readonly BountyCandidate[]): string {
  const railOptions = bountyRails()
    .map(
      (rail) =>
        `<option value="${escapeHtml(rail.caip2)}">${escapeHtml(rail.label)} — ${escapeHtml(rail.caip2)}</option>`,
    )
    .join("\n");
  if (candidates.length === 0) {
    return `<h3>Post a round of bounties</h3>
    <p class="menu-desc">No ready doors on the latest round to offer — the list is built from the round's own rows, never from anything a seller nominated.</p>`;
  }
  const rows = candidates
    .map((candidate) => {
      const history =
        candidate.history.state === "never"
          ? "<strong>never walked</strong>"
          : candidate.history.state === "open"
            ? `open since ${escapeHtml((candidate.history.at ?? "").slice(0, 10))}`
            : candidate.history.state === "paid"
              ? `<strong style="color:#2f6b2f">walked and paid</strong> ${escapeHtml((candidate.history.at ?? "").slice(0, 10))}`
              : `expired unclaimed ${escapeHtml((candidate.history.at ?? "").slice(0, 10))}`;
      const price =
        candidate.min_usdc === undefined
          ? "<small>price not read</small>"
          : `$${candidate.min_usdc.toFixed(4)}`;
      return `<tr>
      <td><input type="checkbox" name="url" value="${escapeHtml(candidate.url)}"${candidate.blocked ? " disabled" : ""}></td>
      <td>${escapeHtml(candidate.domain)}<br><small>${escapeHtml(candidate.url.slice(0, 70))}</small></td>
      <td>${price}</td>
      <td>${history}</td>
      <td><small>${escapeHtml(candidate.blocked ?? "")}</small></td>
    </tr>`;
    })
    .join("\n");
  return `<h3>Post a round of bounties</h3>
  <form method="POST" action="/admin/bounties/batch">
    <table border="1" cellpadding="6">
      <tr><th>post</th><th>door</th><th>its cheapest ask, last round</th><th>what we have done here</th><th></th></tr>
      ${rows}
    </table>
    <p>
      <label>Reward each (USD, on top of each door's own price)<br>
        <input type="number" name="reward_usd" required min="0.01" max="0.25" step="0.01" value="${BOUNTY_BATCH_DEFAULT_REWARD.toFixed(2)}">
      </label>
    </p>
    <p>
      <label>Why these walks (optional — your words, shown verbatim on every bounty in this press)<br>
        <textarea name="note" rows="2" cols="60" maxlength="500"></textarea>
      </label>
    </p>
    <p>
      <label>How long each listing stands<br>
        <select name="tier">
          <option value="standard">standard — 7 days</option>
          <option value="sprint">sprint — 2 days (a live queue, not a shelf)</option>
          <option value="long">long — 21 days (wait for a DIFFERENT walker to find it)</option>
        </select>
      </label>
    </p>
    <p>
      <label>What we want observed at these doors (one a line, shown on every listing and at the claim door)<br>
        <textarea name="asks" rows="3" cols="60" placeholder="Did the paid response carry a PAYMENT-RESPONSE receipt?&#10;What did the goods actually contain — did they match what the door advertises?&#10;Send report.body_sha256 so a second walker can be held against you."></textarea>
      </label>
    </p>
    <p>
      <label>Capture which rail (optional)<br>
        <select name="rail">
          <option value="">whatever the door offers, Base first</option>
          ${railOptions}
        </select>
      </label>
      <small class="menu-meta">Named and not offered is a refusal, never a quiet Base row: a door that quotes Base and Arbitrum is captured as Base unless you say otherwise, which is why no bounty has ever been posted on a rail other than Base or Solana.</small>
    </p>
    <p>
      <label><input type="checkbox" name="distinct_payer" value="1"> <strong>Second walk</strong> — refuse a claim from a wallet already paid for walking this door. The only way the crowd stops being one wallet.</label>
    </p>
    <button type="submit"><strong>Post the checked doors</strong></button>
    <p class="menu-desc">Up to ${BOUNTY_BATCH_CAP} a press. Each door is knocked on one at a time and its live 402 becomes the terms of record; a door that refuses to be posted comes back with its reason beside it and takes nothing else down. The week's budget and the one-per-domain-per-week rule are enforced where they always were.</p>
  </form>`;
}

/**
 * THE BOUNTY DESK, on the market page because bounties ARE market
 * moves: every one points a paid walker at a door the census found.
 * Every-lever-states-its-condition (2026-07-30) applies: the form
 * ships with the dial beside it — payouts on or off, this week's
 * budget spent, and what is already posted — so posting is never a
 * button pressed blind. The notice line renders what the LAST post
 * actually did, because a redirect in silence reads exactly like a
 * form that did nothing.
 */
/**
 * WHAT THE KEEPER WOULD HAVE PRESSED, WRITTEN DOWN (2026-09-13, the
 * keeper: "i had thought we created a button to add new ones or is it
 * automatic").
 *
 * The standing order has run on the hourly tick since 2026-09-10 and
 * had no door on any page: it was settable only by hand-rolling a
 * POST at /admin/bounties/plan, which is why the honest answer to
 * "is it automatic" was "it could be, and isn't." A lever with no
 * handle is a lever nobody pulls.
 *
 * EVERY LEVER STATES ITS CONDITION (2026-07-30). The three facts that
 * decide whether next week posts anything are served beside the
 * dials, not left for the keeper to hold in his head: what this week
 * has already committed (open listings included — the reservation
 * that stops the board promising money it cannot pay), how many
 * listings that headroom actually affords at the reward being asked
 * for, and whether payouts are live at all. A plan set against a
 * paused wallet posts nothing and says so here rather than in a log.
 *
 * THE PLAN CHOOSES NO DOORS. It presses the button the keeper would
 * have pressed, over the same house-picked candidates from the same
 * census round, and it takes only never-walked ones. Nothing
 * self-nominates onto that list; the anti-farming design in
 * BOUNTY_BOARD.md is untouched by anything on this page.
 */
function standingOrderHtml(
  view: StandingOrderView | null,
  board: BoardState | null,
): string {
  if (!view) {
    return `<section>
    <h2>The standing order</h2>
    <p class="empty">The plan could not be read just now. It is still settable at POST /admin/bounties/plan; a plan already running is unaffected by this page failing to show it.</p>
  </section>`;
  }
  const { plan, committed, notice } = view;
  const running = plan !== null && plan.weeks_remaining > 0;
  /*
   * A RETIRED PLAN IS A ZEROED ONE, NOT AN ABSENT ONE. writeBountyPlan
   * stores `{weeks_remaining: 0, per_week: 0, reward_usd: 0}` where a
   * delete might be expected, and the pass reads that as "do nothing"
   * correctly. The form must not read its DIALS off it: a $0 reward
   * would render a box the browser refuses (min 0.01) and divide the
   * headroom by zero to offer the keeper an infinite number of
   * listings. The dials come from a plan that is actually running,
   * and otherwise from the same defaults a first-time press gets.
   */
  const dials = running ? plan : null;
  const railBoxes = bountyRails()
    .map((rail) => {
      const checked = dials?.rails.includes(rail.caip2) ? " checked" : "";
      return `<label style="display:inline-block;margin-right:1em"><input type="checkbox" name="rails" value="${escapeHtml(rail.caip2)}"${checked}> ${escapeHtml(rail.label)}</label>`;
    })
    .join("\n");
  const tierOption = (value: string, label: string): string =>
    `<option value="${value}"${dials?.tier === value ? " selected" : ""}>${escapeHtml(label)}</option>`;
  const reward = dials?.reward_usd ?? BOUNTY_BATCH_DEFAULT_REWARD;
  const affordable =
    committed && reward > 0 ? Math.floor(committed.headroom / reward) : null;
  const state = running
    ? `<p><strong style="font-size:1.1em">Running — ${plan.weeks_remaining} week${plan.weeks_remaining === 1 ? "" : "s"} left</strong>: ${plan.per_week} a week at $${plan.reward_usd.toFixed(2)}, ${escapeHtml(plan.tier)}${plan.rails.length > 0 ? ` on ${escapeHtml(plan.rails.join(", "))}` : ", whatever rail each door quotes first"}.${plan.last_week ? ` Last acted in ${escapeHtml(plan.last_week)}.` : " Has not acted yet."}</p>`
    : `<p><strong style="font-size:1.1em">No standing order.</strong> Every bounty on the board is one the keeper pressed by hand, and the week nobody presses, the board stands empty for the walkers who poll it.</p>`;
  /*
   * THE NUMBER THAT DECIDES NEXT WEEK, said before the dials rather
   * than after. `open` is the half a naive reading misses: the budget
   * is checked at CLAIM time, after a walker has already paid a door
   * out of their own wallet, so a listing this board cannot honour
   * does not overspend — it takes a stranger's money and refuses them.
   */
  const headroomLine = committed
    ? `<p class="menu-meta">This week: $${committed.spent.toFixed(2)} paid out, $${committed.open.toFixed(2)} still standing open against the $${BOUNTY_WEEKLY_BUDGET_USD.toFixed(2)} budget — <strong>$${committed.headroom.toFixed(2)} of headroom</strong>, which affords ${affordable} listing${affordable === 1 ? "" : "s"} at $${reward.toFixed(2)}. Open listings are reserved as well as spent ones: the budget is checked after a walker has already paid the door, so a listing the board cannot honour takes a stranger's money and refuses them.</p>`
    : `<p class="menu-meta">This week's headroom could not be read, so the figure that decides whether next week posts anything is missing. The plan checks it again itself when it runs.</p>`;
  const paused = board && !board.payouts_enabled
    ? `<p><strong>Payouts are PAUSED (no field wallet key).</strong> A plan set now keeps all its weeks and posts nothing until the wallet is back — a listing opened while payouts are off is a door a walker can pay and never be paid for.</p>`
    : "";
  const history = plan?.history?.length
    ? `<h3>What it has done</h3>
    <table border="1" cellpadding="6">
      <tr><th>week</th><th>posted</th><th>refused</th><th>what it decided</th></tr>
      ${plan.history
        .map(
          (row) => `<tr>
        <td>${escapeHtml(row.week)}</td>
        <td>${row.posted}</td>
        <td>${row.refused}</td>
        <td><small>${escapeHtml(row.note)}</small></td>
      </tr>`,
        )
        .join("\n")}
    </table>
    <p class="menu-desc">A week that posted nothing is not a week that failed — "the budget was already committed" and "every candidate refused" are both the plan working. The note says which.</p>`
    : "";
  return `<section>
    <h2>The standing order</h2>
    ${notice ? `<p><strong>${escapeHtml(notice)}</strong></p>` : ""}
    ${state}
    ${headroomLine}
    ${paused}
    <form method="POST" action="/admin/bounties/plan">
      <p>
        <label>Run for how many weeks (0 retires it)<br>
          <input type="number" name="weeks" required min="0" max="52" step="1" value="${running ? plan.weeks_remaining : 6}">
        </label>
      </p>
      <p>
        <label>How many listings a week<br>
          <input type="number" name="per_week" required min="1" max="10" step="1" value="${dials?.per_week ?? 4}">
        </label>
      </p>
      <p>
        <label>Reward each (USD, on top of each door's own price)<br>
          <input type="number" name="reward_usd" required min="0.01" max="${BOUNTY_MAX_REWARD_USD}" step="0.01" value="${reward.toFixed(2)}">
        </label>
      </p>
      <p>
        <label>How long each listing stands<br>
          <select name="tier">
            ${tierOption("standard", "standard — 7 days")}
            ${tierOption("sprint", "sprint — 2 days (a live queue, not a shelf)")}
            ${tierOption("long", "long — 21 days (wait for a DIFFERENT walker to find it)")}
          </select>
        </label>
      </p>
      <p>
        Rails to pin, cycled one per posting<br>
        ${railBoxes}<br>
        <small class="menu-meta">None checked means "whatever the door quotes first", which in practice is Base — so a plan that wants the other rails exercised has to say so. Each rail named is posted as its own small batch: a rail that refuses every door does not take the others down with it.</small>
      </p>
      <p>
        <label>Why these walks (optional — your words, carried verbatim onto every listing this plan opens)<br>
          <textarea name="note" rows="2" cols="60" maxlength="500">${escapeHtml(dials?.note ?? "")}</textarea>
        </label>
      </p>
      <p>
        <label>What we want observed (one a line, carried onto every listing)<br>
          <textarea name="asks" rows="3" cols="60">${escapeHtml((dials?.asks ?? []).join("\n"))}</textarea>
        </label>
      </p>
      <button type="submit"><strong>${running ? "Replace the standing order" : "Set the standing order"}</strong></button>
      <p class="menu-desc">Once per ISO week, on the first hourly tick after the week turns. It picks from the same house-picked candidates above, takes only doors this store has never walked, and stops early rather than post one listing the week cannot honour. It chooses no doors by any new rule and nothing self-nominates onto that list.</p>
    </form>
    ${
      running
        ? `<form method="POST" action="/admin/bounties/plan" style="margin-top:1em">
      <input type="hidden" name="weeks" value="0">
      <button type="submit">Retire it</button>
      <small class="menu-meta">Stops the posting. Listings already standing run their term and pay their claims as normal — retiring the plan is not a retraction of anything it opened.</small>
    </form>`
        : ""
    }
    ${history}
  </section>`;
}

function bountyDeskHtml(
  board: BoardState | null,
  notice: string | undefined,
  candidates: readonly BountyCandidate[],
): string {
  if (!board) {
    return `<section>
      <h2>The bounty desk</h2>
      <p class="empty">The board could not be read just now — post nothing until it can, or use the JSON door at POST /admin/bounties.</p>
    </section>`;
  }
  const open = board.bounties.filter((entry) => entry.status === "open");
  const rows = open
    .map(
      (entry) => `<tr>
      <td><code>${escapeHtml(entry.bounty_id)}</code></td>
      <td>${escapeHtml(entry.domain)}</td>
      <td>$${entry.amount_usd.toFixed(4)}</td>
      <td>$${entry.reward_usd.toFixed(2)}</td>
      <td>${escapeHtml(entry.expires_at.slice(0, 10))}</td>
    </tr>`,
    )
    .join("\n");
  return `<section>
    <h2>The bounty desk</h2>
    ${notice ? `<p><strong>${escapeHtml(notice)}</strong></p>` : ""}
    <p><strong style="font-size:1.1em">Payouts ${board.payouts_enabled ? "LIVE (field wallet key loaded)" : "PAUSED — no field wallet key; the board will refuse claims, do not post"}</strong> · week ${escapeHtml(board.week)}: $${board.spent_this_week_usd.toFixed(2)} of $${board.weekly_budget_usd.toFixed(2)} spent · ${open.length} open</p>
    ${
      open.length > 0
        ? `<table border="1" cellpadding="6">
      <tr><th>bounty</th><th>door</th><th>door price</th><th>reward</th><th>expires</th></tr>
      ${rows}
    </table>`
        : "<p class='menu-desc'>Nothing posted this week.</p>"
    }
    ${candidatesHtml(candidates)}
    <h3>Or post one door by hand</h3>
    <form method="POST" action="/admin/bounties">
      <p>
        <label>Door URL (the exact /api/... path a buyer pays)<br>
          <input type="url" name="url" required size="60" placeholder="https://their-door.example/api/thing">
        </label>
      </p>
      <p>
        <label>Why this walk (optional — your words, shown verbatim on the public board)<br>
          <textarea name="note" rows="2" cols="60" maxlength="500" placeholder="e.g. Biggest claimed volume on the registry — does it take a stranger's money?"></textarea>
        </label>
      </p>
      <p>
        <label>Reward (USD, on top of the door's price; cap enforced)<br>
          <input type="number" name="reward_usd" required min="0.01" max="0.25" step="0.01" value="0.10">
        </label>
      </p>
      <button type="submit">Post the bounty</button>
      <p class="menu-desc">Posting captures the door's live 402 terms as the terms of record. One bounty per domain per week; the board refuses past the weekly budget. The walk, the claim, and the payout all run themselves from here.</p>
    </form>
  </section>`;
}

/**
 * THE MARKET PAGE — the keeper's snapshot of what the numbers MEAN.
 *
 * The ward page answers "what happened on the round"; this page
 * answers "what is the market, and where is the gap". Every number
 * carries its reading in the same breath, because the request that
 * built this desk was explicit: not more data points — insight.
 * Readings live HERE, on the page, never in the stored aggregate
 * block: the arithmetic is chained history, the interpretation is
 * allowed to get smarter.
 */

function money(value: number): string {
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(value < 0.01 ? 4 : 3)}`;
}

/**
 * THE HIGH SHELF (keeper's ask, 2026-08-20: "list out things priced
 * over say $50 … to see if people pay for it and if I could do
 * something similar"). Row-level and NAMED, which is licensed HERE:
 * the consent ruling keeps rows on the private side, and this is the
 * private side. Two honesty notes carried in the section itself:
 * min-only rounds can only show doors whose CHEAPEST ask clears the
 * floor, and an ask is not a sale — the buy side stays invisible
 * until the payTo capture (also 08-20) gives the chain something to
 * answer with.
 */
function highShelfSection(round: WardRound): string {
  const shelf = highShelf(round);
  const minOnly = round.hosts.every(
    (host) => !host.offer || host.offer.max_usdc === undefined,
  );
  const rows = shelf.rows
    .map(
      (row) => `<tr>
      <td><a href="${escapeHtml(row.url)}" rel="noreferrer">${escapeHtml(row.host)}</a></td>
      <td>${escapeHtml(
        row.ask_min === row.ask_max
          ? money(row.ask_max)
          : `${money(row.ask_min)}–${money(row.ask_max)}`,
      )}</td>
      <td>${escapeHtml(row.verdict)}</td>
      <td>${escapeHtml(row.networks.join(", "))}</td>
    </tr>`,
    )
    .join("\n");
  return `<section>
    <h2>The high shelf — asks at $${HIGH_SHELF_FLOOR_USDC}+</h2>
    ${
      shelf.rows.length > 0
        ? `<table border="1" cellpadding="6">
      <tr><th>door</th><th>USDC ask</th><th>verdict</th><th>rails</th></tr>
      ${rows}
    </table>${shelf.truncated ? `<p class="menu-meta">list capped; more above the floor exist.</p>` : ""}`
        : `<p class="menu-desc">No door in this round quotes ${minOnly ? "a cheapest ask" : "any ask"} at $${HIGH_SHELF_FLOOR_USDC} or more.</p>`
    }
    <p class="menu-meta">${
      minOnly
        ? `This round captured only each door's CHEAPEST ask, so a door selling a $500 item behind a $1 item is invisible here — the max-ask capture shipped 2026-08-20 and the next walked round lists the true top of the market.`
        : `Asks read from each door's own 402; range shown where the door quotes more than one USDC price.`
    } An ask is not a sale: nothing here says anyone PAYS these prices. The payTo capture (2026-08-20) is the path to that answer — USDC inflows to a door's published payTo are checkable on chain, and that reader is the next build once a walked round carries the addresses.</p>
  </section>`;
}

function section(title: string, headline: string, reading: string): string {
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <p><strong style="font-size:1.3em">${escapeHtml(headline)}</strong></p>
    <p class="menu-desc">${escapeHtml(reading)}</p>
  </section>`;
}

export function renderMarketPage(
  round: WardRound,
  market: MarketAggregates,
  board: BoardState | null = null,
  bountyNotice: string | undefined = undefined,
  /** The week's ready doors with this store's own history beside each. */
  candidates: readonly BountyCandidate[] = [],
  /** The standing order and the headroom that decides whether it posts. */
  standing: StandingOrderView | null = null,
): string {
  const so = market.signed_offers;
  const rails = market.rails;
  const price = market.price_usdc;
  const conc = market.concentration;

  /*
   * SAID IN THE SCOPE IT WAS MEASURED (2026-08-27, the keeper's
   * catch; 2026-08-28, the fix). This section published "0% of ready
   * doors serve signed offers" as an ecosystem fact off a read that
   * (a) opened only the challenge header while the offer-receipt
   * convention places offers in the 402 body, (b) covered one
   * registry's listings, and (c) excluded our own offer-serving door
   * without saying so. The read is fixed at the probe (both
   * placements, `so.basis` says which era measured a stored week),
   * and the words now carry the denominator's edges with them.
   */
  const basisNote = so.basis
    ? "Both offer placements read (header and body)."
    : "HEADER-ONLY ERA: this week's read never opened the 402 body placement — treat the count as a floor.";
  const signedOffersSection = section(
    "The trust gap — the probed slice, not the ecosystem",
    so.of_ready > 0
      ? `${so.pct}% of ready probed doors serve signed offers, structurally valid JWS (${so.serving} of ${so.of_ready})`
      : "no ready doors measured yet",
    so.of_ready > 0 && so.pct < 10
      ? `The market thesis, in the scope actually measured: among the ${so.of_ready} shape-ready doors this round probed (one registry's listings, our own door structurally excluded — a Worker cannot probe itself), ${so.of_ready - so.serving} quote prices with no signed commitment a third party could hold them to. ${basisNote} Signatures are never verified by the census. When this number rises, the market is maturing INTO our category; if it rises without us, competitors are doing the maturing.`
      : `The share of ready probed doors serving structurally valid signed offers (${basisNote} signatures not verified; our own door excluded). Watch the direction more than the level: rising means the trust layer is becoming table stakes.`,
  );

  const rotSection = section(
    "Registry rot",
    `${market.rot.pct}% of probed doors answer no 402 at all (${market.rot.dead_doors} of ${market.probed})`,
    `These hosts are LISTED as x402 endpoints and functionally absent — wrong status, no challenge header, or dead. Two meanings at once: every directory quoting raw listing counts overstates the market by roughly this factor (deflate outside claims accordingly), and every rotting door is an outreach lead — an operator who cared enough to list and hasn't noticed they broke.`,
  );

  const railsSection = section(
    "Rails — who takes what",
    rails.of > 0
      ? `of ${rails.of} parseable doors: ${rails.base} take Base, ${rails.polygon} Polygon, ${rails.solana} Solana (a door can take more than one); ${rails.multi} take several, ${rails.single} exactly one, ${rails.other} none of the three`
      : "no offer facts captured yet — the next walked round fills this in",
    rails.of > 0
      ? `A single-rail door turns away every buyer holding the other rails' USDC. Those ${rails.single} are addressable demand for a multi-rail seller (this store included), and the ${rails.testnet_flagged} testnet-flagged doors are the classic silent failure — working against test tooling, invisible to every mainnet wallet.`
      : `The probe started keeping each door's offered rails on 2026-08-19; rounds before that carry verdicts only.`,
  );

  const priceSection = section(
    "The price map (USDC-priced doors)",
    price
      ? `median ask ${money(price.median)} · middle half ${money(price.p25)}–${money(price.p75)} · range ${money(price.min)}–${money(price.max)} (${price.sample} doors)`
      : "no USDC prices captured yet — fills in with the next walked round",
    price
      ? `Where the market prices itself. Below the 25th percentile is commodity territory (price wars, no moat); the thin top end is where judgment and verification live. Whitespace reading: gaps between the quartiles are price points with little competition — and anything we sell below the median is cheap by the market's own standard, not ours.`
      : `Same capture date as rails: the desk keeps the cheapest USDC ask each door quotes, read from the 402 the probe already fetched.`,
  );

  const topList = conc.top
    .map((entry) => `${entry.operator} (${entry.hosts})`)
    .join(", ");
  const concSection = section(
    "Seller concentration",
    `${conc.hosts} hosts collapse to ${conc.operators} operators; the top 5 hold ${conc.top5_share_pct}% of probed hosts`,
    `Hosts are not sellers: subdomain farms inflate every raw count (top 5: ${topList}). Deflate directory sizes and "endpoints" claims by this ratio before believing them. Grouping is a named heuristic — registrable domain, except on shared platforms (workers.dev and kin) where the deploying subdomain is the operator.`,
  );

  const schemes = Object.entries(market.schemes)
    .sort((a, b) => b[1] - a[1])
    .map(([scheme, count]) => `<code>${escapeHtml(scheme)}</code> ×${count}`)
    .join(" · ");

  const fieldsSection = market.discovery_fields_seen
    ? `<section><h2>The feed's own shape</h2>
       <p class="menu-desc">Metadata fields the discovery rows actually carry: ${market.discovery_fields_seen.map((field) => `<code>${escapeHtml(field)}</code>`).join(", ")}. Whatever category or description mining comes next starts from this list, not from guessing.</p>
       </section>`
    : "";

  const body = `
  <h1>The market — what the round's numbers mean</h1>
  <p class="menu-desc">Derived entirely from round <strong>${escapeHtml(round.week)}</strong>
  (${escapeHtml(round.at.slice(0, 16))}Z): ${market.probed} doors probed, ${market.ready} ready.
  Zero extra contact — every fact here was already in the responses the
  round fetched; this desk just stopped throwing them away. Aggregates
  only, per the consent ruling: numbers about the neighbourhood, never
  rows about a neighbour.</p>

  ${signedOffersSection}
  ${rotSection}
  ${railsSection}
  ${priceSection}
  ${highShelfSection(round)}
  ${concSection}
  ${schemes ? `<section><h2>Schemes offered</h2><p class="menu-desc">${schemes}</p></section>` : ""}
  ${fieldsSection}

  ${bountyDeskHtml(board, bountyNotice, candidates)}

  ${standingOrderHtml(standing, board)}

  <section>
    <h2>Publish to the public tally</h2>
    <p class="menu-desc">The public page at <a href="/registry">/registry</a>
    carries these numbers as a running weekly tally — aggregates only, the
    named top list stripped before storage. Nothing lands there on the clock;
    this press is the week's publication (rule 30). Re-pressing replaces this
    week's row.</p>
    <form method="post" action="/admin/market/publish-registry">
      <button type="submit">Publish ${escapeHtml(round.week)} to /registry</button>
    </form>
  </section>

  <section>
    <h2>What this cannot see</h2>
    <ul>
      <li>The BUY side. Every number here is about sellers; what agents actually purchase is invisible to a probe.</li>
      <li>Delivery quality. A parseable 402 says nothing about whether paying it gets you goods — testing that means spending (the settlement-attempt lane, keeper's ruling pending).</li>
      <li>Anything about rounds before 2026-08-19's capture: older rounds carry verdicts, not offers, so rails and prices read "not captured" there honestly.</li>
    </ul>
  </section>`;

  return renderAdminShell("market", body);
}

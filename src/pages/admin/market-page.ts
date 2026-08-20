import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import {
  HIGH_SHELF_FLOOR_USDC,
  highShelf,
  type MarketAggregates,
} from "@/services/market";
import type { bountyBoard } from "@/services/bounty-board";
import type { WardRound } from "@/services/ward-round";

type BoardState = Awaited<ReturnType<typeof bountyBoard>>;

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
function bountyDeskHtml(
  board: BoardState | null,
  notice: string | undefined,
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
    <form method="POST" action="/admin/bounties">
      <p>
        <label>Door URL (the exact /api/... path a buyer pays)<br>
          <input type="url" name="url" required size="60" placeholder="https://their-door.example/api/thing">
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
): string {
  const so = market.signed_offers;
  const rails = market.rails;
  const price = market.price_usdc;
  const conc = market.concentration;

  const signedOffersSection = section(
    "The trust gap — the store's measured TAM",
    so.of_ready > 0
      ? `${so.pct}% of ready doors serve signed offers (${so.serving} of ${so.of_ready})`
      : "no ready doors measured yet",
    so.of_ready > 0 && so.pct < 10
      ? `This is the market thesis as a measured fact: nearly the whole ecosystem quotes prices with nothing a third party can verify. Every one of the ${so.of_ready - so.serving} unsigned doors is a seller whose buyers must take their word — which is precisely what this store sells the antidote to. When this number rises, the market is maturing INTO our category; if it rises without us, competitors are doing the maturing.`
      : `The share of the ecosystem serving verifiable offers. Watch the direction more than the level: rising means the trust layer is becoming table stakes.`,
  );

  const rotSection = section(
    "Registry rot",
    `${market.rot.pct}% of listed doors answer no 402 at all (${market.rot.dead_doors} of ${market.probed})`,
    `These hosts are LISTED as x402 endpoints and functionally absent — wrong status, no challenge header, or dead. Two meanings at once: every directory quoting raw listing counts overstates the market by roughly this factor (deflate outside claims accordingly), and every rotting door is an outreach lead — an operator who cared enough to list and hasn't noticed they broke.`,
  );

  const railsSection = section(
    "Rails — who takes what",
    rails.of > 0
      ? `of ${rails.of} parseable doors: ${rails.both} take both rails, ${rails.base_only} Base-only, ${rails.solana_only} Solana-only, ${rails.other_only} neither mainnet`
      : "no offer facts captured yet — the next walked round fills this in",
    rails.of > 0
      ? `A Base-only door turns away every Solana-holding buyer and vice versa. The single-rail share is addressable demand for dual-rail sellers (this store included), and the ${rails.testnet_flagged} testnet-flagged doors are the classic silent failure — working against test tooling, invisible to every mainnet wallet.`
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

  ${bountyDeskHtml(board, bountyNotice)}

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

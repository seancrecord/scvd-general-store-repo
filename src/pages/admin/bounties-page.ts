import { escapeHtml } from "@/lib/sanitize";
import type { BountyLedger, MetricEvent } from "@/lib/metrics";
import type { bountyBoard, PayoutRedemption } from "@/services/bounty-board";
import type { FieldWalletReading } from "@/services/field-wallet";
import { renderAdminShell } from "@/pages/admin/layout";

/**
 * THE BOUNTY BOARD, FROM THE KEEPER'S SIDE (2026-09-04).
 *
 * Money in has had a desk since July: every 402, settle and decline
 * in rows, the payers on file, the take. Money OUT — the one door
 * where this store pays strangers — had a posting form on the market
 * page and nothing else. A claim that paid changed a record in KV; a
 * claim that was refused left its 400 and vanished. The sanctions
 * screen refused every walker for ninety minutes on 2026-09-03 and
 * the first the keeper heard of it was a letter.
 *
 * So: the paying wallet's balance read off the chain, the week's
 * budget against it, every bounty with its claim, and every claim
 * PRESENTED — paid, refused, or errored — newest first, same shape as
 * the decline desk. The board's rules and the payouts are unchanged;
 * this page only reads.
 */

type BoardState = Awaited<ReturnType<typeof bountyBoard>>;
type Redemptions = Readonly<Record<string, PayoutRedemption>>;

/**
 * THE BOARD'S OWN FUNNEL, this month, organic: the room read, the JSON
 * board polled, the claim instructions read, a claim presented. From
 * the porch surfaces the board got on 2026-09-04; null when the porch
 * did not load.
 */
export interface BountyFunnel {
  room: number;
  board_json: number;
  claim_read: number;
  claims_presented: number;
}

/**
 * ALL-TIME MONEY OUT, the take's mirror: what the board has paid since
 * it opened, to how many distinct wallets, and what the store still
 * owes in credit — the liability the books invariants watch.
 */
export interface MoneyOutAllTime {
  paid_bounties: number;
  paid_usd: number;
  /** Distinct payout addresses ever paid. */
  walkers: number;
  /** Distinct paying wallets that walked a door for a bounty. */
  walker_payers: number;
  /** Store credit outstanding, in USD — owed, not yet cashed out. */
  credit_owed_usd: number | null;
}

/** One regular's credit, as the credit desk keeps it. */
export interface CreditHolder {
  wallet: string;
  balance_usd: number;
  earned_usd: number;
  redeemed_usd: number;
  expired_usd: number;
  updated_at: string;
}

export interface BountiesPageData {
  board: BoardState | null;
  wallet: FieldWalletReading | null;
  ledger: BountyLedger | null;
  attempts: MetricEvent[];
  funnel?: BountyFunnel | null;
  allTime?: MoneyOutAllTime | null;
  /** Who holds store credit, largest balance first; null when unread. */
  creditHolders?: CreditHolder[] | null;
  /** Per paid bounty: whether the chain has seen the payout burn. */
  redemptions?: Redemptions | null;
  /** ISO, the moment the page was read; outstanding payouts are judged against it. */
  now: string;
  loadNotes: string[];
}

/** The take's mirror, off the board's own records (bounded by the board's scan cap). */
export function moneyOutAllTime(
  board: BoardState | null,
  creditOwedAtomic: bigint | null,
): MoneyOutAllTime | null {
  if (!board) return null;
  const paid = board.bounties.filter((bounty) => bounty.status === "paid");
  const payoutTo = new Set(paid.map((bounty) => bounty.claim?.payout_to ?? ""));
  const payers = new Set(paid.map((bounty) => bounty.claim?.payer ?? ""));
  payoutTo.delete("");
  payers.delete("");
  return {
    paid_bounties: paid.length,
    paid_usd: Math.round(paid.reduce((sum, bounty) => sum + bounty.reward_usd, 0) * 100) / 100,
    walkers: payoutTo.size,
    walker_payers: payers.size,
    credit_owed_usd:
      creditOwedAtomic === null ? null : Number(creditOwedAtomic) / 1e6,
  };
}

function funnelHtml(funnel: BountyFunnel | null | undefined): string {
  if (!funnel) {
    return "<p>The porch did not load; the board's readers are unknown here, not zero.</p>";
  }
  const rate = (from: number, to: number): string =>
    from > 0 ? `${Math.round((to / from) * 100)}%` : "—";
  return `<table>
    <tr><th>step</th><th>organic this month</th><th>of the step before</th></tr>
    <tr><td>read the room (/bounties)</td><td>${funnel.room}</td><td>—</td></tr>
    <tr><td>polled the board (/api/bounties)</td><td>${funnel.board_json}</td><td>${rate(funnel.room, funnel.board_json)}</td></tr>
    <tr><td>read the claim instructions</td><td>${funnel.claim_read}</td><td>${rate(funnel.board_json, funnel.claim_read)}</td></tr>
    <tr><td>presented a claim</td><td>${funnel.claims_presented}</td><td>${rate(funnel.board_json, funnel.claims_presented)}</td></tr>
  </table>
  <p><small>Porch rows, organic only, counted from the day the board got its lines. A poller on a loop inflates the middle rows; the last row is the one that costs a walker money, and it is the honest one.</small></p>`;
}

/**
 * WHO IS OWED (2026-09-04, the keeper: "how does the store credit get
 * paid? I never saw a purchase for it"). Credit is not bought. Every
 * organic purchase banks a fixed share of its price to the PAYING
 * wallet, and the wallet cashes it out at the credit desk once it
 * passes the floor — a signed authorization from the field wallet,
 * same as a bounty reward. House wallets never accrue, so a balance
 * here is a stranger's by construction.
 */
function creditHoldersHtml(holders: CreditHolder[] | null | undefined): string {
  if (!holders) {
    return "<p>The credit ledger did not load; nothing here is zero.</p>";
  }
  if (holders.length === 0) {
    return "<p>Nobody holds store credit. It accrues from organic purchases only.</p>";
  }
  const rows = holders
    .map(
      (holder) => `<tr>
      <td><code>${escapeHtml(holder.wallet)}</code></td>
      <td>$${holder.balance_usd.toFixed(4)}</td>
      <td>$${holder.earned_usd.toFixed(4)}</td>
      <td>$${holder.redeemed_usd.toFixed(4)}</td>
      <td>$${holder.expired_usd.toFixed(4)}</td>
      <td>${escapeHtml(holder.updated_at.slice(0, 10))}</td>
    </tr>`,
    )
    .join("\n");
  return `<table>
    <tr><th>wallet</th><th>balance</th><th>earned</th><th>cashed out</th><th>expired</th><th>last moved</th></tr>
    ${rows}
  </table>
  <p><small>Credit is the rebate, not a purchase: a fixed share of every organic sale, banked to the wallet that paid, cashed out at <code>/api/credit/redeem</code> as a signed authorization once the balance passes the floor. A balance that sits idle long enough expires back to the store. <a href="/credit">The credit desk</a> states the dials.</small></p>`;
}

function allTimeHtml(allTime: MoneyOutAllTime | null | undefined): string {
  if (!allTime) {
    return "<p>The board did not load; nothing here is zero.</p>";
  }
  const credit =
    allTime.credit_owed_usd === null
      ? "credit owed: not read"
      : `<strong>$${allTime.credit_owed_usd.toFixed(2)}</strong> in store credit still owed to regulars`;
  return `<p><strong>$${allTime.paid_usd.toFixed(2)}</strong> paid across
    <strong>${allTime.paid_bounties}</strong> bount${allTime.paid_bounties === 1 ? "y" : "ies"} to
    <strong>${allTime.walkers}</strong> distinct payout wallet${allTime.walkers === 1 ? "" : "s"}
    <small>(${allTime.walker_payers} distinct paying wallet${allTime.walker_payers === 1 ? "" : "s"} walked the doors)</small> ·
    ${credit}.
    <small>Paid means a signed authorization went out. Whether each was redeemed is read off the chain in the board table below, and the wallet line above counts only the ones not yet redeemed.</small></p>`;
}

/**
 * Signed payouts a recipient can still turn into money: paid, inside
 * validBefore, and not seen burning on chain. A redemption the chain
 * confirmed is money gone, not money promised; one the chain could
 * not be asked about stays counted, the cautious direction.
 */
export function outstandingPayouts(
  board: BoardState | null,
  nowIso: string,
  redemptions: Redemptions | null | undefined = null,
): { count: number; usd: number } {
  if (!board) return { count: 0, usd: 0 };
  const nowSeconds = Math.floor(new Date(nowIso).getTime() / 1000);
  let count = 0;
  let usd = 0;
  for (const bounty of board.bounties) {
    const validBefore = Number(bounty.claim?.authorization_valid_before ?? "0");
    if (
      bounty.status === "paid" &&
      validBefore > nowSeconds &&
      redemptions?.[bounty.bounty_id]?.state !== "redeemed"
    ) {
      count += 1;
      usd += bounty.reward_usd;
    }
  }
  return { count, usd: Math.round(usd * 100) / 100 };
}

/** The claim's fate on chain, in words, for the board table. */
function redemptionHtml(
  bounty: BoardState["bounties"][number],
  redemptions: Redemptions | null | undefined,
  nowIso: string,
): string {
  const reading = redemptions?.[bounty.bounty_id];
  const validBefore = Number(bounty.claim?.authorization_valid_before ?? "0");
  const expired = validBefore <= Math.floor(new Date(nowIso).getTime() / 1000);
  if (!reading) {
    return "<small>redemption not checked</small>";
  }
  if (reading.state === "redeemed") {
    return `<strong style="color:#2f6b2f">redeemed on chain</strong> <small>tx <code>${escapeHtml(reading.tx_hash.slice(0, 18))}…</code></small>`;
  }
  if (reading.state === "unknown") {
    return `<small>redemption unknown (${escapeHtml(reading.problem)})</small>`;
  }
  return expired
    ? `<strong>expired unredeemed</strong> <small>— the budget takes it back; nothing is owed</small>`
    : `<strong style="color:#8c2f1b">not yet redeemed</strong> <small>— the walker has not submitted it; valid until unix ${escapeHtml(String(validBefore))}</small>`;
}

function bucket(event: MetricEvent): string {
  if (event.house) return "house";
  if (event.channel === "infrastructure") return "infrastructure";
  return "organic";
}

function walletHtml(wallet: FieldWalletReading | null, outstanding: { count: number; usd: number }): string {
  if (!wallet) {
    return "<p>The wallet reading did not load; nothing here is zero. Reload to retry.</p>";
  }
  if (!wallet.provisioned || !wallet.address) {
    return `<p><strong>No paying wallet on this deployment.</strong> ${escapeHtml(wallet.problem ?? "")}</p>`;
  }
  const balance =
    wallet.usdc === null
      ? `<strong>not read</strong> <small>(${escapeHtml(wallet.problem ?? "no reason recorded")})</small>`
      : `<strong>$${wallet.usdc.toFixed(2)} USDC</strong> on Base`;
  const cover =
    wallet.usdc === null
      ? ""
      : outstanding.usd > wallet.usdc
        ? `<p><strong style="color:#8c2f1b">Short.</strong> $${outstanding.usd.toFixed(2)} in signed payouts is not yet redeemed against a $${wallet.usdc.toFixed(2)} balance. An authorization is only worth what the wallet holds when it is redeemed; the USDC contract, not this store, refuses the rest.</p>`
        : `<p>Covers the $${outstanding.usd.toFixed(2)} in signed payouts not yet redeemed (${outstanding.count}). Redeemed ones are money gone and are not counted here.</p>`;
  return `
    <p><code>${escapeHtml(wallet.address)}</code> holds ${balance}
    <small>(read ${escapeHtml(wallet.read_at)}, straight off the chain — nothing cached).
    <a href="https://basescan.org/address/${escapeHtml(wallet.address)}">On Basescan.</a></small></p>
    ${cover}`;
}

function budgetHtml(board: BoardState | null): string {
  if (!board) {
    return "<p>The board did not load; the budget is unknown here, not spent.</p>";
  }
  const remaining = Math.max(0, board.weekly_budget_usd - board.spent_this_week_usd);
  return `<p><strong>Week ${escapeHtml(board.week)}:</strong> $${board.spent_this_week_usd.toFixed(2)} of $${board.weekly_budget_usd.toFixed(2)} spent, $${remaining.toFixed(2)} left ·
    <strong>${board.open_count}</strong> open bount${board.open_count === 1 ? "y" : "ies"} ·
    payouts ${board.payouts_enabled ? "enabled" : "<strong>disabled</strong> (no field wallet key)"}.
    <small>Post a bounty from <a href="/admin/market">the market</a>; the public board is <a href="/bounties">/bounties</a>.</small></p>`;
}

function boardHtml(
  board: BoardState | null,
  redemptions: Redemptions | null | undefined,
  nowIso: string,
): string {
  if (!board) {
    return "<p>The board did not load.</p>";
  }
  if (board.bounties.length === 0) {
    return "<p>No bounties have ever been posted.</p>";
  }
  const rows = board.bounties
    .map((bounty) => {
      const claim = bounty.claim;
      const claimCell = claim
        ? `signed ${escapeHtml(claim.claimed_at.slice(0, 16))}<br>
           payer <code>${escapeHtml(claim.payer)}</code><br>
           to <code>${escapeHtml(claim.payout_to)}</code><br>
           their settlement <code>${escapeHtml(claim.tx_hash.slice(0, 18))}…</code><br>
           ${redemptionHtml(bounty, redemptions, nowIso)}${
             claim.house_probe
               ? `<br><small>our own knock at claim time: <strong>${escapeHtml(claim.house_probe.verdict)}</strong>${claim.house_probe.failed.length ? ` (${escapeHtml(claim.house_probe.failed.join(", "))})` : ""}</small>`
               : ""
           }${
             claim.observation
               ? `<br><details><summary><small>their observation, ${claim.observation.length} characters — a claim, unverified</small></summary><pre style="white-space:pre-wrap;max-width:60ch">${escapeHtml(claim.observation)}</pre></details>`
               : ""
           }`
        : "—";
      return `<tr>
        <td><code>${escapeHtml(bounty.bounty_id)}</code></td>
        <td>${escapeHtml(bounty.domain)}<br><small>${escapeHtml(bounty.network ?? "eip155:8453")}</small></td>
        <td>${escapeHtml(bounty.status)}</td>
        <td>$${bounty.amount_usd.toFixed(3)}</td>
        <td>$${bounty.reward_usd.toFixed(2)}</td>
        <td>${escapeHtml(bounty.opened_at.slice(0, 10))}<br><small>expires ${escapeHtml(bounty.expires_at.slice(0, 10))}</small></td>
        <td>${claimCell}</td>
      </tr>`;
    })
    .join("\n");
  return `<table>
    <tr><th>bounty</th><th>door</th><th>status</th><th>door price</th><th>reward</th><th>opened</th><th>claim</th></tr>
    ${rows}
  </table>`;
}

function ledgerHtml(ledger: BountyLedger | null): string {
  if (!ledger) {
    return "<p>The month's counters did not load.</p>";
  }
  const cell = (organic: number, house: number): string =>
    `${organic}${house ? ` <small>(+${house}h)</small>` : ""}`;
  return `<p><strong>${escapeHtml(ledger.month)}:</strong>
    ${cell(ledger.paid, ledger.paidHouse)} paid ·
    ${cell(ledger.refused, ledger.refusedHouse)} refused ·
    ${cell(ledger.errors, ledger.errorsHouse)} errored.
    <small>Organic first, house in brackets, like every counter on the desk. Counted from this page's own deploy.</small></p>`;
}

function attemptsHtml(attempts: MetricEvent[]): string {
  if (attempts.length === 0) {
    return "<p>No claim has been presented since this ledger opened. Claims before it left no row.</p>";
  }
  const rows = attempts
    .map((event) => {
      const [outcome, ...rest] = (event.note ?? "").split(": ");
      const reason = rest.join(": ");
      const colour =
        outcome === "paid" ? "#2f6b2f" : outcome === "error" ? "#8c2f1b" : "inherit";
      return `<tr>
        <td>${escapeHtml(event.at)}</td>
        <td><code>${escapeHtml(event.item.replace(/^bounty:/, ""))}</code></td>
        <td><strong style="color:${colour}">${escapeHtml(outcome ?? "")}</strong></td>
        <td>${escapeHtml(reason)}</td>
        <td>${escapeHtml(bucket(event))} / ${escapeHtml(event.channel)}</td>
        <td>${event.user_agent ? escapeHtml(event.user_agent) : "—"}</td>
      </tr>`;
    })
    .join("\n");
  return `<table>
    <tr><th>when</th><th>bounty</th><th>outcome</th><th>reason</th><th>bucket / channel</th><th>user agent</th></tr>
    ${rows}
  </table>`;
}

export function renderBountiesPage(data: BountiesPageData): string {
  const outstanding = outstandingPayouts(data.board, data.now, data.redemptions);
  const body = `
  <section>
    <h2>The paying wallet</h2>
    <p><small>Every payout this store makes — bounty rewards, credit
    cash-outs, the launch check's purchase — is a signed authorization
    from this wallet, redeemed by the recipient against the USDC
    contract. The balance is the chain's answer at the moment you
    opened this page.</small></p>
    ${walletHtml(data.wallet, outstanding)}
  </section>

  <section>
    <h2>The week's budget</h2>
    ${budgetHtml(data.board)}
  </section>

  <section>
    <h2>Money out, all-time</h2>
    <p><small>The take's mirror: what the board has paid since it opened, and what the store still owes.</small></p>
    ${allTimeHtml(data.allTime)}
  </section>

  <section>
    <h2>The board's own funnel, ${escapeHtml(data.now.slice(0, 7))}</h2>
    ${funnelHtml(data.funnel)}
  </section>

  <section>
    <h2>Store credit, by wallet</h2>
    ${creditHoldersHtml(data.creditHolders)}
  </section>

  <section>
    <h2>Claims presented, newest first</h2>
    <p>Every POST to /api/bounty-claim, whichever way it went — the
    money-out counterpart of <a href="/admin/declines">the decline
    desk</a>. A run of refusals reading "the sanctions screen did not
    answer" is the store's problem, not the walkers'; a refusal naming
    the settlement is theirs.</p>
    ${ledgerHtml(data.ledger)}
    ${attemptsHtml(data.attempts)}
  </section>

  <section>
    <h2>The board, every bounty</h2>
    <p><small>A shopper's observation is their claim, recorded verbatim
    and never verified by this store. "Signed" is what this store did;
    "redeemed" is what the chain says the walker did with it.</small></p>
    ${boardHtml(data.board, data.redemptions, data.now)}
  </section>`;
  return renderAdminShell("bounties", body, data.loadNotes);
}

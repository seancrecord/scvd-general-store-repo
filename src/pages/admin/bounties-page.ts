import { escapeHtml } from "@/lib/sanitize";
import type { BountyLedger, MetricEvent } from "@/lib/metrics";
import type { bountyBoard } from "@/services/bounty-board";
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

export interface BountiesPageData {
  board: BoardState | null;
  wallet: FieldWalletReading | null;
  ledger: BountyLedger | null;
  attempts: MetricEvent[];
  /** ISO, the moment the page was read; outstanding payouts are judged against it. */
  now: string;
  loadNotes: string[];
}

/** Signed payouts a recipient can still redeem: paid, and not yet past validBefore. */
export function outstandingPayouts(
  board: BoardState | null,
  nowIso: string,
): { count: number; usd: number } {
  if (!board) return { count: 0, usd: 0 };
  const nowSeconds = Math.floor(new Date(nowIso).getTime() / 1000);
  let count = 0;
  let usd = 0;
  for (const bounty of board.bounties) {
    const validBefore = Number(bounty.claim?.authorization_valid_before ?? "0");
    if (bounty.status === "paid" && validBefore > nowSeconds) {
      count += 1;
      usd += bounty.reward_usd;
    }
  }
  return { count, usd: Math.round(usd * 100) / 100 };
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
        ? `<p><strong style="color:#8c2f1b">Short.</strong> $${outstanding.usd.toFixed(2)} in signed payouts is still redeemable against a $${wallet.usdc.toFixed(2)} balance. An authorization is only worth what the wallet holds when it is redeemed; the USDC contract, not this store, refuses the rest.</p>`
        : `<p>Covers the $${outstanding.usd.toFixed(2)} in signed payouts still redeemable (${outstanding.count}).</p>`;
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

function boardHtml(board: BoardState | null): string {
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
        ? `paid ${escapeHtml(claim.claimed_at.slice(0, 16))}<br>
           payer <code>${escapeHtml(claim.payer)}</code><br>
           to <code>${escapeHtml(claim.payout_to)}</code><br>
           tx <code>${escapeHtml(claim.tx_hash.slice(0, 18))}…</code><br>
           redeemable until unix ${escapeHtml(claim.authorization_valid_before)}${
             claim.observation
               ? `<br><small>observation (their claim, unverified): ${escapeHtml(claim.observation.slice(0, 160))}${claim.observation.length > 160 ? "…" : ""}</small>`
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
  const outstanding = outstandingPayouts(data.board, data.now);
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
    and never verified by this store.</small></p>
    ${boardHtml(data.board)}
  </section>`;
  return renderAdminShell("bounties", body, data.loadNotes);
}

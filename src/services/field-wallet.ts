import { sendAlert } from "@/lib/alerts";
import { usdcBalanceOf } from "@/lib/base-rpc";
import { fieldSignerFromKey } from "@/services/launch-check";
import type { Env } from "@/types";

/**
 * THE PAYING WALLET, READ OFF THE CHAIN (2026-09-04).
 *
 * Every payout this store makes — bounty rewards, credit cash-outs,
 * the launch check's purchase — is a signed EIP-3009 authorization
 * from the field wallet, redeemed by the recipient against the USDC
 * contract. An authorization is only worth what the wallet holds when
 * it is redeemed, and until today the only way to know what it held
 * was to open a block explorer. The keeper asked for the number on
 * the desk; this is the one read that puts it there.
 *
 * READ, NEVER CACHED HERE: the balance is the chain's fact at the
 * moment of the call, stamped with when. A reading that could not be
 * taken says so in `problem` and leaves `usdc` null — never zero.
 */
export interface FieldWalletReading {
  /** False when FIELD_WALLET_KEY is unset: the board is read-only. */
  provisioned: boolean;
  address: string | null;
  /** USDC on Base, or null when the read did not happen. */
  usdc: number | null;
  chain: "eip155:8453";
  read_at: string;
  /** Why `usdc` is null, in words. Absent when it was read. */
  problem?: string;
}

export async function readFieldWallet(env: Env): Promise<FieldWalletReading> {
  const read_at = new Date().toISOString();
  const chain = "eip155:8453" as const;
  if (!env.FIELD_WALLET_KEY) {
    return {
      provisioned: false,
      address: null,
      usdc: null,
      chain,
      read_at,
      problem:
        "FIELD_WALLET_KEY is not set on this deployment, so there is no paying wallet: the bounty board is read-only and no claim can pay.",
    };
  }
  let address: string;
  try {
    address = (await fieldSignerFromKey(env.FIELD_WALLET_KEY)).address;
  } catch {
    return {
      provisioned: true,
      address: null,
      usdc: null,
      chain,
      read_at,
      problem: "FIELD_WALLET_KEY is set but did not parse as a secp256k1 key; nothing can sign a payout.",
    };
  }
  try {
    const atomic = await usdcBalanceOf(env, address);
    return {
      provisioned: true,
      address,
      usdc: Number(atomic) / 1e6,
      chain,
      read_at,
    };
  } catch (error) {
    // rpc() names hosts only in its message; a key never rides here.
    return {
      provisioned: true,
      address,
      usdc: null,
      chain,
      read_at,
      problem: `the balance could not be read just now: ${String(error instanceof Error ? error.message : error).slice(0, 200)}`,
    };
  }
}

/**
 * THE HOURLY COVER CHECK (2026-09-04, the keeper: "where would I see
 * money short — or a constant check if possible").
 *
 * Every payout this store makes is a signed authorization the
 * recipient redeems LATER, against whatever the wallet holds at that
 * moment. So the number that matters is not the balance; it is the
 * balance against what has been promised: bounty authorizations still
 * inside their validBefore, plus the store credit regulars can cash
 * out at any time. The desk shows "short" when somebody opens it.
 * This runs on the hourly press whether or not anybody does.
 *
 * TWO FINDINGS, SEPARATELY KEYED so each pages once and backs off:
 *
 *   short   — promised more than held. A walker or a regular will be
 *             refused by the USDC contract when they redeem, which is
 *             the store breaking its word with somebody else's error
 *             message. Page.
 *   thin    — held less than the open board could still promise this
 *             week. Nothing is broken yet; the next claim that pays
 *             makes it short. Page once, quieter wording.
 *
 * A balance that could not be read is neither: it is reported as its
 * own line, never as zero, and the check says so rather than guess.
 */
export interface FieldWalletSweep {
  at: string;
  wallet: FieldWalletReading;
  promised_usd: number;
  live_bounty_authorizations: number;
  credit_owed_usd: number;
  board_remaining_usd: number;
  findings: string[];
}

export async function sweepFieldWallet(env: Env): Promise<FieldWalletSweep> {
  const { bountyBoard, livePayouts, payoutRedemptions } = await import(
    "@/services/bounty-board"
  );
  const { creditOutstandingAtomic } = await import("@/services/store-credit");
  const wallet = await readFieldWallet(env);
  const now = new Date();
  const board = await bountyBoard(env, now);
  // A payout the chain has seen burn is money gone, not money promised.
  // A chain that cannot be asked leaves every payout counted.
  const redemptions = await payoutRedemptions(env, board.bounties).catch(
    () => ({}),
  );
  const live = livePayouts(board.bounties, redemptions, now);
  const liveUsd = live.reduce((sum, bounty) => sum + bounty.reward_usd, 0);
  const creditOwedUsd = Number(await creditOutstandingAtomic(env)) / 1e6;
  const promised = Math.round((liveUsd + creditOwedUsd) * 100) / 100;
  const boardRemaining =
    Math.round(
      Math.max(0, board.weekly_budget_usd - board.spent_this_week_usd) * 100,
    ) / 100;
  const sweep: FieldWalletSweep = {
    at: now.toISOString(),
    wallet,
    promised_usd: promised,
    live_bounty_authorizations: live.length,
    credit_owed_usd: Math.round(creditOwedUsd * 100) / 100,
    board_remaining_usd: boardRemaining,
    findings: [],
  };
  if (!wallet.provisioned || wallet.address === null) {
    return sweep; // A read-only deployment promises nothing it cannot keep.
  }
  if (wallet.usdc === null) {
    sweep.findings.push(`unread: ${wallet.problem ?? "the balance was not read"}`);
    await sendAlert(env, {
      condition: "field_wallet_short",
      key: "unread",
      detail: `UNCLEAR — the paying wallet ${wallet.address} could not be read this hour (${wallet.problem ?? "no reason recorded"}), so nothing can say whether it covers the $${promised.toFixed(2)} it has signed for (${live.length} live bounty authorization${live.length === 1 ? "" : "s"}, $${sweep.credit_owed_usd.toFixed(2)} credit owed). Not a shortfall; a blind spot. If it repeats, the RPC ladder is the suspect.`,
    }).catch(() => undefined);
    return sweep;
  }
  const held = wallet.usdc;
  if (promised > held + 0.005) {
    sweep.findings.push(`short: promised $${promised.toFixed(2)}, holds $${held.toFixed(2)}`);
    await sendAlert(env, {
      condition: "field_wallet_short",
      key: "short",
      detail: `OURS, money promised — the paying wallet ${wallet.address} holds $${held.toFixed(2)} USDC on Base and has signed for $${promised.toFixed(2)}: ${live.length} live bounty authorization${live.length === 1 ? "" : "s"} worth $${(Math.round(liveUsd * 100) / 100).toFixed(2)} plus $${sweep.credit_owed_usd.toFixed(2)} in store credit regulars can cash out. The next redemption past the balance is refused by the USDC contract, in somebody else's error message. Top the wallet up by at least $${(promised - held).toFixed(2)}. The board and every claim: /admin/bounties.`,
    }).catch(() => undefined);
    return sweep;
  }
  if (board.open_count > 0 && held - promised < boardRemaining) {
    sweep.findings.push(
      `thin: $${(held - promised).toFixed(2)} free against $${boardRemaining.toFixed(2)} the open board could still promise this week`,
    );
    await sendAlert(env, {
      condition: "field_wallet_short",
      key: "thin",
      detail: `THIN, nothing broken yet — the paying wallet ${wallet.address} holds $${held.toFixed(2)} USDC on Base, of which $${promised.toFixed(2)} is already signed for, leaving $${(held - promised).toFixed(2)} against the $${boardRemaining.toFixed(2)} the ${board.open_count} open bount${board.open_count === 1 ? "y" : "ies"} could still pay this week. Enough claims and the wallet is short. Top up, or let the board run down. /admin/bounties has the wallet and the board.`,
    }).catch(() => undefined);
  }
  return sweep;
}

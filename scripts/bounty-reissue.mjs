#!/usr/bin/env node
/**
 * REISSUE A BOUNTY PAYOUT — the keeper's hand, never a door.
 *
 *   node scripts/bounty-reissue.mjs <bounty_id> [--dry-run]
 *   node scripts/bounty-reissue.mjs --self-test
 *
 * A paid claim's answer carries the signed EIP-3009 authorization
 * once, and the store keeps the nonce and the expiry on the record
 * but not the signature (src/services/bounty-board.ts). A walker who
 * dropped the signature has lost nothing the store cannot reproduce:
 * the field wallet signs deterministically (RFC 6979 under the hood
 * of viem), so the SAME message under the SAME key yields the SAME
 * signature, byte for byte. This script rebuilds that message from
 * the public board record and signs it again.
 *
 * WHAT IT WILL NOT DO, and why each refusal exists:
 *   - sign a fresh nonce or a later expiry. That is a second payout
 *     on one settlement, which the board promises never to make.
 *     If the original expired, the answer to the walker is "expired",
 *     not a new authorization from this script.
 *   - sign for a nonce the chain says is already used. A redeemed
 *     authorization reissued is harmless on chain and misleading in
 *     a letter; the script says "redeemed" instead.
 *   - sign from a key whose address is not in house-wallets.json,
 *     the same gate zero the walkabout runner keeps.
 *
 * Environment (a .env file in the repo root is read):
 *   FIELD_WALLET_KEY   the field wallet's secp256k1 key, 0x-hex. Not
 *                      needed for --dry-run or --self-test.
 *   BASE_RPC_URL       Base JSON-RPC (default https://mainnet.base.org).
 *   STORE_BASE_URL     default https://scvd.store.
 *
 * The output is the claim answer's `payout` object, ready to paste
 * into the reply at /admin. The signature is the payment: it pays
 * only the address inside it, whoever carries it, so handing it back
 * to a letter with no return address costs the store nothing it did
 * not already owe.
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress } from "viem";
import { BASE_USDC, typedData } from "./lib/walkabout.mjs";

const REPO_ROOT = new URL("../", import.meta.url);
const STORE = process.env.STORE_BASE_URL ?? "https://scvd.store";
const RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";
/** authorizationState(address,bytes32) on the USDC contract. */
const AUTHORIZATION_STATE_SELECTOR = "0xe94a0102";
const FIELD_WALLET_KEY_ENV = "FIELD_WALLET_KEY";

function fail(message) {
  console.error(`bounty-reissue: ${message}`);
  process.exit(1);
}

function houseWalletEntries() {
  return JSON.parse(
    readFileSync(new URL("src/store/house-wallets.json", REPO_ROOT), "utf8"),
  ).wallets;
}

function houseWallets() {
  return houseWalletEntries().map((w) => w.address.toLowerCase());
}

/** The field wallet's listed address, for a keyless read of the chain. */
function listedFieldWallet() {
  return houseWalletEntries().find((w) => /^the field wallet/.test(w.who))?.address ?? null;
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** True when the USDC contract has already seen this nonce from this authorizer. */
async function authorizationUsed(from, nonce) {
  const data =
    AUTHORIZATION_STATE_SELECTOR +
    from.toLowerCase().replace(/^0x/, "").padStart(64, "0") +
    nonce.toLowerCase().replace(/^0x/, "");
  const result = await rpc("eth_call", [{ to: BASE_USDC, data }, "latest"]);
  return BigInt(result) !== 0n;
}

/**
 * The message exactly as the claim door built it (bounty-board.ts,
 * the block under "RESERVE, then sign"): every field but `from`
 * comes off the public record, and `from` is whoever holds the key.
 */
export function rebuildAuthorization(record, from) {
  const claim = record.claim ?? {};
  for (const field of ["payout_to", "authorization_nonce", "authorization_valid_before"]) {
    if (typeof claim[field] !== "string" || claim[field].length === 0) {
      throw new Error(`the record's claim carries no ${field}; nothing to rebuild`);
    }
  }
  return {
    from,
    to: claim.payout_to,
    value: String(Math.round(record.reward_usd * 1e6)),
    validAfter: "0",
    validBefore: claim.authorization_valid_before,
    nonce: claim.authorization_nonce,
  };
}

/** The claim door's EIP-712 domain, verbatim. */
function payoutTypedData(authorization) {
  return typedData({ asset: BASE_USDC }, authorization);
}

export async function signPayout(account, authorization) {
  const data = payoutTypedData(authorization);
  const signature = await account.signTypedData(data);
  const recovered = await recoverTypedDataAddress({ ...data, signature });
  if (recovered.toLowerCase() !== authorization.from.toLowerCase()) {
    throw new Error("the signature does not recover to the signing address");
  }
  return signature;
}

function payoutBlock(authorization, signature) {
  return {
    method: "eip3009_transfer_with_authorization",
    asset: BASE_USDC,
    chain: "eip155:8453",
    authorization,
    signature,
    how_to_redeem: `Submit transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, signature) on the USDC contract (${BASE_USDC}) on Base — from your own wallet or any relayer; the function is submittable by anyone. Valid until unix ${authorization.validBefore}; unredeemed, it expires on its own and the budget takes it back. The signature is the payment — treat it like cash.`,
  };
}

/**
 * Sign a fixture twice under a throwaway key and check the two
 * signatures agree and recover. This is the whole claim the script
 * rests on; a build of viem that signed with a random k would make
 * "the same authorization" a lie, and this is where that would show.
 */
async function selfTest() {
  const key = `0x${randomBytes(32).toString("hex")}`;
  const account = privateKeyToAccount(key);
  const record = {
    reward_usd: 0.1,
    claim: {
      payout_to: "0x000000000000000000000000000000000000dEaD",
      authorization_nonce: `0x${randomBytes(32).toString("hex")}`,
      authorization_valid_before: String(Math.floor(Date.now() / 1000) + 600),
    },
  };
  const authorization = rebuildAuthorization(record, account.address);
  const first = await signPayout(account, authorization);
  const second = await signPayout(account, authorization);
  if (first !== second) fail("self-test FAILED: two signatures of one message differ");
  if (authorization.value !== "100000") fail("self-test FAILED: $0.10 is 100000 atomic");
  // The record keeps payout_to lowercased; the claim door signed it as
  // the walker sent it. EIP-712 encodes an address as a number, so the
  // two spell one message — and this is where that would stop being true.
  const lowered = await signPayout(account, { ...authorization, to: authorization.to.toLowerCase() });
  if (lowered !== first) fail("self-test FAILED: address case changed the signature");
  console.log("self-test ok: deterministic signature, address case ignored, recovers to the signer, $0.10 = 100000 atomic");
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();
  const dryRun = args.includes("--dry-run");
  const bountyId = args.find((a) => /^bty_[a-z0-9]+$/.test(a));
  if (!bountyId) fail("usage: node scripts/bounty-reissue.mjs <bounty_id> [--dry-run] | --self-test");

  const board = await fetch(`${STORE}/api/bounties`, {
    headers: { accept: "application/json" },
  }).then((r) => r.json());
  const record = (board.bounties ?? []).find((b) => b.bounty_id === bountyId);
  if (!record) fail(`no record ${bountyId} on ${STORE}/api/bounties`);
  if (record.status !== "paid") fail(`${bountyId} reads ${record.status}, not paid — there is no payout to reissue`);

  const nowSeconds = Math.floor(Date.now() / 1000);
  const validBefore = Number(record.claim?.authorization_valid_before ?? 0);
  if (!(validBefore > nowSeconds)) {
    fail(
      `the original authorization expired at unix ${validBefore} (${new Date(validBefore * 1000).toISOString()}). ` +
        "A fresh one would be a second payout on the same settlement; the answer is 'expired', not a new signature.",
    );
  }

  const key = process.env[FIELD_WALLET_KEY_ENV];
  if (!key && !dryRun) fail(`${FIELD_WALLET_KEY_ENV} is not set (or pass --dry-run to see the message unsigned)`);
  const account = key ? privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`) : null;
  if (account && !houseWallets().includes(account.address.toLowerCase())) {
    fail(`${account.address} is not in src/store/house-wallets.json; no undeclared wallet signs a payout`);
  }
  // A dry run reads the chain as the listed field wallet, so the nonce
  // question is answered before anyone reaches for the key.
  const from = account?.address ?? listedFieldWallet();
  if (!from) fail("no field wallet is listed in src/store/house-wallets.json to read the chain as");
  const authorization = rebuildAuthorization(record, from);

  const used = await authorizationUsed(from, authorization.nonce);
  if (used) {
    fail(
      `the chain says nonce ${authorization.nonce} from ${from} is already used — this payout was redeemed. Nothing to reissue.`,
    );
  }

  console.error(
    `${bountyId}: $${record.reward_usd} to ${authorization.to}, nonce ${authorization.nonce}, valid until ${new Date(validBefore * 1000).toISOString()} — nonce unused on chain as ${from}` +
      (account ? "" : " (dry run: read as the listed field wallet, nothing signed)"),
  );
  if (dryRun) {
    console.log(JSON.stringify({ dry_run: true, authorization }, null, 2));
    return;
  }
  const signature = await signPayout(account, authorization);
  console.log(JSON.stringify(payoutBlock(authorization, signature), null, 2));
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));

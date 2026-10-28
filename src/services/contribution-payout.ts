import {allocatedFieldSigner, allocationLedger} from "@/services/field-wallet-allocations";
import {authorizationTypes} from "@x402/evm";
import {BASE_USDC, rpcEndpoints, usdcBalanceOf} from "@/lib/base-rpc";
import {fieldSignerFromKey, oracleScreen, type FieldSigner} from "@/services/launch-check";
import {BOUNTY_AUTH_VALID_SECONDS} from "@/services/bounty-board";
import {EVM_USDC_DOMAIN, USDC_DECIMALS} from "@/lib/payments";
import {BASE_NETWORK} from "@/lib/payment-networks";
import type {Env} from "@/types";

export const CONTRIBUTION_AUTH_SECONDS = BOUNTY_AUTH_VALID_SECONDS;
export interface ContributionAuthorization {from: string; to: string; value: string; validAfter: string; validBefore: string; nonce: string}
export interface ContributionPayout {authorization: ContributionAuthorization; created_at: string; signature?: string; issued_at?: string}
export const CONTRIBUTION_REDEMPTION = {
  store_sponsors_gas: false, store_broadcasts: false, authorization_is_payment_received: false,
  network: BASE_NETWORK, asset: BASE_USDC, validity_seconds: CONTRIBUTION_AUTH_SECONDS,
  instructions: "Before reserving, arrange Base ETH for your own redemption or a submitter willing to pay gas. SCVD pays no gas and provides no sponsored route. After acceptance and keeper approval, retrieve the signed transferWithAuthorization through private status and submit it on Base before its validBefore time. Anyone may submit; the signed recipient cannot be changed. An authorization is not a received payment. Verify the on-chain transfer independently. Expired authorizations are not automatically replaced.",
} as const;
export async function contributionSigner(env: Env, commitmentId?: string): Promise<FieldSigner> {
  if (!env.FIELD_WALLET_KEY) throw new Error("Contribution payout unavailable");
  return allocatedFieldSigner(env, await fieldSignerFromKey(env.FIELD_WALLET_KEY), "contributions", commitmentId);
}
export async function contributionFundingWallet(env: Env) {
  if (!env.FIELD_WALLET_KEY) throw new Error("Contribution funding unavailable");
  return (await fieldSignerFromKey(env.FIELD_WALLET_KEY)).address;
}
export async function reserveContributionAcceptance(env: Env, wallet: string, id: string, recipient: string, reward: number, now: number) {
  return allocationLedger(env,wallet).commitContribution(wallet,id,recipient,contributionRewardUnits(reward),now);
}
export async function signContributionReward(env: Env, signer: FieldSigner, authorization: ContributionAuthorization) {
  const screen = await oracleScreen(rpcEndpoints(env), fetch)(authorization.to);
  if (screen.listed !== false) throw new Error("Contribution payout unavailable");
  // Early liquidity check; the production signer separately allocates against
  // the shared ledger before issuing this authorization.
  const balance = await usdcBalanceOf(env, signer.address);
  if (balance < BigInt(authorization.value)) throw new Error("Contribution payout unavailable");
  return signer.signTypedData(contributionSigningRequest(authorization));
}
export function contributionSigningRequest(authorization: ContributionAuthorization): Parameters<FieldSigner["signTypedData"]>[0] {
  return {domain: {...EVM_USDC_DOMAIN, chainId: Number(BASE_NETWORK.split(":")[1]), verifyingContract: BASE_USDC},
    types: {TransferWithAuthorization: [...authorizationTypes.TransferWithAuthorization]}, primaryType: "TransferWithAuthorization", message: {...authorization}};
}
export function privateContributionPayout(payout: ContributionPayout, now: number) {
  if (!payout.signature) return {state: "issuance_pending", created_at: payout.created_at, redemption: CONTRIBUTION_REDEMPTION};
  return {...payout, state: Number(payout.authorization.validBefore) * 1000 <= now ? "expired" : "authorization_issued",
    redemption_state: "not_observed", redemption: CONTRIBUTION_REDEMPTION};
}

export function contributionRewardUnits(reward: number) {return String(BigInt(Math.round(reward * 100)) * 10n ** BigInt(USDC_DECIMALS - 2));}

import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import { Challenge, Credential, Receipt } from "mppx";
import { Mppx } from "mppx/server/core";
import { charge } from "mppx/evm/server";
import { AuthorizationPayloadSchema } from "mppx/evm";
import { formatUnits, getAddress } from "viem";
import { BASE_USDC } from "@/lib/base-rpc";
import { EVM_USDC_DOMAIN, EVM_TRANSFER_METHOD, USDC_DECIMALS } from "@/lib/payments";
import { BASE_NETWORK } from "@/lib/payment-networks";
import { sha256Hex } from "@/lib/idempotency";
import { mppEvmPurchasePayment } from "@/lib/purchase-payment";

/** Qualification seam only. No route calls this or advertises MPP checkout. */
export interface MppEvmTerms {
  /** Dedicated challenge key; never the artifact signing key or wallet key. */
  secretKey: string;
  realm: string;
  scope: string;
  requestDigest: string;
  purchaseKey: string;
  terms: PaymentRequirements;
  /** Existing authenticated facilitator's non-mutating chain-state check. */
  verify: (payload: PaymentPayload, terms: PaymentRequirements) => Promise<{ isValid: boolean; payer?: string }>;
}

/** A success-shaped response without matching chain evidence is uncertainty. */
export class MppSettlementEvidenceUnavailable extends Error {
  constructor() { super("MPP settlement evidence is unavailable"); }
}

/**
 * Pin the SDK's non-mutating and broadcasting APIs independently. The SDK's
 * built-in facilitator settler throws the same error for unsuccessful replies;
 * the store needs the original result to distinguish refusal from uncertainty.
 * Admission, submission retry policy, recovery and accounting remain the
 * caller's responsibility. This adapter never submits during validation.
 */
export function createMppEvmAdapter(config: MppEvmTerms) {
  // Snapshot configuration: a caller changing a quote after issuing a challenge
  // cannot change the accepted transfer or the facilitator arguments later.
  const terms = structuredClone(config.terms);
  const { secretKey, realm, scope, requestDigest, purchaseKey, verify } = config;
  if (terms.scheme !== "exact" || terms.network !== BASE_NETWORK ||
    getAddress(terms.asset) !== getAddress(BASE_USDC) || !/^\d+$/.test(terms.amount) || BigInt(terms.amount) <= 0n ||
    terms.extra?.name !== EVM_USDC_DOMAIN.name || terms.extra?.version !== EVM_USDC_DOMAIN.version || terms.extra?.assetTransferMethod !== EVM_TRANSFER_METHOD ||
    !Number.isSafeInteger(terms.maxTimeoutSeconds) || terms.maxTimeoutSeconds <= 0 ||
    !/^[a-f0-9]{64}$/.test(requestDigest) || !scope || !realm || !purchaseKey || purchaseKey.length > 200) {
    throw new Error("Unsupported MPP checkout terms");
  }
  const request = { amount: formatUnits(BigInt(terms.amount), USDC_DECIMALS) };
  const binding = { realm, scope, request, meta: { request_digest: requestDigest, purchase_key: purchaseKey } };
  const payloadOf = (credential: Credential.Credential): PaymentPayload => {
    const payload = AuthorizationPayloadSchema.parse(credential.payload);
    const { signature, type: _type, ...authorization } = payload;
    return { x402Version: 2, accepted: structuredClone(terms), payload: { authorization, signature } };
  };
  async function verifyChain(credential: Credential.Credential) {
    const payload = payloadOf(credential);
    const checked = await verify(payload, structuredClone(terms));
    const payer = AuthorizationPayloadSchema.parse(credential.payload).from;
    if (!checked.isValid || (checked.payer && getAddress(checked.payer) !== getAddress(payer))) {
      throw new Error("MPP payment verification refused");
    }
    return payload;
  }
  const server = (submit: (credential: Credential.Credential) => Promise<{ reference: string }>) => Mppx.create({
    secretKey, realm,
    methods: [charge({ chainId: Number(terms.network.split(":")[1]), currency: getAddress(terms.asset),
      recipient: getAddress(terms.payTo), decimals: USDC_DECIMALS,
      authorization: { name: String(terms.extra!.name), version: String(terms.extra!.version) },
      settle: ({ credential }) => submit(credential),
    })],
  });
  const reader = server(async () => { throw new Error("Validation cannot submit payment"); });

  return {
    async challenge() {
      const challenge = await reader.challenge.evm.charge({ ...request, scope, meta: binding.meta,
        expires: new Date(Date.now() + terms.maxTimeoutSeconds * 1000).toISOString() });
      return { challenge, header: Challenge.serialize(challenge) };
    },
    async validate(header: string) {
      const validation = await reader.validateCredential(header, binding);
      const credential = validation.credential;
      const payload = await verifyChain(credential);
      const authorization = AuthorizationPayloadSchema.parse(credential.payload);
      const payment = await mppEvmPurchasePayment(terms, authorization.from, authorization, await sha256Hex(header));
      return { payment, payload };
    },
    /** Caller must hold durable purchase admission before invoking this. */
    async broadcast(header: string, submit: (payload: PaymentPayload, terms: PaymentRequirements) => Promise<SettleResponse>) {
      let result: SettleResponse | undefined;
      const declined = new Error("MPP facilitator returned an unsuccessful settlement result");
      const writer = server(async credential => {
        // SDK revalidates the signature/challenge/window before entering here.
        // Chain state is checked again after preparation, immediately before submit.
        const payload = await verifyChain(credential);
        result = await submit(payload, structuredClone(terms));
        if (!result.success) throw declined;
        const payer = AuthorizationPayloadSchema.parse(credential.payload).from;
        if (!/^0x[a-f0-9]{64}$/i.test(result.transaction) || result.network !== terms.network ||
          (result.payer && getAddress(result.payer) !== getAddress(payer)) ||
          (result.amount !== undefined && result.amount !== terms.amount)) throw new MppSettlementEvidenceUnavailable();
        return { reference: result.transaction };
      });
      try {
        const receipt = await writer.broadcastCredential(header, binding);
        if (!result) throw new MppSettlementEvidenceUnavailable();
        return { result, receipt, header: Receipt.serialize(receipt) };
      } catch (error) {
        // Preserve unsuccessful replies and thrown transport errors verbatim.
        // Neither one becomes evidence of a confirmed non-payment here.
        if (error === declined && result) return { result, receipt: null, header: null };
        throw error;
      }
    },
  };
}

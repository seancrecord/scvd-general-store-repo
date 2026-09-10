import { authorizationTypes } from "@x402/evm";
import { verifyTypedData } from "viem";
import { verifyAsync } from "@noble/ed25519";
import { encodeBase58 } from "@/lib/base58";
import { solanaPaymentEvidence } from "@/lib/solana-payment-evidence";
import { isRecord } from "@/types";

/** Ownership proof only. Expiry and nonce usage affect spending, not whether
 * these bytes were signed. This must never authorize a settlement. Contract
 * signatures requiring chain execution remain on the facilitator/status path.
 */
export async function paymentRecoverySigners(wire: unknown): Promise<{ network: string; payers: string[] } | null> {
  if (!isRecord(wire) || wire.x402Version !== 2 || !isRecord(wire.accepted) ||
    wire.accepted.scheme !== "exact" || !isRecord(wire.payload)) return null;
  const { accepted, payload } = wire;
  if (typeof accepted.network !== "string") return null;
  const network = accepted.network;
  try {
    if (/^eip155:[0-9]+$/.test(network)) {
      const a = payload.authorization, extra = accepted.extra;
      const address = (value: unknown): value is `0x${string}` => typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
      if (!isRecord(a) || !isRecord(extra) || typeof extra.name !== "string" || typeof extra.version !== "string" ||
        !address(a.from) || !address(a.to) || !address(accepted.asset) ||
        typeof a.nonce !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(a.nonce) ||
        typeof payload.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(payload.signature) ||
        ![a.value, a.validAfter, a.validBefore].every(v => typeof v === "string" && /^[0-9]{1,78}$/.test(v))) return null;
      const chainId = Number(network.slice("eip155:".length));
      if (!Number.isSafeInteger(chainId) || chainId <= 0) return null;
      const valid = await verifyTypedData({ address: a.from,
        domain: { name: extra.name, version: extra.version, chainId, verifyingContract: accepted.asset },
        types: authorizationTypes, primaryType: "TransferWithAuthorization",
        message: { from: a.from, to: a.to, value: BigInt(String(a.value)), validAfter: BigInt(String(a.validAfter)),
          validBefore: BigInt(String(a.validBefore)), nonce: a.nonce as `0x${string}` },
        signature: payload.signature as `0x${string}` });
      return valid ? { network, payers: [a.from.toLowerCase()] } : null;
    }
    if (!network.startsWith("solana:") || typeof payload.transaction !== "string") return null;
    await solanaPaymentEvidence(payload.transaction);
    const bytes = Uint8Array.from(atob(payload.transaction), c => c.charCodeAt(0));
    const count = bytes[0]!, offset = 1 + count * 64, message = bytes.subarray(offset);
    const header = message[0] === 128 ? 1 : 0, accounts = header + 4, accountCount = message[header + 3]!;
    // A packet within the existing framing limit cannot hold 128 static keys.
    // Refuse noncanonical/multibyte counts rather than interpreting them twice.
    if (accountCount >= 128 || accountCount < count || accounts + accountCount * 32 + 32 >= message.length) return null;
    const payers: string[] = [];
    for (let index = 0; index < count; index++) {
      const key = message.subarray(accounts + index * 32, accounts + (index + 1) * 32);
      if (await verifyAsync(bytes.subarray(1 + index * 64, 65 + index * 64), message, key)) payers.push(encodeBase58(key));
    }
    // A fee payer is not presumed to be the buyer. Only a verified signer
    // whose exact transaction has a retained ownership record can recover.
    return payers.length ? { network, payers } : null;
  } catch {
    return null;
  }
}

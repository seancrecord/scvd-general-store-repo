import { Point } from "@noble/ed25519";
import { TOKEN_PROGRAM_ADDRESS } from "@x402/svm";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, getAddress } from "viem";
import { decodeBase58, encodeBase58 } from "@/lib/base58";
import type { ChallengeRequirement } from "./payment";
import { object, type Obj } from "./buyer-harness";

// Disposable public fixture key; never funded or sent to an external service.
export const evmBuyer = privateKeyToAccount(`0x${"07".repeat(32)}`);
export const recipient = getAddress("0x843b544bf5f0aa6cbf13e94563874878c98cc4a7");
const types = { TransferWithAuthorization: [
  { name: "from", type: "address" }, { name: "to", type: "address" },
  { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
] } as const;
function domain(o: ChallengeRequirement) {
  return { name: String(o.extra?.name ?? "USD Coin"), version: String(o.extra?.version ?? "2"), chainId: Number(o.network.split(":")[1]), verifyingContract: o.asset as `0x${string}` };
}
function message(a: Obj) {
  return { from: String(a.from) as `0x${string}`, to: String(a.to) as `0x${string}`, value: BigInt(String(a.value)), validAfter: BigInt(String(a.validAfter)), validBefore: BigInt(String(a.validBefore)), nonce: String(a.nonce) as `0x${string}` };
}
export async function evmPayment(o: ChallengeRequirement, change: Obj = {}, signingOffer = o): Promise<Obj> {
  const a = { from: evmBuyer.address, to: o.payTo, value: o.amount, validAfter: "0", validBefore: String(Date.now() / 1000 + o.maxTimeoutSeconds), nonce: `0x${crypto.randomUUID().replace(/-/g, "").repeat(2)}`, ...change };
  const signature = await evmBuyer.signTypedData({ domain: domain(signingOffer), types, primaryType: "TransferWithAuthorization", message: message(a) });
  return { x402Version: 2, accepted: o, payload: { authorization: a, signature } };
}
export async function evmValid(w: Obj, o: ChallengeRequirement): Promise<boolean> {
  try { const p = object(w.payload); return await verifyTypedData({ address: String(object(p.authorization).from) as `0x${string}`, domain: domain(o), types, primaryType: "TransferWithAuthorization", message: message(object(p.authorization)), signature: String(p.signature) as `0x${string}` }); }
  catch { return false; }
}
let solKey: CryptoKeyPair, feeKey: CryptoKeyPair;
export let solBuyer = "", solFeePayer = "";
export async function initializeSol(): Promise<void> {
  solKey = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  feeKey = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  solBuyer = encodeBase58(new Uint8Array((await crypto.subtle.exportKey("raw", solKey.publicKey)) as ArrayBuffer));
  solFeePayer = encodeBase58(new Uint8Array((await crypto.subtle.exportKey("raw", feeKey.publicKey)) as ArrayBuffer));
}
const concat = (...parts: Uint8Array[]) => Uint8Array.from(parts.flatMap(p => [...p]));
const bytes = (text: string) => { const b = decodeBase58(text); if (!b || b.length !== 32) throw new Error("fixture public key is not 32 bytes"); return b; };
// Program id from the installed SVM SDK's associated-token derivation.
const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export async function associated(owner: string, mint: string): Promise<Uint8Array> {
  for (let bump = 255; bump >= 0; bump--) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", concat(bytes(owner), bytes(TOKEN_PROGRAM_ADDRESS), bytes(mint), Uint8Array.of(bump), bytes(ATA), new TextEncoder().encode("ProgramDerivedAddress"))));
    try { Point.fromBytes(hash); } catch { return hash; }
  }
  throw new Error("no fixture ATA bump");
}
// Legacy transaction with an isolated fee payer, standard compute-budget
// instructions and TransferChecked. Keys are real; balances and recent blockhash
// are fixture state. Both signatures are generated locally, never submitted.
export async function solPayment(o: ChallengeRequirement, change: { mint?: string; recipient?: string; amount?: bigint; unrelatedSignature?: boolean; buyerKey?: CryptoKeyPair } = {}): Promise<Obj> {
  const buyerKey = change.buyerKey ?? solKey;
  const buyer = encodeBase58(new Uint8Array((await crypto.subtle.exportKey("raw", buyerKey.publicKey)) as ArrayBuffer));
  const mint = change.mint ?? o.asset;
  const amount = new Uint8Array(8); new DataView(amount.buffer).setBigUint64(0, change.amount ?? BigInt(o.amount), true);
  const limit = new Uint8Array(4); new DataView(limit.buffer).setUint32(0, 20000, true);
  const price = new Uint8Array(8); price[0] = 1;
  const msg = concat(Uint8Array.of(2, 1, 3, 7), bytes(solFeePayer), bytes(buyer), await associated(buyer, mint), await associated(change.recipient ?? o.payTo, mint), bytes(mint), bytes(TOKEN_PROGRAM_ADDRESS), bytes("ComputeBudget111111111111111111111111111111"), crypto.getRandomValues(new Uint8Array(32)), Uint8Array.of(3, 6, 0, 5, 2), limit, Uint8Array.of(6, 0, 9, 3), price, Uint8Array.of(5, 4, 2, 4, 3, 1, 10, 12), amount, Uint8Array.of(6));
  const signed = msg.slice(); if (change.unrelatedSignature) signed[signed.length - 2] = signed[signed.length - 2]! ^ 1;
  const feeSig = new Uint8Array(await crypto.subtle.sign("Ed25519", feeKey.privateKey, msg));
  const buyerSig = new Uint8Array(await crypto.subtle.sign("Ed25519", buyerKey.privateKey, signed));
  return { x402Version: 2, accepted: o, payload: { transaction: btoa(String.fromCharCode(...concat(Uint8Array.of(2), feeSig, buyerSig, msg))) } };
}
export async function solFacts(w: Obj): Promise<{ valid: boolean; payer: string; recipientAccount: string; mint: string; amount: bigint; tx: string; feePayer: string }> {
  const raw = Uint8Array.from(atob(String(object(w.payload).transaction)), c => c.charCodeAt(0));
  if (raw[0] !== 2 || raw.length < 400) throw new Error("unsupported fixture transaction shape");
  const msg = raw.slice(129), accounts = Array.from({ length: msg[3]! }, (_, i) => msg.slice(4 + 32 * i, 36 + 32 * i));
  let valid = true;
  for (let i = 0; i < 2; i++) {
    const key = await crypto.subtle.importKey("raw", accounts[i]!, { name: "Ed25519" }, false, ["verify"]);
    valid = valid && await crypto.subtle.verify("Ed25519", key, raw.slice(1 + i * 64, 65 + i * 64), msg);
  }
  let cursor = 4 + 32 * accounts.length + 32;
  const count = msg[cursor++]!;
  for (let i = 0; i < count; i++) {
    const program = msg[cursor++]!, n = msg[cursor++]!;
    const indexes = msg.slice(cursor, cursor += n), len = msg[cursor++]!, data = msg.slice(cursor, cursor += len);
    if (encodeBase58(accounts[program]!) === TOKEN_PROGRAM_ADDRESS && data[0] === 12) return { valid, payer: encodeBase58(accounts[indexes[3]!]!), recipientAccount: encodeBase58(accounts[indexes[2]!]!), mint: encodeBase58(accounts[indexes[1]!]!), amount: new DataView(data.buffer, data.byteOffset + 1, 8).getBigUint64(0, true), tx: encodeBase58(raw.slice(1, 65)), feePayer: encodeBase58(accounts[0]!) };
  }
  throw new Error("no checked token transfer");
}

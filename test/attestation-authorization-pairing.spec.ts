import { env } from "cloudflare:test";
import { expect, it } from "vitest";
import { AUTHORIZATION_USED_TOPIC, BASE_EVM, POLYGON_EVM, TRANSFER_TOPIC, type RpcLog, type EvmChain } from "@/lib/base-rpc";
import { observeWithFacts, type AttestationQuery } from "@/services/attestation";
import type { Env } from "@/types";
import { verifyMessageSignature } from "@/lib/signing";

const payer = `0x${"11".repeat(20)}`;
const recipient = `0x${"22".repeat(20)}`;
const other = `0x${"33".repeat(20)}`;
const nonce = `0x${"ab".repeat(32)}`;
const otherNonce = `0x${"ef".repeat(32)}`;
const txHash = `0x${"cd".repeat(32)}`;
const topic = (a: string) => `0x${a.slice(2).padStart(64, "0")}`;
const auth = (from = payer, key = nonce, asset = BASE_EVM.usdc): RpcLog => ({
  address: asset, topics: [AUTHORIZATION_USED_TOPIC, topic(from), key], data: "0x",
});
const transfer = (amount = 10000n, from = payer, to = recipient, asset = BASE_EVM.usdc): RpcLog => ({
  address: asset, topics: [TRANSFER_TOPIC, topic(from), topic(to)], data: `0x${amount.toString(16).padStart(64, "0")}`,
});
const query = { txHash, payer, recipient, nonce, amountUsdc: 0.01 };
const observe = (logs: RpcLog[], asked: AttestationQuery = query, chain: EvmChain = BASE_EVM, head = 140) =>
  observeWithFacts(env as Env, asked, { transactionHash: txHash, status: "0x1", blockNumber: "0x64", logs }, head, chain, {}, new Date("2026-09-13T20:00:00Z"));

it.each([
  ["another payer's nonce", [auth(other), transfer()]],
  ["wrong amount on the nonce's own transfer", [auth(), transfer(99n), auth(payer, otherNonce), transfer()]],
  ["wrong recipient on the nonce's own transfer", [auth(), transfer(10000n, payer, other), transfer()]],
  ["a transfer before the nonce", [transfer(), auth()]],
  ["an intervening event", [auth(), auth(other, otherNonce), transfer()]],
  ["duplicated authorizer and nonce", [auth(), transfer(), auth(), transfer()]],
  ["foreign token authorization", [auth(payer, nonce, other), transfer()]],
  ["foreign token transfer", [auth(), transfer(10000n, payer, recipient, other)]],
  ["malformed transfer amount", [auth(), { ...transfer(), data: "0x2710" }]],
  ["malformed authorizer padding", [{ ...auth(), topics: [AUTHORIZATION_USED_TOPIC, `0x${"ff".repeat(12)}${payer.slice(2)}`, nonce] }, transfer()]],
  ["malformed authorization data", [{ ...auth(), data: "0x01" }, transfer()]],
] satisfies [string, RpcLog[]][])("does not sign correspondence from %s", async (_name, logs) => {
  const signed = await observe([...logs]);
  expect(signed.status).toBe("INSUFFICIENT_MATCH");
  expect(signed.binding.class).toBe("none");
  expect(signed.binding.asked).toBe("authorization_nonce");
});

it.each([
  ["payer", { payer: other }],
  ["recipient", { recipient: other }],
  ["amount", { amountUsdc: 0.02 }],
] as const)("keeps binding unestablished when requested %s mismatches", async (_name, mismatch) => {
  const signed = await observe([auth(), transfer()], { ...query, ...mismatch });
  expect(signed.status).toBe("INSUFFICIENT_MATCH");
  expect(signed.binding.class).toBe("none");
});

it("does not choose one of two authorizers when only the nonce is supplied", async () => {
  const signed = await observe([auth(other), transfer(10000n, other), auth(), transfer()], { txHash, nonce });
  expect(signed.status).toBe("INSUFFICIENT_MATCH");
  expect(signed.binding.class).toBe("none");
});

it("selects the transfer paired to the nonce rather than the first transfer", async () => {
  const signed = await observe([auth(other, otherNonce), transfer(99n, other), auth(), transfer()], { txHash, nonce });
  expect(signed).toMatchObject({ status: "SETTLED", payer, recipient, amount_usdc: 0.01, binding: { class: "authorization_nonce" } });
});

it.each([BASE_EVM, POLYGON_EVM])("binds one canonical pair on $label", async (chain) => {
  const signed = await observe([auth(payer, nonce, chain.usdc), transfer(10000n, payer, recipient, chain.usdc)], query, chain);
  expect(signed).toMatchObject({ status: "SETTLED", payer, recipient, binding: { class: "authorization_nonce" } });
});

it("uses the payer to resolve nonce reuse by different authorizers", async () => {
  const signed = await observe([auth(other), transfer(10000n, other), auth(), transfer()]);
  expect(signed).toMatchObject({ status: "SETTLED", payer, binding: { class: "authorization_nonce" } });
});

it("keeps depth separate from correspondence", async () => {
  const signed = await observe([auth(), transfer()], query, BASE_EVM, 102);
  expect(signed).toMatchObject({ status: "PENDING_FINALITY", binding: { class: "authorization_nonce" } });
});

it("preserves a broad transfer-only observation when no nonce was asked", async () => {
  const { nonce: _nonce, ...broad } = query;
  const signed = await observe([transfer()], broad);
  expect(signed).toMatchObject({ status: "SETTLED", binding: { class: "none", asked: "none" } });
});

it("signs the pairing evidence and rejects its alteration", async () => {
  const signed = await observe([auth(), transfer()]);
  expect(signed.battery).toBe("settlement-attestation-v4");
  expect(signed.binding.evidence).toMatchObject({ status: "matched", reason: "authorization_and_transfer_match",
    observed: { authorizer: payer, nonce, recipient, amount_atomic: "10000", authorization_receipt_offset: 0, transfer_receipt_offset: 1 } });
  const { signature, public_key, signature_covers: _a, signature_jcs: _b, signature_jcs_covers: _c,
    received_not_observed: _d, projection: _e, ...observation } = signed;
  expect(await verifyMessageSignature(JSON.stringify(observation), signature, public_key)).toBe(true);
  const tampered = structuredClone(observation);
  tampered.binding.evidence!.observed!.authorizer = other;
  expect(await verifyMessageSignature(JSON.stringify(tampered), signature, public_key)).toBe(false);
});

it("reports the mismatching pair and gives an actionable ambiguity reading", async () => {
  const wrong = await observe([auth(), transfer(99n), transfer()]);
  expect(wrong.binding.evidence).toMatchObject({ status: "not_matched", reason: "paired_transfer_terms_not_matched", observed: { amount_atomic: "99" } });
  const ambiguous = await observe([auth(other), transfer(10000n, other), auth(), transfer()], { txHash, nonce });
  expect(ambiguous.binding.evidence?.reason).toBe("ambiguous_authorization_events");
  expect(ambiguous.binding.reading).toContain("Supply the payer");
});

import { SELF, env } from "cloudflare:test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { BASE_EVM, AUTHORIZATION_USED_TOPIC, TRANSFER_TOPIC, type RpcLog } from "@/lib/base-rpc";
import { readTransferClaim } from "@/services/attestation";
import { fieldSignerFromKey, performLaunchCheck, storeLaunchCheck, signLaunchCheck, type FieldSigner } from "@/services/launch-check";
import type { Env } from "@/types";

const e = env as Env;
const tx = `0x${"ab".repeat(32)}`;
const nonce = `0x${"12".repeat(32)}`;
const otherNonce = `0x${"34".repeat(32)}`;
const recipient = `0x${"22".repeat(20)}`;
const other = `0x${"33".repeat(20)}`;
const amount = 10000n;
let signer: FieldSigner;
beforeAll(async () => { signer = await fieldSignerFromKey(`0x${"01".repeat(32)}`); });
afterEach(() => vi.restoreAllMocks());
const topic = (address: string) => `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
const authorization = (payer = signer.address, key = nonce, asset = BASE_EVM.usdc): RpcLog => ({
  address: asset, topics: [AUTHORIZATION_USED_TOPIC, topic(payer), key], data: "0x",
});
const transfer = (value = amount, payer = signer.address, payTo = recipient, asset = BASE_EVM.usdc): RpcLog => ({
  address: asset, topics: [TRANSFER_TOPIC, topic(payer), topic(payTo)], data: `0x${value.toString(16).padStart(64, "0")}`,
});

async function walk(logs: RpcLog[], options: { head?: string; chain?: string; hash?: string; status?: string; block?: string; missing?: boolean } = {}) {
  const methods: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { method: string; id: number };
    methods.push(request.method);
    const result = request.method === "eth_getTransactionReceipt"
      ? options.missing ? null : { status: options.status ?? "0x1", blockNumber: options.block ?? "0x60", transactionHash: options.hash ?? tx, logs }
      : request.method === "eth_blockNumber" ? options.head ?? "0x70"
      : request.method === "eth_chainId" ? options.chain ?? "0x2105" : null;
    return Response.json({ jsonrpc: "2.0", id: request.id, result });
  });
  const report = await performLaunchCheck(e, "https://launch-fixture.example/paid", {
    signer, randomNonce: () => nonce, now: new Date("2026-09-13T18:15:00Z"),
    screen: async () => ({ listed: false, source: "local fixture" }),
    readClaim: (hash, query) => readTransferClaim(e, hash, query, BASE_EVM),
    fetch: async (_url, init) => {
      if (!new Headers(init?.headers).has("PAYMENT-SIGNATURE")) return Response.json({ accepts: [{
        scheme: "exact", network: BASE_EVM.caip2, asset: BASE_EVM.usdc, payTo: recipient, amount: String(amount), maxTimeoutSeconds: 60,
      }] }, { status: 402 });
      return Response.json({ artifact: "original-good" }, { headers: { "PAYMENT-RESPONSE": btoa(JSON.stringify({ transaction: tx })) } });
    },
  });
  return { report, methods };
}

it("confirms the exact authorization and transfer from a real receipt read", async () => {
  const { report, methods } = await walk([authorization(), transfer()]);
  expect(report.payment_attempt).toMatchObject({ settlement: "confirmed", nonce, amount_atomic: String(amount),
    verification: { status: "matched", chain: BASE_EVM.caip2, transaction: tx,
      observed: { authorizer: signer.address.toLowerCase(), nonce, recipient, amount_atomic: String(amount) } } });
  expect(methods).toContain("eth_chainId");
});

it("keeps matching evidence pending until the observation's finality threshold", async () => {
  const { report } = await walk([authorization(), transfer()], { head: "0x61" });
  expect(report.payment_attempt).toMatchObject({ settlement: "pending_finality", verification: { status: "matched" } });
});

it("matches its own pair within a receipt containing other payments", async () => {
  const { report } = await walk([authorization(other, otherNonce), transfer(99n, other), authorization(), transfer()]);
  expect(report.payment_attempt).toMatchObject({ settlement: "confirmed", verification: { status: "matched" } });
});

it.each([
  ["wrong amount", () => [authorization(), transfer(90000n)]],
  ["wrong nonce", () => [authorization(signer.address, otherNonce), transfer()]],
  ["wrong recipient", () => [authorization(), transfer(amount, signer.address, other)]],
  ["another payer's nonce beside our transfer", () => [authorization(other), transfer()]],
  ["our nonce's wrong transfer followed by another authorization's right amount", () => [authorization(), transfer(99n), authorization(signer.address, otherNonce), transfer()]],
  ["our transfer before an unrelated nonce use", () => [transfer(), authorization(), transfer(99n)]],
  ["a foreign token's nonce event", () => [authorization(signer.address, nonce, other), transfer()]],
  ["a foreign token's transfer", () => [authorization(), transfer(amount, signer.address, recipient, other)]],
  ["missing authorization", () => [transfer()]],
  ["duplicate claimed nonce use", () => [authorization(), transfer(), authorization(), transfer()]],
] as const)("does not confirm %s", async (_name, logs) => {
  const { report } = await walk(logs());
  expect(report.payment_attempt).toMatchObject({ settlement: "unknown", verification: { status: "not_matched" } });
});

it.each([
  ["wrong network", { chain: "0x89" }],
  ["wrong transaction", { hash: `0x${"cd".repeat(32)}` }],
  ["invalid block height", { block: "not-a-block" }],
  ["invalid chain head", { head: "not-a-head" }],
  ["partially numeric head", { head: "0x70junk" }],
  ["decimal-shaped head", { head: "112" }],
  ["receipt ahead of the head", { head: "0x50" }],
  ["missing receipt", { missing: true }],
] as const)("keeps payment unknown with %s", async (_name, options) => {
  const { report } = await walk([authorization(), transfer()], options);
  expect(report.payment_attempt).toMatchObject({ settlement: "unknown", verification: { status: "unavailable" } });
  expect(report.tx_hash_status).toBe("claimed");
  expect(report.stages.find(stage => stage.stage === "tx-verify")?.ok).toBe(false);
  if (!("missing" in options)) expect(report.tx_verification).toMatchObject({ read: "failed", chain_status: null });
});

it("does not infer that no money moved elsewhere from a reverted candidate receipt", async () => {
  const { report } = await walk([authorization(), transfer()], { status: "0x0" });
  expect(report.payment_attempt).toMatchObject({ settlement: "unknown", verification: { status: "not_matched" } });
});


it("serves exact evidence inside the signed bytes and explains its scope", async () => {
  const { report } = await walk([authorization(), transfer()]);
  await storeLaunchCheck(e, report, "binding-fixture-cert", report.observed_at);
  const response = await SELF.fetch(`https://scvd.store/api/launch-check/${report.check_id}`);
  const body = await response.json() as { check: typeof report; how_to_verify: string[] };
  expect(body.check).toEqual(report);
  expect(body.how_to_verify.join(" ")).toContain("pending_finality");
  expect(body.how_to_verify.join(" ")).toContain("AuthorizationUsed");
  const { verifyAsync } = await import("@noble/ed25519");
  const unsigned = Object.fromEntries(Object.entries(body.check).slice(0, Object.keys(body.check).indexOf("signature")));
  const hex = (s: string) => Uint8Array.from(s.match(/.{2}/g)!, byte => Number.parseInt(byte, 16));
  expect(await verifyAsync(hex(report.signature), new TextEncoder().encode(JSON.stringify(unsigned)), hex(report.public_key))).toBe(true);
  const changed = JSON.parse(JSON.stringify(unsigned));
  changed.payment_attempt.verification.observed.amount_atomic = "1";
  expect(await verifyAsync(hex(report.signature), new TextEncoder().encode(JSON.stringify(changed)), hex(report.public_key))).toBe(false);
});


it("does not describe a retained older observation as the new battery during recovery", async () => {
  const { report } = await walk([authorization(), transfer()]);
  const { signature, public_key, signature_covers, evidence_hash, scope, ...core } = report;
  const older = { ...core, battery: "launch-check-v3", replay: { outcome: "served_again" as const, status: 200, names_settlement: false },
    replay_served: true, payment_attempt: { ...core.payment_attempt!, settlement: "unknown" as const, verification: undefined } };
  const recovered = await signLaunchCheck(e, older);
  expect(recovered.battery).toBe("launch-check-v3");
  expect(recovered.replay).toEqual(older.replay);
  expect(recovered.payment_attempt?.settlement).toBe("unknown");
  expect(recovered.scope).toContain("retained observation");
  expect(recovered.scope).toContain("launch-check-v3");
});


it.each(["confirmed", "pending_finality"] as const)("explains exact %s evidence in the delivery note", async settlement => {
  const { report } = await walk([authorization(), transfer()], settlement === "pending_finality" ? { head: "0x61" } : {});
  const { launchCheckNote } = await import("@/store/copy/deliverables");
  const note = launchCheckNote(report.verdict, report.replay_served, report.tx_hash_status, report.replay?.outcome, report.payment_attempt);
  expect(note).toContain(`payment_attempt.settlement is ${settlement}`);
  expect(note).toContain("paired events");
  expect(note).not.toContain("settlement remains unknown");
});

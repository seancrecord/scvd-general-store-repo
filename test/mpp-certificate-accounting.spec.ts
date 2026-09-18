import { raiseCountersToRecords } from "@/services/counter-raise";
import { env, runInDurableObject } from "cloudflare:test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { certificatesWithoutSettleRecord, sweepBooksInvariants } from "@/services/books-invariants";
import { backfillPayerSettlesFromCertificates } from "@/services/payer-repair";
import { certificatesAgainstSettles } from "@/services/settle-sources";
import { certificateProtocol } from "@/services/certificate-accounting";
import type { CertificateRecord } from "@/types";
import { purchaseIntentStore, type PurchaseIntent } from "@/services/purchase-intent";
import { mppEvmPurchasePayment, x402PurchasePayment } from "@/lib/purchase-payment";
import { BASE_USDC } from "@/lib/base-rpc";
import { KV_KEYS } from "@/lib/kv-keys";
import type { PaymentRequirements } from "@x402/core/types";
import type { Env } from "@/types";
import { getMenuItem } from "@/store";

const bindings = env as unknown as Env;
const now = new Date("2026-09-16T12:00:00.000Z");
const month = now.toISOString().slice(0, 7);
const ledger = () => bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));
const marker = "private-buyer-material-must-not-escape";
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  for (const [kv, prefix] of [[bindings.PATRONS, KV_KEYS.certPrefix], [bindings.COUNTERS, "payer"],
    [bindings.COUNTERS, "metric:"], [bindings.COUNTERS, "alert_sent:"], [bindings.COUNTERS, "mpp:"]] as const) {
    const keys = await kv.list({ prefix });
    await Promise.all(keys.keys.map(key => kv.delete(key.name)));
  }
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

async function fixture(protocol: "mpp" | "x402" = "mpp", version: 1 | 2 = 2, payer = `0x${"11".repeat(20)}`) {
  const terms: PaymentRequirements = { scheme: "exact", network: "eip155:8453", asset: BASE_USDC,
    amount: "1000000", payTo: `0x${"22".repeat(20)}`, maxTimeoutSeconds: 300, extra: {} };
  const authorization = { from: payer, to: terms.payTo, value: terms.amount,
    nonce: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`, validAfter: "0", validBefore: "2000000000" };
  const payment_context = protocol === "mpp"
    ? await mppEvmPurchasePayment(terms, payer, authorization, "a".repeat(64))
    : await x402PurchasePayment(terms, payer, { payload: { authorization, signature: marker } });
  const record: PurchaseIntent = { version, id: payment_context.identity, token: marker, path: "/api/buy/context_anchor",
    door: "http", payer, terms, item: getMenuItem("context_anchor"), request: `summary=${marker}`, created_at: now.toISOString(), state: "settled",
    authorization: payment_context.authorization, payment_proof: payment_context.proof_digest,
    ...(version === 2 ? { payment_context, request_digest: "b".repeat(64) } : {}),
    payment: { transaction: `0x${crypto.randomUUID().replaceAll("-", "").repeat(2)}`, payer, network: terms.network, paidUsdc: 1, tipUsdc: 0,
      settleHeaders: protocol === "mpp" ? { "Payment-Receipt": marker } : { "PAYMENT-RESPONSE": marker } }, delivery: { secret_input: marker },
    ...(protocol === "mpp" ? { mpp: { challenge_id: marker, house: true, accounted: true as const } } : {}) };
  await save(record);
  return record;
}
async function save(record: PurchaseIntent) {
  await runInDurableObject(purchaseIntentStore(bindings, record.id), async (_instance, state) => { await state.storage.put("purchase", record); });
}
async function sale(record: PurchaseIntent, changed: Record<string, unknown> = {}) {
  const evidence = { id: record.id, month, payer: record.payer, transaction: record.payment!.transaction,
    amount: record.terms.amount, house: record.mpp!.house, ...changed };
  await runInDurableObject(ledger(), async (_instance, state) => {
    state.storage.sql.exec("CREATE TABLE IF NOT EXISTS mpp_sales (id TEXT PRIMARY KEY, evidence TEXT NOT NULL)");
    state.storage.sql.exec("INSERT INTO mpp_sales (id, evidence) VALUES (?, ?)", record.id, JSON.stringify(evidence));
  });
}


async function certificate(record: PurchaseIntent) {
  const cert: CertificateRecord = { certificate: { cert_id: `cert_${record.id.slice(0, 10)}`,
    patron_number: 1, item: "context_anchor", date: now.toISOString(), paid_usdc: 1, asset: "USDC",
    payer: record.payer, settlement_tx: record.payment!.transaction, network: record.terms.network },
    signature: "test", public_key: "test" };
  await bindings.PATRONS.put(KV_KEYS.cert(cert.certificate.cert_id), JSON.stringify(cert));
  const txStore = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`${record.terms.network}:${record.payment!.transaction}`));
  await runInDurableObject(txStore, async (_instance, state) => {
    await state.storage.put("artifact", { digest: "test", purchase: { path: record.path, payment: record.payment } });
  });
  return cert.certificate;
}

it("recognizes the native house test from individual evidence, not legacy records or summary counts", async () => {
  const record = await fixture(); const cert = await certificate(record); await sale(record);
  const result = await certificatesWithoutSettleRecord(bindings);
  expect(result.certificates).toEqual([]); expect(result.native).toEqual([]);
  expect(await bindings.COUNTERS.get(KV_KEYS.payerSettle(record.payer, record.payment!.transaction))).toBeNull();
  const repair = await backfillPayerSettlesFromCertificates(bindings);
  expect(repair.records_written).toBe(0);
  expect(repair.skipped_certificates).toEqual([{ cert_id: cert.cert_id, reason: "mpp" }]);
  expect(repair.counters_rebooked).toEqual([]);
  const comparison = await certificatesAgainstSettles(bindings, null);
  expect(comparison).toMatchObject({ native_certificates: 1, certificates_with_payer: 0, wallets_without_row: 0 });
});

it("keeps missing native accounting visible and refuses legacy repair", async () => {
  const record = await fixture(); const cert = await certificate(record);
  // An aggregate and the purchase's accounted flag cannot substitute for the sale.
  await bindings.COUNTERS.put(`mpp:sales:${month}`, JSON.stringify({ organic: 0, house: 1, organic_amount_atomic: "0", house_amount_atomic: "1000000" }));
  expect((await certificatesWithoutSettleRecord(bindings)).native).toEqual([{ cert_id: cert.cert_id, state: "missing" }]);
  const result = await sweepBooksInvariants(bindings);
  expect(result.breaches.some(text => text.startsWith("certificate-native-accounting:"))).toBe(true);
  expect(result.breaches.some(text => text.startsWith("certificate-without-settle:"))).toBe(false);
  expect((await backfillPayerSettlesFromCertificates(bindings)).records_written).toBe(0);
});

it("reports mismatched individual ledger evidence even with a legacy row present", async () => {
  const record = await fixture(); const cert = await certificate(record); await sale(record, { amount: "2000000" });
  await bindings.COUNTERS.put(KV_KEYS.payerSettle(record.payer, record.payment!.transaction), "{}");
  expect((await certificatesWithoutSettleRecord(bindings)).native).toEqual([{ cert_id: cert.cert_id, state: "mismatch" }]);
});

it("checks certificate amount against the retained sale", async () => {
  const record = await fixture(); const cert = await certificate(record); await sale(record);
  cert.paid_usdc = 2;
  await bindings.PATRONS.put(KV_KEYS.cert(cert.cert_id), JSON.stringify({ certificate: cert }));
  expect((await certificatesWithoutSettleRecord(bindings)).native[0]?.state).toBe("mismatch");
});

it("keeps unavailable protocol or ledger evidence distinct and does not repair it", async () => {
  const record = await fixture(); const cert = await certificate(record);
  const config = { ...bindings, PAID_RECOVERIES: undefined };
  expect((await certificatesWithoutSettleRecord(config)).native).toEqual([{ cert_id: cert.cert_id, state: "unavailable" }]);
  expect((await backfillPayerSettlesFromCertificates(config)).skipped_certificates).toEqual([{ cert_id: cert.cert_id, reason: "unavailable" }]);
  expect((await certificatesWithoutSettleRecord({ ...bindings, COUNTER_LEDGER: undefined })).native[0]?.state).toBe("unavailable");
  await sale(record);
  await runInDurableObject(ledger(), async (_instance, state) => { state.storage.sql.exec("UPDATE mpp_sales SET evidence = ?", "invalid-json"); });
  expect((await certificatesWithoutSettleRecord(bindings)).native[0]?.state).toBe("unavailable");
});

it("still finds and repairs an unbooked x402 Context Anchor", async () => {
  const record = await fixture("x402"); const cert = await certificate(record);
  expect(await certificateProtocol(bindings, cert)).toBe("x402");
  expect((await certificatesWithoutSettleRecord(bindings)).certificates[0]?.cert_id).toBe(cert.cert_id);
  expect((await backfillPayerSettlesFromCertificates(bindings)).records_written).toBe(1);
  expect((await certificatesWithoutSettleRecord(bindings)).certificates).toEqual([]);
});

it("refuses to classify missing, foreign or ambiguous transaction evidence as x402", async () => {
  const record = await fixture(); const cert = await certificate(record);
  const store = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`${record.terms.network}:${record.payment!.transaction}`));
  for (const payment of [
    { ...record.payment!, payer: `0x${"99".repeat(20)}` },
    { ...record.payment!, settleHeaders: {} },
    { ...record.payment!, settleHeaders: { "Payment-Receipt": marker, "PAYMENT-RESPONSE": marker } },
  ]) {
    await runInDurableObject(store, async (_instance, state) => {
      await state.storage.put("artifact", { digest: "test", purchase: { path: record.path, payment } });
    });
    expect(await certificateProtocol(bindings, cert)).toBe("unavailable");
    expect((await backfillPayerSettlesFromCertificates(bindings)).records_written).toBe(0);
  }
  await runInDurableObject(store, async (_instance, state) => { await state.storage.deleteAll(); });
  expect(await certificateProtocol(bindings, cert)).toBe("unavailable");
});

it("finds admission in the previous month and tolerates only a lost accounting acknowledgement", async () => {
  const record = await fixture(); const cert = await certificate(record);
  record.created_at = "2026-08-31T23:59:00.000Z"; delete record.mpp!.accounted; await save(record);
  const previous = bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName("2026-08/mpp-sales"));
  await runInDurableObject(previous, async (_instance, state) => {
    await state.storage.deleteAll();
    state.storage.sql.exec("CREATE TABLE mpp_sales (id TEXT PRIMARY KEY, evidence TEXT NOT NULL)");
    state.storage.sql.exec("INSERT INTO mpp_sales VALUES (?, ?)", record.id, JSON.stringify({ id: record.id,
      month: "2026-08", payer: record.payer, transaction: record.payment!.transaction, amount: record.terms.amount, house: true }));
  });
  expect((await certificatesWithoutSettleRecord(bindings)).native).toEqual([]);
  await sale(record);
  expect((await certificatesWithoutSettleRecord(bindings)).native).toEqual([{ cert_id: cert.cert_id, state: "mismatch" }]);
  await runInDurableObject(previous, async (_instance, state) => { await state.storage.deleteAll(); });
});

it("does not amplify a native sale mistakenly imported by an earlier legacy repair", async () => {
  const record = await fixture(); await certificate(record); await sale(record);
  await bindings.COUNTERS.put(KV_KEYS.payerSettle(record.payer, record.payment!.transaction), JSON.stringify({
    item: "context_anchor", at: now.toISOString(), transaction: record.payment!.transaction, source: "certificate" }));
  await bindings.COUNTERS.put(KV_KEYS.payer(record.payer), JSON.stringify({ address: record.payer,
    first_seen: now.toISOString(), last_seen: now.toISOString(), purchases: 0 }));
  expect((await certificatesWithoutSettleRecord(bindings)).native[0]?.state).toBe("legacy_overlap");
  expect((await backfillPayerSettlesFromCertificates(bindings)).rows_corrected).toEqual([]);
  const raised = await raiseCountersToRecords(bindings);
  expect(raised.organic_records).toBe(0); expect(raised.payer_rows_raised).toEqual([]);
});

/**
 * THE RESCUED SETTLE (2026-09-17, found reading #771 before it deployed).
 * The ambiguous-settle rescue relays no facilitator header, by design, so
 * a rescued x402 Context Anchor kept a coordinator record with empty settle
 * headers. Read by headers alone it was "unavailable" for good: paged
 * hourly as native accounting, skipped by the legacy repair, dropped from
 * the raise. The ledgers know what the headers do not.
 */
it("classifies a rescued x402 settle from its legacy record when no facilitator header was retained", async () => {
  const record = await fixture("x402"); const cert = await certificate(record);
  const store = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`${record.terms.network}:${record.payment!.transaction}`));
  await runInDurableObject(store, async (_instance, state) => {
    await state.storage.put("artifact", { digest: "test", purchase: { path: record.path, payment: { ...record.payment!, settleHeaders: {} } } });
  });
  await bindings.COUNTERS.put(KV_KEYS.payerSettle(record.payer, record.payment!.transaction),
    JSON.stringify({ item: "context_anchor", at: now.toISOString(), transaction: record.payment!.transaction }));
  expect(await certificateProtocol(bindings, cert)).toBe("x402");
  const result = await certificatesWithoutSettleRecord(bindings);
  expect(result.certificates).toEqual([]); expect(result.native).toEqual([]);
  expect((await raiseCountersToRecords(bindings)).organic_records).toBe(1);
  expect((await certificatesAgainstSettles(bindings, null)).certificates_with_payer).toBe(1);
});

it("classifies a native sale from its individual ledger when the coordinator record is absent", async () => {
  const record = await fixture(); const cert = await certificate(record); await sale(record);
  const store = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`${record.terms.network}:${record.payment!.transaction}`));
  await runInDurableObject(store, async (_instance, state) => { await state.storage.deleteAll(); });
  expect(await certificateProtocol(bindings, cert)).toBe("mpp");
  const result = await certificatesWithoutSettleRecord(bindings);
  expect(result.certificates).toEqual([]); expect(result.native).toEqual([]);
  expect((await backfillPayerSettlesFromCertificates(bindings)).skipped_certificates).toEqual([{ cert_id: cert.cert_id, reason: "mpp" }]);
});

it("keeps a settle neither ledger holds undetermined, and never reads an unreadable native ledger as legacy", async () => {
  const record = await fixture("x402"); const cert = await certificate(record);
  const store = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`${record.terms.network}:${record.payment!.transaction}`));
  await runInDurableObject(store, async (_instance, state) => {
    await state.storage.put("artifact", { digest: "test", purchase: { path: record.path, payment: { ...record.payment!, settleHeaders: {} } } });
  });
  expect(await certificateProtocol(bindings, cert)).toBe("unavailable");
  expect((await sweepBooksInvariants(bindings)).breaches.some(text => text.startsWith("certificate-native-accounting:"))).toBe(true);
  // A legacy record cannot decide it while the native ledger cannot be read.
  await bindings.COUNTERS.put(KV_KEYS.payerSettle(record.payer, record.payment!.transaction), "{}");
  expect(await certificateProtocol({ ...bindings, COUNTER_LEDGER: undefined }, cert)).toBe("unavailable");
  expect((await backfillPayerSettlesFromCertificates({ ...bindings, COUNTER_LEDGER: undefined })).skipped_certificates)
    .toEqual([{ cert_id: cert.cert_id, reason: "unavailable" }]);
});

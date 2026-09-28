import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { accountingContextFor, certificateProtocol } from "@/services/certificate-accounting";
import { certificatesAgainstSettles } from "@/services/settle-sources";
import { KV_KEYS } from "@/lib/kv-keys";
import type { CertificateRecord, Env } from "@/types";

/**
 * A WALK OVER THE SHELF NEVER OPENS ONE DURABLE OBJECT PER CERTIFICATE.
 *
 * From 2026-09-19 to 2026-09-28 certificateProtocol asked the settlement's
 * own retained store FIRST, on every call, before either ledger — so the
 * books check paid ~500 cold DO round trips serially and the Worker died
 * of its CPU budget (Cloudflare 1102) every time the keeper opened it.
 * The ledgers answer for a whole walk in one batch each; the retained
 * store is for the residue neither ledger holds, and a page that only
 * counts never asks it at all.
 *
 * The retained store is counted through a wrapper on the binding, so
 * the assertion is on the CALL, not on timing.
 */
const bindings = env as unknown as Env;
const now = new Date("2026-09-16T12:00:00.000Z");
const month = now.toISOString().slice(0, 7);
const network = "eip155:8453";
const ledger = () => bindings.COUNTER_LEDGER!.get(bindings.COUNTER_LEDGER!.idFromName(`${month}/mpp-sales`));

function counted(): { env: Env; reads: () => number } {
  let reads = 0;
  const real = bindings.PAID_RECOVERIES!;
  const spy = {
    idFromName: (name: string) => real.idFromName(name),
    get: (...args: Parameters<typeof real.get>) => { reads += 1; return real.get(...args); },
  } as unknown as Env["PAID_RECOVERIES"];
  return { env: { ...bindings, PAID_RECOVERIES: spy }, reads: () => reads };
}

let n = 0;
function transaction(): string {
  n += 1;
  return `0x${n.toString(16).padStart(64, "0")}`;
}

async function certificate(tx: string, payer = `0x${"11".repeat(20)}`) {
  const cert: CertificateRecord = { certificate: { cert_id: `cert_${tx.slice(-10)}`, patron_number: 1, item: "context_anchor",
    date: now.toISOString(), paid_usdc: 1, asset: "USDC", payer, settlement_tx: tx, network }, signature: "test", public_key: "test" };
  await bindings.PATRONS.put(KV_KEYS.cert(cert.certificate.cert_id), JSON.stringify(cert));
  return cert.certificate;
}
async function legacyRow(tx: string, payer = `0x${"11".repeat(20)}`) {
  await bindings.COUNTERS.put(KV_KEYS.payerSettle(payer, tx), JSON.stringify({ item: "context_anchor", at: now.toISOString(), transaction: tx }));
}
async function nativeSale(tx: string, payer = `0x${"11".repeat(20)}`) {
  const id = tx.slice(2);
  await runInDurableObject(ledger(), async (_instance, state) => {
    state.storage.sql.exec("CREATE TABLE IF NOT EXISTS mpp_sales (id TEXT PRIMARY KEY, evidence TEXT NOT NULL)");
    state.storage.sql.exec("INSERT INTO mpp_sales (id, evidence) VALUES (?, ?)", id,
      JSON.stringify({ id, month, payer, transaction: tx, amount: "1000000", house: true, item: "context_anchor" }));
  });
}
async function retained(tx: string, header: "Payment-Receipt" | "PAYMENT-RESPONSE", payer = `0x${"11".repeat(20)}`) {
  const store = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`${network}:${tx}`));
  await runInDurableObject(store, async (_instance, state) => {
    await state.storage.put("artifact", { digest: "test", purchase: { path: "/api/buy/context_anchor",
      payment: { transaction: tx, payer, network, paidUsdc: 1, tipUsdc: 0, settleHeaders: { [header]: "x" } } } });
  });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  for (const [kv, prefix] of [[bindings.PATRONS, KV_KEYS.certPrefix], [bindings.COUNTERS, "payer"], [bindings.COUNTERS, "mpp:"]] as const) {
    const keys = await kv.list({ prefix });
    await Promise.all(keys.keys.map(key => kv.delete(key.name)));
  }
  await runInDurableObject(ledger(), async (_instance, state) => { await state.storage.deleteAll(); });
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("classifies a booked certificate from the ledgers without opening its retained store", async () => {
  const x402 = transaction(); const mpp = transaction();
  const certX = await certificate(x402); await legacyRow(x402); await retained(x402, "PAYMENT-RESPONSE");
  const certM = await certificate(mpp); await nativeSale(mpp); await retained(mpp, "Payment-Receipt");
  const { env: spied, reads } = counted();
  const context = await accountingContextFor(spied, [certX, certM]);
  expect(await certificateProtocol(spied, certX, context)).toBe("x402");
  expect(await certificateProtocol(spied, certM, context)).toBe("mpp");
  expect(reads(), "a certificate both ledgers can place must not open its retained store").toBe(0);
});

it("still asks the retained store about the residue neither ledger holds, unless told it is only counting", async () => {
  const tx = transaction();
  const cert = await certificate(tx); await retained(tx, "PAYMENT-RESPONSE");
  const { env: spied, reads } = counted();
  const context = await accountingContextFor(spied, [cert]);
  expect(await certificateProtocol(spied, cert, context)).toBe("x402");
  expect(reads()).toBe(1);
  expect(await certificateProtocol(spied, cert, { ...context, consultRetained: false })).toBe("unavailable");
  expect(reads(), "a counting read never opens the retained store").toBe(1);
});

it("lets the retained store speak when the native ledger cannot be read, and never a legacy row", async () => {
  const tx = transaction();
  const cert = await certificate(tx); await legacyRow(tx); await retained(tx, "Payment-Receipt");
  const blind = { ...bindings, COUNTER_LEDGER: undefined } as Env;
  expect(await certificateProtocol(blind, cert)).toBe("mpp");
  const store = bindings.PAID_RECOVERIES!.get(bindings.PAID_RECOVERIES!.idFromName(`${network}:${tx}`));
  await runInDurableObject(store, async (_instance, state) => { await state.storage.deleteAll(); });
  expect(await certificateProtocol(blind, cert)).toBe("unavailable");
});

it("the books check's certificate shelf reads the ledgers in batch and the retained store never", async () => {
  const payer = `0x${"33".repeat(20)}`;
  for (let i = 0; i < 12; i += 1) {
    const tx = transaction();
    await certificate(tx, payer);
    if (i % 3 === 0) await nativeSale(tx, payer);
    else if (i % 3 === 1) await legacyRow(tx, payer);
    await retained(tx, i % 3 === 0 ? "Payment-Receipt" : "PAYMENT-RESPONSE", payer);
  }
  const { env: spied, reads } = counted();
  const shelf = await certificatesAgainstSettles(spied, null);
  expect(reads(), "the books check must not open one Durable Object per certificate").toBe(0);
  expect(shelf.retained_records_consulted).toBe(false);
  expect(shelf.native_certificates).toBe(4);
  expect(shelf.certificates_with_payer).toBe(4);
  expect(shelf.protocol_unavailable).toBe(4);
  expect(shelf.reading).toContain("never the per-settlement retained record");
});

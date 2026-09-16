import { purchaseIntentStore, purchaseProtocol, type PurchaseIntent } from "@/services/purchase-intent";
import { settlementAssetMetadata } from "@/lib/payments";
import { isRecord, type Env } from "@/types";
import { mppSaleEvidence } from "@/services/mpp-sales";

export const validPurchaseId = (id: string) => /^[a-f0-9]{64}$/.test(id);
type LedgerState = "matched" | "missing" | "mismatch" | "unavailable" | "not_inspected";
export interface PurchaseInspection {
  purchase_id: string;
  protocol: "x402" | "mpp";
  method: string;
  network: string;
  asset: string;
  currency: string | null;
  decimals: number | null;
  amount_atomic: string;
  payer: string;
  recipient: string;
  created_at: string;
  path: string;
  door: "http" | "mcp";
  payment_state: PurchaseIntent["state"];
  transaction: string | null;
  delivery_state: "delivered" | "order_created" | "not_established_by_this_record";
  house: boolean | null;
  accounting_recorded: boolean | null;
  ledger: { state: LedgerState; month?: string; mismatched_fields?: string[];
    sale?: { purchase_id: string; month: string; payer: string; transaction: string; amount_atomic: string; house: boolean } };
  accounting_check: "confirmed" | "acknowledgement_pending" | "missing" | "inconsistent" | "awaiting_settlement_evidence" | "not_due" | "unavailable" | "not_inspected";
}
export interface InspectionResult {
  status: 200 | 400 | 404 | 503;
  body: { code: string; read_at: string; purchase?: PurchaseInspection; note: string };
}

/** Two bounded point reads. No status/recovery helper here: some resume work. */
export async function inspectPurchase(env: Env, id: string): Promise<InspectionResult> {
  const read_at = new Date().toISOString();
  const failure = (status: InspectionResult["status"], code: string, note: string): InspectionResult => ({ status, body: { code, read_at, note } });
  if (!validPurchaseId(id)) return failure(400, "invalid_purchase_id", "Enter the 64-character purchase ID from the purchase recovery handle.");
  let record: PurchaseIntent;
  let purchase: PurchaseInspection;
  try {
    const raw = await purchaseIntentStore(env, id).existingPurchase();
    if (raw === null) return failure(404, "purchase_not_found", "No purchase record was found for this ID. This does not establish whether a payment occurred elsewhere.");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.id !== id) throw new Error("Invalid purchase record");
    record = parsed as unknown as PurchaseIntent; // Persisted versioned record, checked below and by purchaseProtocol.
    const protocol = purchaseProtocol(record);
    if (!["unknown", "settled", "not_settled"].includes(record.state) || !["http", "mcp"].includes(record.door) ||
      !/^\d{4}-(0[1-9]|1[0-2])-\d{2}T/.test(record.created_at) || !Number.isFinite(Date.parse(record.created_at)) ||
      ![record.path, record.payer, record.terms.network, record.terms.asset, record.terms.payTo].every(value => typeof value === "string" && value.length > 0 && value.length <= 512) ||
      !/^\d+$/.test(record.terms.amount) || (record.payment && typeof record.payment.transaction !== "string") ||
      (protocol === "mpp" && (typeof record.mpp?.house !== "boolean" || (record.mpp.accounted !== undefined && record.mpp.accounted !== true)))) throw new Error("Invalid purchase facts");
    if (protocol === "mpp" && record.state === "settled") {
      mppSaleEvidence(record);
      if (record.payment?.network !== record.terms.network || record.payment.payer !== record.payer) throw new Error("Settlement facts disagree");
    }
    const metadata = settlementAssetMetadata(record.terms.network, record.terms.asset);
    const delivered = !!record.delivery || (record.state === "settled" && !!record.payment && !!record.publication);
    // Explicit projection: no request, goods, token, proof, authorization or headers.
    purchase = { purchase_id: id, protocol, method: record.version === 2 ? record.payment_context!.method : record.terms.scheme,
      network: record.terms.network, asset: record.terms.asset, currency: metadata?.symbol ?? null,
      decimals: metadata?.decimals ?? null, amount_atomic: record.terms.amount,
      payer: record.payer, recipient: record.terms.payTo, created_at: record.created_at, path: record.path, door: record.door,
      payment_state: record.state, transaction: record.payment?.transaction ?? null,
      delivery_state: delivered ? record.item?.fulfillment === "human_queue" ? "order_created" : "delivered" : "not_established_by_this_record",
      house: protocol === "mpp" ? record.mpp!.house : null,
      accounting_recorded: protocol === "mpp" ? record.mpp!.accounted === true : null,
      ledger: { state: "not_inspected" }, accounting_check: "not_inspected" };
  } catch {
    return failure(503, "purchase_inspection_unavailable", "The purchase record could not be read or validated. No absence or payment outcome is inferred.");
  }
  if (purchase.protocol === "x402") return { status: 200, body: { code: "purchase_inspected", read_at, purchase,
    note: "Retained x402 purchase facts. Legacy accounting is not inspected by this lookup; no accounting success is inferred from delivery." } };
  const month = record.created_at.slice(0, 7);
  try {
    if (!env.COUNTER_LEDGER) throw new Error("Ledger unavailable");
    const raw = await env.COUNTER_LEDGER.get(env.COUNTER_LEDGER.idFromName(`${month}/mpp-sales`)).readMppSale(id);
    if (raw === null) {
      purchase.ledger = { state: "missing", month };
      purchase.accounting_check = purchase.accounting_recorded ? "inconsistent" : record.state === "settled" ? "missing"
        : record.state === "unknown" ? "awaiting_settlement_evidence" : "not_due";
    } else {
      const sale: unknown = JSON.parse(raw);
      if (!isRecord(sale) || ![sale.id, sale.month, sale.payer, sale.transaction, sale.amount].every(value => typeof value === "string") || typeof sale.house !== "boolean") throw new Error("Invalid ledger evidence");
      const expected = record.state === "settled" ? mppSaleEvidence(record) :
        { id, month, payer: record.payer, transaction: record.payment?.transaction, amount: record.terms.amount, house: record.mpp!.house };
      const mismatched_fields = Object.entries(expected).filter(([key, value]) => sale[key] !== value).map(([key]) => key);
      if (record.state !== "settled") mismatched_fields.push("payment_state");
      purchase.ledger = { state: mismatched_fields.length ? "mismatch" : "matched", month, mismatched_fields,
        sale: { purchase_id: String(sale.id), month: String(sale.month), payer: String(sale.payer),
          transaction: String(sale.transaction), amount_atomic: String(sale.amount), house: sale.house } };
      purchase.accounting_check = mismatched_fields.length ? "inconsistent" : purchase.accounting_recorded ? "confirmed" : "acknowledgement_pending";
    }
  } catch {
    purchase.ledger = { state: "unavailable", month };
    purchase.accounting_check = "unavailable";
    return { status: 503, body: { code: "purchase_ledger_unavailable", read_at, purchase,
      note: "The purchase was read, but its native ledger evidence could not be read or validated. No missing sale is inferred." } };
  }
  return { status: 200, body: { code: "purchase_inspected", read_at, purchase,
    note: "Two retained records, read separately; a concurrent settlement or accounting acknowledgement can change the next reading. This is store evidence, not independent chain verification. This lookup performs no repair." } };
}

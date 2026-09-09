import type { CaseFileRecord } from "@/services/case-file";
import { CASE_FILE_IDEMPOTENT_SECONDS } from "@/services/case-file";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import type { Env } from "@/types";

/** One coordinator per complete question. The public file keeps its first
 * certificate; subsequent purchases get their own immutable certificate link.
 * Recovery republishes retained records without renewing the assembly window.
 */
export class CaseFilePublicationStore {
  private publication: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: DurableObjectStorage, private readonly env: Env) {}

  async latest(): Promise<CaseFileRecord | null> {
    return await this.storage.get<CaseFileRecord>("case:latest") ?? null;
  }

  async publish(query: string, proposal: CaseFileRecord): Promise<CaseFileRecord> {
    const work = this.publication.catch(() => undefined).then(async () => {
      const caseKey = KV_KEYS.caseFile(proposal.case.case_id);
      const purchaseKey = KV_KEYS.caseFilePurchase(proposal.case.case_id, proposal.cert_id);
      const seed = await kvGetJson<CaseFileRecord>(this.env.PATRONS, caseKey, "json");
      const selected = await this.storage.transaction(async txn => {
        const priorQuery = await txn.get<string>("case:query");
        if (priorQuery && priorQuery !== query) throw new Error("Case File question mismatch");
        const canonical = await txn.get<CaseFileRecord>(caseKey) ?? seed ?? proposal;
        const purchase = await txn.get<CaseFileRecord>(purchaseKey) ?? proposal;
        if (JSON.stringify(canonical.case) !== JSON.stringify(proposal.case) ||
          JSON.stringify(purchase.case) !== JSON.stringify(proposal.case) || purchase.cert_id !== proposal.cert_id) {
          throw new Error("Case File purchase mismatch");
        }
        const prior = await txn.get<CaseFileRecord>("case:latest");
        const latest = prior && (prior.case.assembled_at > proposal.case.assembled_at ||
          prior.case.assembled_at === proposal.case.assembled_at && prior.case.case_id >= proposal.case.case_id)
          ? prior : canonical;
        await txn.put("case:query", query);
        await txn.put(caseKey, canonical);
        await txn.put(purchaseKey, purchase);
        await txn.put("case:latest", latest);
        return { canonical, purchase, latest };
      });
      // KV is a projection. An interrupted write is retried from these durable
      // records, including the original per-purchase creation date.
      await kvPut(this.env.PATRONS, caseKey, JSON.stringify(selected.canonical));
      await kvPut(this.env.PATRONS, purchaseKey, JSON.stringify(selected.purchase));
      const remaining = Math.ceil((Date.parse(selected.latest.case.assembled_at) + CASE_FILE_IDEMPOTENT_SECONDS * 1000 - Date.now()) / 1000);
      if (remaining > 0) {
        await kvPut(this.env.PATRONS, KV_KEYS.caseFileQuery(query), selected.latest.case.case_id,
          { expirationTtl: Math.max(60, remaining) });
      }
      return selected.purchase;
    });
    this.publication = work.then(() => undefined, () => undefined);
    return await work;
  }
}

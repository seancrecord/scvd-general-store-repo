import { PatronageRecoveryStore, type PatronageGrantInput } from "@/services/patronage-recovery";
import { LaunchCheckStore } from "@/services/launch-check-recovery";
import { WatchRecoveryStore, type RecoverableWatch } from "@/services/watch-recovery";
import { PersonalGoodsStore, type PersonalRecord, type PersonalMutation } from "@/services/personal-goods";
import { CaseFilePublicationStore } from "@/services/case-file-publication";
import type { CaseFileRecord } from "@/services/case-file";
import { PatronAnchorStore, type PatronAnchorRecord } from "@/services/patron-anchors";
import { humanResolutionKey, type HumanResolutionRecord } from "@/services/human-resolution-record";
import { HostedObservationStore, type HostedObservation, type HostedPurchase } from "@/services/hosted-observation";
import type { SignedPassportRefresh } from "@/services/passport-refresh";
import { recordDeliveredSettlement } from "@/services/settlement-records";
import { closeDeliveryIntent } from "@/services/delivery-audit";
import { purchaseRecoveryAlarmAt } from "@/lib/purchase-recovery-clock";
import { supportsArtifactRecovery } from "@/lib/artifact-checkpoint";
import { evmChainOf } from "@/lib/base-rpc";
import type { PurchaseIntent } from "@/services/purchase-intent";
import { DurableObject } from "cloudflare:workers";
import type { SettledPayment } from "@/lib/payments";
import { kvPut } from "@/lib/kv-retry";
import { KV_KEYS } from "@/lib/kv-keys";
import type { OrderMutation, ManagedOrderState } from "@/services/managed-orders";
import type { OrderRecord, Env } from "@/types";

export interface ArtifactPurchase {
  digest: string;
  purchase: { path: string; payment: SettledPayment };
}
export interface RecoveryIdentity {
  path: string; payer: string; network: string; transaction: string;
}
export type ArtifactStage = "opening_day" | "watch_record" | "confession_receipt" | "personal_record" | "identity" | "patron_start" | "patron_number" | "certificate" | "anchor" | "response" | "credit_started" | "credit" | "order" | "fulfillment" | "instant_goods";

function owns(purchase: ArtifactPurchase["purchase"], identity: RecoveryIdentity): boolean {
  const payer = purchase.payment.payer;
  const samePayer = identity.network.startsWith("eip155:")
    ? payer?.toLowerCase() === identity.payer.toLowerCase() : payer === identity.payer;
  return samePayer && purchase.path === identity.path &&
    purchase.payment.network === identity.network && purchase.payment.transaction === identity.transaction;
}

interface RecoveryAttempt {
  digest: string;
  token: string;
  response?: string;
  purchase?: { path: string; payment: SettledPayment };
}
export type RecoveryClaim =
  | { kind: "claimed"; token: string }
  | { kind: "replay"; response: string }
  | { kind: "unavailable" };

/**
 * Transaction instances coordinate fulfillment; order-prefixed instances
 * serialize mutable order state. KV alone cannot authorize a
 * re-mint: two edges can both read "no certificate" before either writes.
 * The claim is durable before fulfillment starts and never expires into
 * permission to mint again. An interrupted recovery without a saved result
 * stays on the delivery desk; resolving those partial writes is separate
 * from safely starting the first reconstruction.
 */
export class PaidRecoveryStore extends DurableObject<Env> {
  async readHumanResolution(key: string): Promise<string | null> {
    const record = await this.ctx.storage.get<HumanResolutionRecord>(`human-resolution:${key}`);
    return record ? JSON.stringify(record) : null;
  }

  async findHumanResolution(transaction: string): Promise<string | null> {
    const key = await this.ctx.storage.get<string>(`human-transaction:${transaction.startsWith("0x") ? transaction.toLowerCase() : transaction}`);
    return key ? this.readHumanResolution(key) : null;
  }

  async saveHumanResolution(proposalJson: string, expectedRevision: number): Promise<string> {
    const proposal = JSON.parse(proposalJson) as HumanResolutionRecord;
    return this.ctx.blockConcurrencyWhile(async () => {
      const result = await this.ctx.storage.transaction(async txn => {
        const statement = proposal.statement;
        const key = humanResolutionKey(statement.network, statement.transaction);
        const row = `human-resolution:${key}`;
        const prior = await txn.get<HumanResolutionRecord>(row);
        if (prior?.request_digest === proposal.request_digest) return { ok: true, record: prior };
        if ((prior?.statement.revision ?? 0) !== expectedRevision || statement.revision !== expectedRevision + 1 ||
          statement.previous_signature !== prior?.signature) return { ok: false, refusal: "The resolution changed. Read it before submitting a correction." };
        if (statement.outcome === "refunded") {
          const refund = statement.evidence.refund_tx;
          if (typeof refund !== "string") return { ok: false, refusal: "Refund evidence is missing." };
          const claim = `human-refund:${humanResolutionKey(statement.network, refund)}`;
          const owner = await txn.get<string>(claim);
          if (owner && owner !== key) return { ok: false, refusal: "That refund already resolves another purchase." };
          await txn.put(claim, key);
        }
        const record = { ...proposal, ...(prior ? { previous: prior } : {}) };
        await txn.put(row, record);
        await txn.put(`human-transaction:${statement.transaction.startsWith("0x") ? statement.transaction.toLowerCase() : statement.transaction}`, key);
        return { ok: true, record };
      });
      if (result.ok && result.record) {
        const tx = result.record.statement.transaction;
        await kvPut(this.env.ORDERS, `delivery_resolved:${tx}`, JSON.stringify({ ...result.record,
          outcome: result.record.statement.outcome, at: result.record.statement.recorded_at,
          corrected: result.record.statement.revision > 1 }));
        await closeDeliveryIntent(this.env, KV_KEYS.deliveryIntent(tx));
      }
      return JSON.stringify(result);
    });
  }
  private readonly patronage = new PatronageRecoveryStore(this.ctx.storage, this.env);
  grantPatronage(input: PatronageGrantInput) { return this.patronage.grant(input); }
  readPatronage(passId: string) { return this.patronage.read(passId); }

  private readonly launch = new LaunchCheckStore(this.ctx.storage, this.env);
  prepareLaunchCheck(path: string, digest: string, url: string) { return this.launch.run(path, digest, url); }

  private readonly watches = new WatchRecoveryStore(this.ctx.storage, this.env);
  publishWatch(value: RecoverableWatch) { return this.watches.publish(value); }

  private readonly personalGoods = new PersonalGoodsStore(this.ctx.storage, this.env);
  publishPersonalRecord(value: PersonalRecord, mutation?: PersonalMutation) { return this.personalGoods.publish(value, mutation); }

  private readonly caseFile = new CaseFilePublicationStore(this.ctx.storage, this.env);
  latestCaseFile() { return this.caseFile.latest(); }
  publishCaseFile(query: string, record: CaseFileRecord) { return this.caseFile.publish(query, record); }

  private readonly patronAnchor = new PatronAnchorStore(this.ctx.storage, this.env);
  publishPatronAnchor(record: PatronAnchorRecord) { return this.patronAnchor.publish(record); }

  private readonly hosted = new HostedObservationStore(this.ctx.storage, this.env);

  readHostedGrant(purchase: HostedPurchase) { return this.hosted.read(purchase); }
  retainHostedRefresh(purchase: HostedPurchase, report: SignedPassportRefresh) { return this.hosted.retainRefresh(purchase, report); }
  prepareHostedProfile(purchase: HostedPurchase, url: string, at: string) { return this.hosted.prepareProfile(purchase, url, at); }
  publishHostedObservation(observation: HostedObservation) { return this.hosted.publish(observation); }

  // First prepared bytes win, including simultaneous requests with one payment.
  // A mismatched question cannot replace them or use them to buy a different good.
  async retainObservation(path: string, digest: string, proposal?: string): Promise<string | null> {
    return this.ctx.storage.transaction(async txn => {
      const prior = await txn.get<{ path: string; digest: string; value: string }>("observation");
      if (prior) {
        if (prior.path !== path || prior.digest !== digest) throw new Error("Observation input mismatch");
        return prior.value;
      }
      if (proposal === undefined) return null;
      if (await txn.get("purchase")) throw new Error("Cannot observe after settlement admission");
      JSON.parse(proposal);
      await txn.put("observation", { path, digest, value: proposal });
      return proposal;
    });
  }

  /**
   * One keyed purchase owns one payment identity. This claim cannot expire
   * into a new charge while the original payment is unresolved. The owner
   * may resume after a lost claim reply; beginPurchase still admits its
   * settlement only once. A different authorization can only read status.
   */
  async readIdempotentPurchase(): Promise<string | null> {
    return await this.ctx.storage.get<string>("idempotent-purchase") ?? null;
  }

  async claimIdempotentPurchase(purchaseId: string): Promise<string> {
    return this.ctx.storage.transaction(async txn => {
      const prior = await txn.get<string>("idempotent-purchase");
      if (prior) return prior;
      await txn.put("idempotent-purchase", purchaseId);
      return purchaseId;
    });
  }

  async beginPurchase(proposalJson: string): Promise<{ started: boolean; record: string }> {
    const proposal = JSON.parse(proposalJson) as PurchaseIntent;
    return this.ctx.storage.transaction(async (txn) => {
      const prior = await txn.get<PurchaseIntent>("purchase");
      if (prior) {
        if (!prior.delivery && prior.state !== "not_settled" && !await txn.getAlarm()) await txn.setAlarm(purchaseRecoveryAlarmAt(60_000));
        return { started: false, record: JSON.stringify(prior) };
      }
      if (proposal.observation_digest) {
        const observation = await txn.get<{ path: string; digest: string }>("observation");
        if (!observation || observation.path !== proposal.path || observation.digest !== proposal.observation_digest) {
          throw new Error("Original observation must precede settlement");
        }
      }
      await txn.put("purchase", proposal);
      // The obligation and its wake-up commit together, before settlement.
      await txn.setAlarm(purchaseRecoveryAlarmAt(60_000));
      return { started: true, record: JSON.stringify(proposal) };
    });
  }

  /** Internal lookup: the gate has authenticated the payment identity. */
  async existingPurchase(): Promise<string | null> {
    const record = await this.ctx.storage.get<PurchaseIntent>("purchase");
    return record ? JSON.stringify(record) : null;
  }

  async readPurchase(token: string): Promise<string | null> {
    const record = await this.ctx.storage.get<PurchaseIntent>("purchase");
    if (!record || token.length !== record.token.length) return null;
    const bytes = new TextEncoder();
    return crypto.subtle.timingSafeEqual(bytes.encode(token), bytes.encode(record.token)) ? JSON.stringify(record) : null;
  }

  async updatePurchase(update: { state?: PurchaseIntent["state"]; payment?: SettledPayment; reconciliation_reference?: string }): Promise<void> {
    await this.ctx.storage.transaction(async (txn) => {
      const prior = await txn.get<PurchaseIntent>("purchase");
      if (!prior) throw new Error("Purchase record missing");
      // Confirmed outcomes never regress to uncertainty on a delayed writer.
      if (prior.state !== "unknown" && update.state) return;
      await txn.put("purchase", { ...prior, ...update });
    });
  }

  async schedulePurchaseRecovery(): Promise<void> {
    await this.ctx.storage.transaction(async (txn) => {
      const record = await txn.get<PurchaseIntent>("purchase");
      if (record && !record.delivery && record.state !== "not_settled" && !await txn.getAlarm()) {
        await txn.setAlarm(purchaseRecoveryAlarmAt(60_000));
      }
    });
  }

  async alarm(): Promise<void> {
    if (await this.watches.repair()) return;
    if (await this.patronage.repair()) return;
    const record = await this.ctx.storage.get<PurchaseIntent>("purchase");
    if (!record || record.delivery || record.state === "not_settled") return;
    // Unsupported goods/unknown rails retain their record for the delivery
    // desk. Do not schedule an endless no-op for every successful sale.
    if (record.state === "settled" && !record.publication && !supportsArtifactRecovery(record.item)) return;
    if (record.state === "unknown" && !record.solana && (!record.authorization || !evmChainOf(record.terms.network))) return;
    // Re-arm BEFORE external I/O: an outage or interrupted execution cannot
    // exhaust the platform's finite automatic retries and abandon the buyer.
    await this.ctx.storage.setAlarm(purchaseRecoveryAlarmAt(300_000));
    try {
      const { reconcilePurchase, deliverRecordedPurchase } = await import("@/services/purchase-reconciliation");
      const update = await reconcilePurchase(this.env, record);
      if (update.payment) await this.updatePurchase({ state: "settled", payment: update.payment });
      if (update.reconciliation) await this.ctx.storage.transaction(async (txn) => {
        const latest = await txn.get<PurchaseIntent>("purchase");
        if (latest) {
          await txn.put("purchase", { ...latest, reconciliation: update.reconciliation });
        }
      });
      const latest = await this.ctx.storage.get<PurchaseIntent>("purchase");
      if (!latest || latest.state !== "settled") return;
      const { recordedHumanResolution } = await import("@/services/resolved-human-purchase");
      if (await recordedHumanResolution(this.env, latest)) {
        await this.ctx.storage.deleteAlarm();
        return;
      }
      const delivery = await deliverRecordedPurchase(this.env, latest);
      if (!delivery) return;
      await this.ctx.storage.transaction(async (txn) => {
        const current = await txn.get<PurchaseIntent>("purchase");
        if (!current || current.state !== "settled") return;
        await txn.put("purchase", { ...current, delivery });
        await txn.deleteAlarm();
      });
      // The status handle now retrieves the good. Clear the old desk only
      // after that durable result exists; bookkeeping cannot block retrieval.
      await recordDeliveredSettlement(this.env, latest.payment?.transaction);
      if (latest.payment?.transaction) await closeDeliveryIntent(this.env, KV_KEYS.deliveryIntent(latest.payment.transaction)).catch(() => undefined);
    } catch {
      // No raw error or buyer input in logs. The durable obligation remains
      // unresolved and the scheduled retry resumes the same artifact journal.
    }
  }

  async begin(digest: string, purchase?: RecoveryAttempt["purchase"]): Promise<RecoveryClaim> {
    return this.ctx.storage.transaction(async (txn) => {
      if (await txn.get("artifact")) return { kind: "unavailable" };
      const prior = await txn.get<RecoveryAttempt>("attempt");
      if (prior) {
        if (prior.digest === digest && prior.response !== undefined) {
          return { kind: "replay", response: prior.response };
        }
        return { kind: "unavailable" };
      }
      const token = crypto.randomUUID();
      await txn.put("attempt", { digest, token, purchase } satisfies RecoveryAttempt);
      return { kind: "claimed", token };
    });
  }

  /** Read-only: a missing result must never acquire permission to mint. */
  async readCompleted(identity: { path: string; payer: string; network: string; transaction: string }): Promise<{
    digest: string; response: string; payment: SettledPayment;
  } | null> {
    const prior = await this.ctx.storage.get<RecoveryAttempt>("attempt");
    const purchase = prior?.purchase;
    if (!prior || prior.response === undefined || !purchase ||
      purchase.path !== identity.path ||
      purchase.payment.payer?.toLowerCase() !== identity.payer.toLowerCase() ||
      purchase.payment.network !== identity.network ||
      purchase.payment.transaction !== identity.transaction) return null;
    return { digest: prior.digest, response: prior.response, payment: purchase.payment };
  }

  async complete(token: string, response: string): Promise<boolean> {
    return this.ctx.storage.transaction(async (txn) => {
      const prior = await txn.get<RecoveryAttempt>("attempt");
      if (!prior || prior.token !== token || prior.response !== undefined) {
        return false;
      }
      await txn.put("attempt", { ...prior, response });
      return true;
    });
  }

  /** Immutable goods use checkpoints; legacy unfinished claims remain closed. */
  async openArtifact(record: ArtifactPurchase): Promise<boolean> {
    const network = record.purchase.payment.network;
    if (!network || !record.purchase.payment.transaction || !record.purchase.payment.payer) return false;
    return this.ctx.storage.transaction(async (txn) => {
      if (await txn.get("attempt")) return false;
      const prior = await txn.get<ArtifactPurchase>("artifact");
      if (prior) return prior.digest === record.digest && owns(prior.purchase, {
        path: record.purchase.path, payer: record.purchase.payment.payer ?? "",
        network, transaction: record.purchase.payment.transaction,
      });
      await txn.put("artifact", record);
      return true;
    });
  }

  async readArtifact(identity: RecoveryIdentity): Promise<ArtifactPurchase | null> {
    const prior = await this.ctx.storage.get<ArtifactPurchase>("artifact");
    return prior && owns(prior.purchase, identity) ? prior : null;
  }

  /** First committed bytes win. Callers must publish the returned value. */
  async artifactStage(digest: string, stage: ArtifactStage, proposal?: string): Promise<string | null> {
    return this.ctx.storage.transaction(async (txn) => {
      const prior = await txn.get<ArtifactPurchase>("artifact");
      if (!prior || prior.digest !== digest) return null;
      const key = `artifact:${stage}`;
      const saved = await txn.get<string>(key);
      if (saved !== undefined) return saved;
      if (proposal === undefined) return null;
      JSON.parse(proposal);
      await txn.put(key, proposal);
      return proposal;
    });
  }

  /** Credit already fails soft; interruption must never award it twice. */
  async claimArtifactCredit(digest: string): Promise<boolean> {
    return this.ctx.storage.transaction(async (txn) => {
      const prior = await txn.get<ArtifactPurchase>("artifact");
      if (!prior || prior.digest !== digest) return false;
      if (await txn.get("artifact:credit_started")) return false;
      await txn.put("artifact:credit_started", true);
      return true;
    });
  }

  async readOrder(): Promise<ManagedOrderState | null> {
    return await this.ctx.storage.get<ManagedOrderState>("order") ?? null;
  }

  /**
   * Per-order instances serialize both state changes and their KV publication.
   * KV I/O yields: without this gate an old queued write could finish AFTER
   * a human's completion. No callback/network work runs inside this gate.
   */
  async writeOrder(seed: OrderRecord, mutation?: OrderMutation): Promise<ManagedOrderState | null> {
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (!seed.managed_order) return null;
        let state = await this.ctx.storage.get<ManagedOrderState>("order");
        if (!state) state = { order: seed, completion: 0 };
        if (state.order.order_id !== seed.order_id || state.order.cert_id !== seed.cert_id) return null;
        if (mutation?.kind === "acknowledge") state.order.acknowledged_at = mutation.at;
        if (mutation?.kind === "complete") {
          if (state.order.commission && !mutation.proof) return null;
          if (mutation.proof) state.order.completion_proof = mutation.proof;
          else delete state.order.completion_proof;
          state.order.status = "completed";
          state.order.deliverable = mutation.deliverable;
          state.order.completed_at = mutation.at;
          delete state.order.webhook;
          state.completion++;
        }
        if (mutation?.kind === "webhook" && mutation.completion === state.completion) {
          state.order.webhook = mutation.result;
        }
        await this.ctx.storage.put("order", state);
        await kvPut(this.env.ORDERS, KV_KEYS.order(state.order.order_id), JSON.stringify(state.order));
        return state;
      } catch {
        // Keep the committed state for retry without resetting the object.
        return null;
      }
    });
  }

}

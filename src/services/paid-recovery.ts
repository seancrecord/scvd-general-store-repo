import { DurableObject } from "cloudflare:workers";
import type { SettledPayment } from "@/lib/payments";
import type { Env } from "@/types";

export interface ArtifactPurchase {
  digest: string;
  purchase: { path: string; payment: SettledPayment };
}
export interface RecoveryIdentity {
  path: string; payer: string; network: string; transaction: string;
}
export type ArtifactStage = "identity" | "patron_start" | "patron_number" | "certificate" | "anchor" | "response" | "credit_started" | "credit";

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
 * One coordinator per settled transaction. KV alone cannot authorize a
 * re-mint: two edges can both read "no certificate" before either writes.
 * The claim is durable before fulfillment starts and never expires into
 * permission to mint again. An interrupted recovery without a saved result
 * stays on the delivery desk; resolving those partial writes is separate
 * from safely starting the first reconstruction.
 */
export class PaidRecoveryStore extends DurableObject<Env> {
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

}

import { sha256Hex } from "@/lib/idempotency";
import type { ArtifactStage } from "@/services/paid-recovery";
import type { Env, MenuItem } from "@/types";

export interface ArtifactCheckpoint {
  read<T>(stage: ArtifactStage): Promise<T | null>;
  save<T>(stage: ArtifactStage, value: T): Promise<T>;
  claimCredit(): Promise<boolean>;
}

export function artifactCheckpoint(env: Env, network: string, transaction: string, digest: string): ArtifactCheckpoint {
  const namespace = env.PAID_RECOVERIES;
  if (!namespace) throw new Error("Paid artifact coordinator unavailable");
  const stub = namespace.get(namespace.idFromName(`${network}:${transaction}`));
  return {
    async read<T>(stage: ArtifactStage): Promise<T | null> {
      const value = await stub.artifactStage(digest, stage);
      return value === null ? null : JSON.parse(value) as T;
    },
    async save<T>(stage: ArtifactStage, value: T): Promise<T> {
      const saved = await stub.artifactStage(digest, stage, JSON.stringify(value));
      if (saved === null) throw new Error("Paid artifact checkpoint missing");
      return JSON.parse(saved) as T;
    },
    claimCredit: () => stub.claimArtifactCredit(digest),
  };
}

/** Bind all query bytes, including duplicates, without persisting payment signatures. */
export async function httpArtifactDigest(url: string): Promise<string> {
  const query = new URL(url).searchParams;
  query.delete("payment_payload");
  query.sort();
  return sha256Hex(query.toString());
}

/** These goods have no inventory, timed service or external observation to
 * reconstruct. Their selected text and certificate can be retained together.
 * Keep this explicit: a new instant item is not automatically safe to resume.
 */
export function supportsSimpleInstantRecovery(item: MenuItem): boolean {
  return item.fulfillment === "instant" && ["hello", "certificate_of_patronage", "small_blessing", "daily_fortune"].includes(item.id);
}

/** Stocked goods consume external inventory; their recovery needs a separate journal. */
export function supportsArtifactRecovery(item: MenuItem | undefined): boolean {
  return !!item && (supportsSimpleInstantRecovery(item) || item.id === "context_anchor" || (item.fulfillment === "human_queue" && !item.stocked));
}

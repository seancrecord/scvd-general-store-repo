import { DurableObject } from "cloudflare:workers";
import type { Env } from "@/types";
import type { EvidenceArtifact } from "@/services/a2a-evidence";

export const A2A_TASK_TTL_SECONDS = 24 * 60 * 60;
export const A2A_TASK_MAX_BYTES = 1024 * 1024;
export const A2A_REQUEST_MAX_BYTES = 64 * 1024;
export const A2A_STATE_DESCRIPTION = `Completed and failed task results can be retrieved with tasks/get for ${A2A_TASK_TTL_SECONDS} seconds. The task ID grants access to its result; keep it private. Request messages and history are not retained. Terminal tasks cannot be canceled or restarted. Expired IDs return task not found.`;

export interface EvidenceTaskRecord {
  id: string;
  contextId: string;
  kind: "task";
  status: { state: "completed" | "failed"; timestamp: string };
  artifacts: { artifactId: string; name: string; parts: { kind: "data"; data: EvidenceArtifact }[] }[];
  metadata: { expiresAt: string };
}

interface StoredTask { task: EvidenceTaskRecord; expiresAt: number }

/**
 * One immutable result per unguessable task ID. KV cannot guarantee a read
 * immediately after a write at another edge. The record and cleanup alarm
 * commit together, before the caller receives a successful Task response.
 */
export class A2ATaskStore extends DurableObject<Env> {
  async save(task: EvidenceTaskRecord): Promise<boolean> {
    if (new TextEncoder().encode(JSON.stringify(task)).byteLength > A2A_TASK_MAX_BYTES) return false;
    const expiresAt = Date.parse(task.metadata.expiresAt);
    if (!Number.isFinite(expiresAt)) return false;
    return this.ctx.storage.transaction(async (txn) => {
      if (await txn.get("task")) return false;
      await txn.put("task", { task, expiresAt } satisfies StoredTask);
      await txn.setAlarm(expiresAt);
      return true;
    });
  }

  async read(now = Date.now()): Promise<EvidenceTaskRecord | null> {
    const record = await this.ctx.storage.get<StoredTask>("task");
    return record && now < record.expiresAt ? record.task : null;
  }

  async alarm(): Promise<void> {
    // No renewal and no per-task scan: the one record is all this object owns.
    await this.ctx.storage.deleteAll();
  }
}

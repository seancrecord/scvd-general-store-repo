import { sendAlert } from "@/lib/alerts";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson } from "@/lib/kv-retry";
import { latestCorpusStored } from "@/services/corpus-list";
import { sealStoredWeek, unsealedStoredWeeks } from "@/services/corpus";
import { missingWeeks } from "@/services/ward-heartbeat";
import type { SubmitOptions } from "@/services/anchor-submit";
import type { WardRound } from "@/services/ward-round";
import type { Env } from "@/types";

export const CORPUS_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * One seal per hourly invocation, oldest first. The overdue check runs
 * BEFORE the expensive seal: if a runtime kill bypasses our catch, the
 * next sweep pages from the stored round's age without needing a failure
 * marker from the dead invocation. No host bodies are read while idle.
 */
export async function sweepCorpusSnapshots(env: Env, options: SubmitOptions = {}): Promise<void> {
  const pending = await unsealedStoredWeeks(env);
  if (!pending.length) return;
  const now = options.now ?? new Date();
  const previous = await latestCorpusStored(env);
  const head = previous && ("pointer" in previous ? previous.week : previous.snapshot.week);
  // A stored week can expire before recovery. Do not turn that temporary
  // absence into a permanent hole by appending a later week over it.
  const missing = head ? missingWeeks([head, pending[0]!]) : [];
  for (const week of missing) {
    await sendAlert(env, {
      condition: "worker_health", key: `corpus-unsealed:${week}`,
      detail: `Corpus week ${week} has no stored round available to seal. Later stored weeks remain blocked to preserve append order. Recover the missing round before sealing from /admin/ward.`,
    });
  }
  for (const week of pending) {
    const round = await kvGetJson<WardRound>(env.COUNTERS, KV_KEYS.wardRound(week));
    if (!round || !Number.isFinite(Date.parse(round.at)) || now.getTime() - Date.parse(round.at) > CORPUS_SWEEP_INTERVAL_MS) {
      await sendAlert(env, {
        condition: "worker_health", key: `corpus-unsealed:${week}`,
        detail: `Corpus week ${week} is still unsealed more than one hourly sweep after its round, or its stored date cannot be read. The chain has not caught up; the oldest available week is ${pending[0]}. Inspect /admin/ward.`,
      });
    }
  }
  if (missing.length) return;
  const week = pending[0]!;
  try {
    console.info(`Corpus seal starting: ${week}`);
    const pass = await sealStoredWeek(env, week, options);
    if (!pass.taken) {
      // A simultaneous keeper press may already have sealed it. Re-read
      // the queue before describing that successful press as a failure.
      if (!(await unsealedStoredWeeks(env)).includes(week)) return;
      throw new Error(pass.reason);
    }
    console.info(`Corpus seal completed: ${week}, sequence ${pass.record.snapshot.sequence}`);
  } catch (error: unknown) {
    await sendAlert(env, {
      condition: "worker_health", key: `corpus-unsealed:${week}`,
      detail: `Corpus snapshot failed for ${week}: ${String(error)}. The stored week remains next in append order and will be retried next hourly sweep.`,
    });
  }
}

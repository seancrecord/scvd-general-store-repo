import { performLaunchCheck, signLaunchCheck, snapshotLaunchCheckRequest, launchCheckRequestEvidence,
  type LaunchCheckRequest, type LaunchCheckCore, type SignedLaunchCheck } from "@/services/launch-check";
import { readTransferClaim } from "@/services/attestation";
import { evmChainOf } from "@/lib/base-rpc";
import type { Env } from "@/types";

/** One verified buyer authorization, one upstream attempt. The queue orders live
 * callers; durable checkpoints alone decide whether another send is safe after
 * eviction. No network operation runs inside a storage transaction. */
export class LaunchCheckStore {
  private running: Promise<void> = Promise.resolve();
  constructor(private readonly storage: DurableObjectStorage, private readonly env: Env) {}

  async run(path: string, digest: string, url: string, input?: LaunchCheckRequest): Promise<SignedLaunchCheck> {
    // Copy before joining the queue: the caller must not change the input while
    // an earlier invocation is at the seller. Defaults preserve legacy identities.
    const request = snapshotLaunchCheckRequest(input);
    const work = this.running.then(async () => {
      const evidence = request ? await launchCheckRequestEvidence(request) : undefined;
      const identity = { path, digest, url, ...(evidence ? { request: evidence } : {}) };
      const prior = await this.storage.get<typeof identity>("launch:identity");
      if (prior && JSON.stringify(prior) !== JSON.stringify(identity)) throw new Error("Launch purchase input mismatch");
      const checkRequest = (core: LaunchCheckCore) => {
        if (core.url !== url || JSON.stringify(core.request_evidence) !== JSON.stringify(evidence)) {
          throw new Error("Launch request evidence mismatch");
        }
      };
      const report = await this.storage.get<SignedLaunchCheck>("launch:report");
      if (request && !prior && (report || await this.storage.get("launch:observation") || await this.storage.get("launch:attempt"))) {
        throw new Error("Launch pilot identity unavailable");
      }
      if (report) { checkRequest(report); return report; }
      // An admitted payment must use its retained observation, never start work.
      if (await this.storage.get("purchase")) throw new Error("Original launch observation unavailable");
      if (!prior) await this.storage.put("launch:identity", identity);
      const observed = await this.storage.get<LaunchCheckCore>("launch:observation");
      const attempted = await this.storage.get<LaunchCheckCore>("launch:attempt");
      const core = observed ?? attempted;
      if (core) checkRequest(core);
      const signed = core ? await signLaunchCheck(this.env, core) : await performLaunchCheck(this.env, url, {
        ...(request ? { request } : {}),
        readClaim: (tx, query, network) => readTransferClaim(this.env, tx, query, evmChainOf(network) ?? undefined),
        retain: async (stage, value) => { await this.storage.put(`launch:${stage}`, value); },
      });
      await this.storage.put("launch:report", signed);
      return signed;
    });
    this.running = work.then(() => undefined, () => undefined);
    return work;
  }
}

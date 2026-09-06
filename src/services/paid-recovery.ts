import { DurableObject } from "cloudflare:workers";
import type { Env } from "@/types";

interface RecoveryAttempt {
  digest: string;
  token: string;
  response?: string;
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
  async begin(digest: string): Promise<RecoveryClaim> {
    return this.ctx.storage.transaction(async (txn) => {
      const prior = await txn.get<RecoveryAttempt>("attempt");
      if (prior) {
        if (prior.digest === digest && prior.response !== undefined) {
          return { kind: "replay", response: prior.response };
        }
        return { kind: "unavailable" };
      }
      const token = crypto.randomUUID();
      await txn.put("attempt", { digest, token } satisfies RecoveryAttempt);
      return { kind: "claimed", token };
    });
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
}

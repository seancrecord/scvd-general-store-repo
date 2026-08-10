import { Hono } from "hono";
import {
  acceptDelta,
  poolSample,
  validateDelta,
} from "@/services/tab-pool";
import {
  TAB_POOL_DAILY_CAP,
  TAB_POOL_GAMING_NOTE,
  TAB_POOL_PRIVACY_SENTENCE,
  TAB_POOL_TRUST_LINE,
} from "@/store/tab-pool";
import type { HonoEnv } from "@/types";

/**
 * LAYER 3's front door (THE_TAB.md §6, built 2026-08-10):
 *
 *   POST /api/tab/delta — the aggregation endpoint the Tab's client
 *                         has refused for want of, since v0.2
 *   GET  /api/tab/pool  — the pool's honest face: sample sizes, the
 *                         privacy sentence, and the gaming note
 *
 * Free on purpose. The contribution IS the payment — the corpus is
 * contribute-to-access, and the signed receipt returned here is the
 * ticket pooled reads will take when they ship. No account, no
 * identity stored: the receipt verifies statelessly against the
 * store's published key, so two deltas from one contributor stay as
 * unlinkable as the spec demands.
 */
export const tabPoolRoutes = new Hono<HonoEnv>();

tabPoolRoutes.post("/api/tab/delta", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { accepted: false, error: "The delta must be a JSON body." },
      400,
    );
  }
  const checked = validateDelta(body);
  if ("problems" in checked) {
    return c.json(
      {
        accepted: false,
        problems: checked.problems,
        what_a_delta_carries: TAB_POOL_PRIVACY_SENTENCE,
      },
      400,
    );
  }
  const result = await acceptDelta(c.env, checked.delta);
  if ("refused" in result) {
    return c.json({ accepted: false, error: result.refused }, 429);
  }
  c.header("Cache-Control", "no-store");
  return c.json({
    accepted: true,
    what_this_is:
      "A signed receipt: this store accepted an anonymized delta matching this digest at this time. Custody of the contribution, never a claim about the tool. Keep it — the pooled corpus is contribute-to-access, and receipts are the ticket when pooled reads ship.",
    ...result,
    verify:
      `Recompute: the signature is ed25519 over signed_payload exactly as served, against the key at ${c.env.STORE_BASE_URL}/.well-known/scvd-signing-key. delta_digest is sha256 of your delta's canonical JSON (the declared field order for its kind).`,
    pool: `${c.env.STORE_BASE_URL}/api/tab/pool`,
  });
});

tabPoolRoutes.get("/api/tab/pool", async (c) => {
  const sample = await poolSample(c.env);
  return c.json({
    what_this_is:
      "The Tab's pooled corpus (layer 3): anonymized signup and outcome deltas, contributed deliberately and with consent by builders running scvd-tab. This page is the pool's own arithmetic — sample sizes first, because a figure built on four reports says four.",
    trust_model: TAB_POOL_TRUST_LINE,
    what_a_delta_carries: TAB_POOL_PRIVACY_SENTENCE,
    gaming: TAB_POOL_GAMING_NOTE,
    sample_sizes: {
      opened_deltas: sample.opened,
      outcome_deltas: sample.outcome,
      by_category: sample.by_category,
      ...(sample.truncated
        ? {
            truncated:
              "The listing hit its scan cap; the counts above are a floor, not the pool.",
          }
        : {}),
    },
    daily_intake_cap: TAB_POOL_DAILY_CAP,
    pooled_reads:
      "Not built yet. When they ship they will be contribute-to-access — a signed contribution receipt is the ticket — and retention counts only: kept rates and sample sizes, no prices, no identities, no advice.",
    contribute:
      "Run scvd-tab (npm), set consent with set_consent {contribute: true}, then contribute_anonymized_delta. The client validates and projects the delta before anything leaves your machine; this endpoint refuses anything outside the declared fields, by name.",
  });
});

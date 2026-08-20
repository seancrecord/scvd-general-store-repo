import { sendAlert } from "@/lib/alerts";
import { attributeKey } from "@/store/key-registry";
import {
  catalogLastUpdated,
  daysSinceUpdate,
  STALE_AFTER_DAYS,
} from "@/lib/freshness";
import {
  cachedPublicKeyHex,
  signMessage,
  verifyCertificateSignature,
} from "@/lib/signing";
import { getCertificate } from "@/services/certificates";
import { SAMPLE_ARTIFACT_ID } from "@/store/spec";
import { listOrders } from "@/services/orders";
import type { Env } from "@/types";

/**
 * The hourly rounds. Two of the four P1 conditions live here: the
 * Worker self-check (KV + signing round trip) and the human-queue SLA
 * guard (a queued order nobody has acknowledged in 24 hours).
 */

const SLA_GUARD_HOURS = 24;

async function selfCheck(env: Env): Promise<void> {
  try {
    const probe = `health:${Date.now()}`;
    await env.COUNTERS.put("health_probe", probe, { expirationTtl: 3600 });
    const readback = await env.COUNTERS.get("health_probe");
    if (readback !== probe) {
      throw new Error("KV readback mismatch");
    }
    await signMessage("health-probe", env.SIGNING_KEY);
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `Hourly self-check failed: ${String(error)}`,
    });
  }
}

async function slaGuard(env: Env): Promise<void> {
  try {
    const orders = await listOrders(env);
    const now = Date.now();
    for (const order of orders) {
      if (order.status !== "queued" || order.acknowledged_at) {
        continue;
      }
      const ageHours = (now - Date.parse(order.created_at)) / 3600000;
      if (ageHours > SLA_GUARD_HOURS) {
        await sendAlert(env, {
          condition: "order_sla",
          detail: `Order ${order.order_id} (${order.item_id}) has sat unacknowledged for ${Math.floor(ageHours)}h. The promise is ${order.sla_hours}h. The back room: /admin.`,
          key: order.order_id,
        });
      }
    }
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `SLA guard itself failed: ${String(error)}`,
    });
  }
}

/**
 * THE SHELF-READER'S ROUND (docs/archive/EMPLOYEES.md job file):
 *
 *   Role.        Notice when the machine-facing surfaces have gone
 *                quiet, because nothing else will.
 *   Tools.       The catalog's own dates, via lib/freshness.
 *   Boundaries.  Reports. It never edits a surface, never touches a
 *                date, never publishes anything. A cron that bumped a
 *                freshness date to look current would be forging the
 *                exact claim the date exists to make.
 *   Escalation.  Nothing in the catalog written or re-checked by hand
 *                in STALE_AFTER_DAYS.
 *
 * Why it matters here specifically: the surfaces agents read —
 * llms.txt, menu.json, the well-known document, the directory — are
 * the ones NOBODY VISITS. A storefront going stale is visible the
 * moment the keeper opens it. A discovery document going stale is
 * invisible until an agent acts on something that stopped being true.
 */
async function freshnessGuard(env: Env): Promise<void> {
  try {
    const days = daysSinceUpdate();
    if (days < STALE_AFTER_DAYS) {
      return;
    }
    await sendAlert(env, {
      condition: "catalog_stale",
      detail: `The machine-facing surfaces say as_of ${catalogLastUpdated()}, which is ${days} days ago. llms.txt, menu.json, /.well-known/x402.json, the sitemap and the directory all publish that date, so it is what an agent sees. Nothing is broken — this is the round telling you the shelves have gone quiet. docs/archive/AEO_GEO.md has the walk.`,
      // One key, so a stale month nags once every six hours rather
      // than every tick, and stops the day something gets a new date.
      key: `stale:${catalogLastUpdated()}`,
    });
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `Freshness guard itself failed: ${String(error)}`,
    });
  }
}

/**
 * THE REGISTRAR'S ROUND (docs/archive/EMPLOYEES.md job file, and the roster's
 * recommended first hire):
 *
 *   Role.        Confirm, on every tick, that the store's own claims
 *                still verify.
 *   Tools.       The published sample artifact id, the certificate
 *                store, the advertised signing key.
 *   Boundaries.  READ-ONLY. Signs nothing, mints nothing, fixes
 *                nothing, re-issues nothing. If a thing is broken it
 *                says so and stops.
 *   Escalation.  signing_failure, the moment a published artifact
 *                stops resolving or the advertised key stops matching
 *                what we would sign with today.
 *
 * WHY THIS ONE FIRST: READINESS names signature tenure as the one
 * asset that cannot be bought back, and the operational rule as
 * "never take a verify URL down, for any reason." Nothing enforced
 * that. A deploy could break verification and we would learn it from
 * a stranger, or never — and "never" is the likely one, because the
 * people who check our signatures are exactly the people who do not
 * write to us.
 *
 * Three claims, in the order that a failure would hurt:
 *
 *   1. THE SAMPLE ARTIFACT RESOLVES. SAMPLE_ARTIFACT_ID is printed in
 *      llms.txt, the skill, and the spec block on every listing. It is
 *      the id a stranger tries first. If it 404s, the store's central
 *      claim is unfalsifiable at exactly the moment someone chose to
 *      test it.
 *   2. ITS SIGNATURE STILL VERIFIES against the key we hold now. A
 *      rotated or corrupted key turns every artifact the store ever
 *      issued into an unverifiable string, retroactively.
 *   3. THE ADVERTISED KEY IS THE SIGNING KEY. /.well-known publishes a
 *      public key; if it ever stops matching the private key in the
 *      environment, every verification a stranger runs fails and every
 *      one we run passes, which is the worst possible split.
 */
async function registrarsRound(env: Env): Promise<void> {
  try {
    const record = await getCertificate(env, SAMPLE_ARTIFACT_ID);
    if (!record) {
      await sendAlert(env, {
        condition: "signing_failure",
        detail: `The published sample artifact ${SAMPLE_ARTIFACT_ID} does not resolve. That id is printed in llms.txt, the skill and every listing spec — it is the one a stranger tries first, and right now it answers nothing.`,
        key: `sample:${SAMPLE_ARTIFACT_ID}`,
      });
      return;
    }

    const verifies = await verifyCertificateSignature(
      record.certificate,
      record.signature,
      record.public_key,
    );
    if (!verifies) {
      await sendAlert(env, {
        condition: "signing_failure",
        detail: `The published sample artifact ${SAMPLE_ARTIFACT_ID} resolves but NO LONGER VERIFIES against the key it was signed with. Every artifact the store has ever issued is suspect until this is understood. Do not re-issue anything.`,
        key: `verify:${SAMPLE_ARTIFACT_ID}`,
      });
      return;
    }

    /**
     * REWRITTEN 2026-07-31, HOURS AFTER IT FIRED FOR THE FIRST TIME AND
     * WAS WRONG.
     *
     * It used to compare the live key against the sample artifact's key
     * and alert on any difference. That was the correct check in a
     * world with exactly one key, and it became a permanent false
     * alarm the moment the store performed its first handover — it
     * would have screamed once an hour, forever, about a key change we
     * announced, signed and published on purpose.
     *
     * Its claim was false too, which is the worse half: "strangers
     * verifying against the advertised key will fail" — they do not.
     * An artifact carries the key it was signed with, /api/verify hands
     * back that key and the exact signed bytes, and the retired key
     * stays published in key_history precisely so this keeps working.
     *
     * A STALE INSTRUMENT, NOT A STALE ALERT, and the difference decides
     * the fix. Silencing it would have removed a real check; what it
     * needed was the question that survives a rotation. That question
     * is not "do these two keys match" but "IS THE ARTIFACT'S KEY ONE
     * WE PUBLISH AT ALL" — because an artifact signed by a key absent
     * from key_history is genuinely unattributable, and that is the
     * shape the old alert was reaching for.
     */
    const advertised = await cachedPublicKeyHex(env.SIGNING_KEY);
    const attribution = attributeKey(record.public_key, advertised);
    if (attribution.status === "unrecognised") {
      await sendAlert(env, {
        condition: "signing_failure",
        detail: `The sample artifact ${SAMPLE_ARTIFACT_ID} carries a key (${record.public_key.slice(0, 16)}…) that this store does not publish — not the current key and not any retired one. A stranger checking it against key_history will conclude the artifact is not ours. Either the registry lost an entry or something is signing that should not be.`,
        key: `keyorphan:${record.public_key.slice(0, 16)}`,
      });
      return;
    }

    /**
     * AND NOTHING ELSE PAGES HERE, WHICH IS THE CORRECTION.
     *
     * A second alert briefly lived at this line: after a handover the
     * advertised sample is signed by the RETIRED key, so the artifact
     * every newcomer is pointed at exercises the harder path until
     * something new gets signed. True, mildly interesting, and it was
     * filed under `worker_health` — a P1 condition whose plain meaning
     * is THE WORKER IS UNHEALTHY. It was not. The store was working
     * perfectly and had just done a thing it announced, signed and
     * published on purpose.
     *
     * The keeper got that email and could not tell what was wrong,
     * correctly, because nothing was. A self-clearing cosmetic
     * condition given the same channel as an outage does not inform
     * anybody; it teaches the reader that alerts from this store are
     * noise, which is the one thing an alerting system cannot afford
     * and the reason there are only a handful of paging conditions in
     * the first place.
     *
     * So it is deleted rather than reworded. A retired-key sample is
     * a fine thing for a newcomer to land on — it demonstrates
     * key_history working — and it stops being true the moment
     * anybody buys anything or takes a free stamp. Whether
     * SAMPLE_ARTIFACT_ID should ever move is a taste call for the
     * keeper, not a condition for a cron to nag about.
     */
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `The registrar's round itself failed: ${String(error)}`,
    });
  }
}

/** Run on every scheduled tick. Quiet when all is well. */
/**
 * THE WARD'S DEAD-MAN CHECK. The Sunday cron alerts when a ward round
 * FAILS — but a try/catch cannot see a job that never started (cron
 * disabled, deploy pipeline stalled, trigger misconfigured). So the
 * hourly rounds check the round's AGE: a latest round older than
 * eight days means at least one Sunday came and went without a
 * reading, and a stale ecosystem map reads exactly like a healthy
 * ecosystem. Eight days, not seven, so an on-time round never races
 * its own deadline. No round at all stays quiet — before the first
 * Sunday (or the first hand-crank) there is nothing to be stale.
 */
const WARD_STALE_MS = 8 * 24 * 3600_000;

export async function wardDeadMan(env: Env): Promise<void> {
  const { latestWardRound } = await import("@/services/ward-round");
  const round = await latestWardRound(env).catch(() => null);
  if (!round) {
    return;
  }
  if (Date.now() - Date.parse(round.at) > WARD_STALE_MS) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `The ward round is stale: last reading ${round.at} (week ${round.week}), more than 8 days ago. The Sunday cron missed at least one pass — run it by hand from /admin/ward and find out why.`,
    });
  }
}

export async function runHealthChecks(env: Env): Promise<void> {
  await selfCheck(env);
  await slaGuard(env);
  await freshnessGuard(env);
  await registrarsRound(env);
  await wardDeadMan(env);
}

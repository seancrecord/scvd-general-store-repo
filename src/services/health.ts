import { sendAlert } from "@/lib/alerts";
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
 * THE SHELF-READER'S ROUND (EMPLOYEES.md job file):
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
      detail: `The machine-facing surfaces say as_of ${catalogLastUpdated()}, which is ${days} days ago. llms.txt, menu.json, /.well-known/x402.json, the sitemap and the directory all publish that date, so it is what an agent sees. Nothing is broken — this is the round telling you the shelves have gone quiet. AEO_GEO.md has the walk.`,
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
 * THE REGISTRAR'S ROUND (EMPLOYEES.md job file, and the roster's
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

    const advertised = await cachedPublicKeyHex(env.SIGNING_KEY);
    if (advertised !== record.public_key) {
      await sendAlert(env, {
        condition: "signing_failure",
        detail: `The key we would sign with today (${advertised.slice(0, 16)}…) is not the key the sample artifact carries (${record.public_key.slice(0, 16)}…). Strangers verifying against the advertised key will fail while we succeed, which is the one split that looks like fraud from outside.`,
        key: `keydrift:${advertised.slice(0, 16)}`,
      });
    }
  } catch (error) {
    await sendAlert(env, {
      condition: "worker_health",
      detail: `The registrar's round itself failed: ${String(error)}`,
    });
  }
}

/** Run on every scheduled tick. Quiet when all is well. */
export async function runHealthChecks(env: Env): Promise<void> {
  await selfCheck(env);
  await slaGuard(env);
  await freshnessGuard(env);
  await registrarsRound(env);
}

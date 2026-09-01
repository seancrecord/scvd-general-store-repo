import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { signMessage } from "@/lib/signing";
import { ProbeTargetRefused } from "@/lib/probe-target";
import {
  PREFLIGHT_BATTERY,
  PREFLIGHT_BATTERY_NEXT,
  PREFLIGHT_VERSION_NEXT,
  probeOnce,
  runChecks,
} from "@/services/preflight";
import { checkRailReceivable } from "@/services/rail-receivable";
import { checkEvmReceivable } from "@/services/evm-receivable";
import type {
  PreflightAdvisory,
  PreflightCheck,
} from "@/services/preflight";
import type { Env } from "@/types";
import { kvGetJson, kvPut } from "@/lib/kv-retry";

/**
 * THE SERVICE AUDIT — the point-in-time x402 endpoint audit, paid
 * (MARKETPLACE_AUDIT Part 6 step 3; the first Tier 3 product, the
 * ethos made purchasable: we verify what's correct).
 *
 * WHAT IT IS: the free preflight's exact battery — same guarded
 * fetch, same checks, same published criteria — run once against an
 * endpoint the buyer names, and then everything the free tool does
 * not do: the readout is SIGNED, its evidence hash is bound into the
 * purchase certificate's `attests` field, and the whole report is
 * stored and served at a stable URL, free to read, forever. The free
 * preflight answers "is my door shaped right"; the audit produces the
 * artifact a third party can check without trusting the person who
 * commissioned it.
 *
 * WHAT IT IS NOT, and these are load-bearing (rule 43: a dated
 * observation on an artifact, never a score on an actor):
 *   - not an endorsement — "ready" means the 402 was shaped right at
 *     one moment, nothing more
 *   - not an uptime claim — one request, one moment
 *   - not a badge — no mark, no tier, no standing; the report is the
 *     entire product
 *   - not monitoring — nothing recurs; the record is terminal at write
 *
 * WHOSE DOOR MAY BE NAMED: any https endpoint that is not our own.
 * The probe is one GET of a public URL — the same single request any
 * shopper's client makes unprompted — so unlike the standing watch
 * (a week of recurring probes, where consent is the purchase) a
 * point-in-time audit needs no owner's leave. What keeps it honest is
 * the shape of the artifact: it reports what the endpoint ANSWERED,
 * dated, against published criteria, and says plainly what that
 * cannot prove.
 *
 * NO FREE-TIER BUDGET TAKEN: the preflight's per-minute buckets meter
 * a free, no-auth endpoint; here the five dollars is the meter, and
 * the probe runs post-settle where a 429 would be money taken for a
 * report never made.
 */

/**
 * The criteria the audit cites — the SAME battery the weekly census
 * applies (PREFLIGHT_BATTERY_NEXT / preflight-v2). #82, 2026-09-01:
 * the $5 headline used to cite v1 while the corpus cited v2, so a
 * door the census called not_ready could buy a signed ready. Old
 * reports keep the citation they were signed under.
 */
export const AUDIT_CRITERIA_VERSION = PREFLIGHT_BATTERY_NEXT;

/** The day the paid headline moved to v2. Named so the criteria page and the correction derive one date. */
export const AUDIT_BATTERY_CHANGED = "2026-09-01";

export const AUDIT_BATTERY_CHANGE_NOTE = `${AUDIT_BATTERY_CHANGED}: the paid Once-Over cites ${AUDIT_CRITERIA_VERSION} as its headline battery, the same battery the weekly census has applied since 2026-08-24. Reports signed before this date cite preflight-v1 and keep that citation forever. The frozen v1 score still rides in also_under so the overlap is visible. We do not resign old artifacts.`;

export function auditCriteriaNote(base: string): string {
  return `${AUDIT_CRITERIA_VERSION}: the published check battery documented at ${base}/api/preflight/${PREFLIGHT_VERSION_NEXT} (GET). The audit runs those checks and no others; the criteria page is the contract.`;
}

/**
 * EXPORTED 2026-08-29 so the free sample (#31) can carry the SAME
 * scope sentence the paid artifact carries, rather than a second copy
 * of it that starts drifting the day this one improves. The whole
 * point of a sample is that it shows what a buyer gets.
 */
export const AUDIT_SCOPE =
  "One GET at one moment, against the published criteria named above. This reports what the endpoint answered then: it is not an endorsement, not an uptime claim, and says nothing about whether anything is delivered after payment. An unreachable verdict is a fact about the network path between this store and that host at that moment — it does not prove the endpoint is down. Produced automatically; no human looked, and that is the point: a report commissioned by anyone reads the same.";

export interface ServiceAuditObservation {
  audit_id: string;
  /** The endpoint audited, exactly as the buyer named it. */
  url: string;
  observed_at: string;
  criteria: string;
  /**
   * `refused` is a statement about US: the target failed this store's
   * published probe-target law and no request was made. It is in the
   * union so a paid, signed report can never call our own refusal a
   * fact about the buyer's network.
   */
  verdict: "ready" | "not_ready" | "unreachable" | "refused";
  checks: PreflightCheck[];
  advisories: PreflightAdvisory[];
  /**
   * THE SAME PROBE, SCORED UNDER THE FROZEN BATTERY (v1). Since
   * 2026-09-01 the headline cites v2 — the census battery — so a
   * paid ready cannot quietly say less than the corpus. also_under
   * is the overlap: what v1 would have printed, from the same
   * observation. They can never disagree about what was seen, only
   * about what counts. Append-law: new audits only. Absent when
   * the probe never completed (refused / unreachable — no battery
   * ran).
   */
  also_under?: {
    battery: string;
    verdict: "ready" | "not_ready";
    difference: string;
  };
  /** Stable digest of the observed facts above. */
  evidence_hash: string;
  scope: string;
}

export interface SignedServiceAudit extends ServiceAuditObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

/** The KV envelope: the signed report plus what the purchase minted. */
export interface ServiceAuditRecord {
  audit: SignedServiceAudit;
  cert_id: string;
  created_at: string;
}

export interface AuditOptions {
  fetch?: typeof fetch;
  now?: Date;
}

/** Digest of the facts, computed before scope joins the artifact. */
async function auditEvidenceHash(
  core: Omit<ServiceAuditObservation, "evidence_hash" | "scope">,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(core)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * One probe, one readout, one signature. The URL was validated before
 * the payment gate (https, default port, not our own host); a network
 * failure here becomes a signed "unreachable" verdict rather than a
 * throw, because "did not answer when we knocked, at this dated
 * moment" is itself the observation the buyer paid for — framed on
 * the artifact as exactly that and no more.
 */
export async function performServiceAudit(
  env: Env,
  url: string,
  options: AuditOptions = {},
): Promise<SignedServiceAudit> {
  let checks: PreflightCheck[];
  let advisories: PreflightAdvisory[];
  let verdict: ServiceAuditObservation["verdict"];
  let alsoUnder: ServiceAuditObservation["also_under"];
  try {
    const outcome = await probeOnce(url, options.fetch ?? fetch, "", env);
    const ran = runChecks(outcome.response, outcome.bodyOverLimit, outcome.body, url);
    advisories = ran.advisories;
    /*
     * The v2 score, from the free door's own recipe (preflightUrl):
     * fold the L3b trio and the rail read into the same observation.
     * THAT is the headline now (#82). The rail read is best-effort
     * exactly as it is everywhere else — a throw is our RPC trouble,
     * never this door's defect, and the advisory says so.
     */
    const rail = ran.accepts
      ? await checkRailReceivable(env, ran.accepts).catch(() => ({
          check: null,
          advisory: {
            name: "solana-rail-unread",
            detail:
              "the Solana rail read did not complete, so whether that payTo can be credited is unknown. Our gap, not a finding about this endpoint.",
          },
        }))
      : { check: null, advisory: null };
    if (rail.advisory) advisories.push(rail.advisory);
    /*
     * The EVM blacklist read (the depth pass, 2026-08-28) — advisory
     * on this single-door paid instrument for the same reason it is
     * advisory on the free one: the census cannot afford it, so a
     * fold would split the v2 citation. The $5 buyer still gets the
     * deeper reading in the signed bytes.
     */
    if (ran.accepts) {
      const evm = await checkEvmReceivable(env, ran.accepts).catch(() => ({
        advisories: [],
      }));
      advisories.push(...evm.advisories);
    }
    const v1Checks = ran.checks;
    const v2Checks = [
      ...ran.checks,
      ...(ran.l3b ?? []),
      ...(rail.check ? [rail.check] : []),
    ];
    const v2Extras = [
      ...(ran.l3b ? ["the L3b consistency trio"] : []),
      ...(rail.check ? ["solana-rail-receivable"] : []),
    ];
    const v1Verdict = v1Checks.every((check) => check.ok)
      ? ("ready" as const)
      : ("not_ready" as const);
    const v2Verdict = v2Checks.every((check) => check.ok)
      ? ("ready" as const)
      : ("not_ready" as const);
    checks = v2Checks;
    verdict = v2Verdict;
    alsoUnder = {
      battery: PREFLIGHT_BATTERY,
      verdict: v1Verdict,
      difference:
        v2Extras.length > 0
          ? `${AUDIT_CRITERIA_VERSION} folds ${v2Extras.join(" and ")} into the verdict; ${PREFLIGHT_BATTERY} reports the same observations as advisories. On this probe the two batteries ${v1Verdict === v2Verdict ? "agreed" : "DISAGREED"}.`
          : "No accepts parsed and the rail read did not apply, so both batteries scored the identical set of checks.",
    };
  } catch (error) {
    /*
     * THIS IS THE ARTIFACT THAT MOST HAD TO STOP SAYING "UNREACHABLE".
     * A service audit is paid, signed, and bought precisely so it can
     * be handed to somebody else. Writing "a fact about the network
     * path" over a target WE declined to dial would put a false
     * sentence under this store's own key, in the one artifact whose
     * whole value is that a stranger can trust it.
     *
     * The buy door refuses these before money moves, so this branch
     * should never run. It is here so that if it ever does, the report
     * is still true.
     */
    if (error instanceof ProbeTargetRefused) {
      verdict = "refused";
      checks = [
        {
          name: "probe-target-refused",
          ok: false,
          detail: `no request was made: ${error.message} This is a statement about this store's published probe-target law, NOT an observation about that endpoint — we did not look, so we report nothing about what is there.`,
        },
      ];
    } else {
      verdict = "unreachable";
      checks = [
        {
          name: "reachable",
          ok: false,
          detail: `the probe could not complete: ${String(error)}. A fact about the network path between us and that host at this moment — it does not prove the endpoint is down, and a buyer elsewhere may reach it fine.`,
        },
      ];
    }
    advisories = [];
  }

  const core = {
    audit_id: `saudit_${newEntryId()}`,
    url,
    observed_at: (options.now ?? new Date()).toISOString(),
    criteria: auditCriteriaNote(env.STORE_BASE_URL),
    verdict,
    checks,
    advisories,
    // Append-law: present only when a battery actually ran, after
    // advisories, inside evidence_hash and the signature alike.
    ...(alsoUnder ? { also_under: alsoUnder } : {}),
  };
  const observation: ServiceAuditObservation = {
    ...core,
    evidence_hash: await auditEvidenceHash(core),
    scope: AUDIT_SCOPE,
  };
  const { signature, publicKey } = await signMessage(
    JSON.stringify(observation),
    env.SIGNING_KEY,
  );
  return {
    ...observation,
    signature,
    public_key: publicKey,
    signature_covers:
      "The canonical JSON of every field above signature, in the order served. Re-serialize them and check against the ed25519 public key here or at /.well-known/scvd-signing-key.",
  };
}

/**
 * Stored AFTER the mint so the envelope can carry the cert id; the
 * signature was already fixed before the mint, so the certificate
 * binds the report and the report never has to mention the
 * certificate — the binding runs one direction, through `attests`.
 */
export async function storeServiceAudit(
  env: Env,
  audit: SignedServiceAudit,
  certId: string,
): Promise<ServiceAuditRecord> {
  const record: ServiceAuditRecord = {
    audit,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await kvPut(env.PATRONS, 
    KV_KEYS.serviceAudit(audit.audit_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getServiceAudit(
  env: Env,
  auditId: string,
): Promise<ServiceAuditRecord | null> {
  return kvGetJson<ServiceAuditRecord>(env.PATRONS, 
    KV_KEYS.serviceAudit(auditId),
    "json",
  );
}

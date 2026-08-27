import { KV_KEYS } from "@/lib/kv-keys";
import { newEntryId } from "@/lib/ids";
import { signMessage } from "@/lib/signing";
import { ProbeTargetRefused } from "@/lib/probe-target";
import {
  ONPAGE_BLIND_SPOTS,
  fetchPageOnce,
  runOnpageBattery,
} from "@/services/onpage";
import { ONPAGE_VERSION } from "@/services/onpage-checks";
import type {
  OnpageAdvisory,
  OnpageCheck,
} from "@/services/onpage-checks";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * THE PAID ON-PAGE AUDIT — the Once-Over's exact discipline pointed
 * at a page: the free desk's battery, run once against a URL the
 * buyer names, then everything the free desk does not do — the
 * readout SIGNED, its evidence hash bound into the purchase
 * certificate's `attests` field, the whole report stored and served
 * at a stable URL, free to read, forever.
 *
 * WHAT IT IS NOT (rule 43: a dated observation on an ARTIFACT — the
 * served HTML — never a score on whoever runs the site):
 *   - not an endorsement, a ranking prediction, or an SEO grade
 *   - not what a browser shows — the blind spots ride the artifact
 *   - not monitoring; the record is terminal at write
 *
 * NO FREE-TIER BUDGET TAKEN, same reasoning as the service audit:
 * the dollars are the meter, and the probe runs post-settle where a
 * 429 would be money taken for a report never made.
 */

export const ONPAGE_CRITERIA_VERSION = `onpage-${ONPAGE_VERSION}`;

export function onpageCriteriaNote(base: string): string {
  return `${ONPAGE_CRITERIA_VERSION}: the published check battery documented at ${base}/api/onpage/${ONPAGE_VERSION} (GET). The audit runs those checks and no others; the criteria page is the contract.`;
}

const AUDIT_SCOPE =
  "One GET at one moment, of the HTML as served, against the published criteria named above. The blind spots listed on this report are part of it: what a script renders was not seen, robots.txt was not fetched, nothing was rendered. Not an endorsement, not a ranking claim, and nothing about any other moment. Produced automatically; no human looked, and that is the point: a report commissioned by anyone reads the same.";

export interface OnpageAuditObservation {
  audit_id: string;
  /** The page audited, exactly as the buyer named it. */
  url: string;
  observed_at: string;
  criteria: string;
  /**
   * `refused` is a statement about US: the target failed the
   * published probe-target law and no request was made — never
   * written as a fact about the buyer's page.
   */
  verdict: "ready" | "not_ready" | "unreachable" | "refused";
  checks: OnpageCheck[];
  advisories: OnpageAdvisory[];
  blind_spots: string[];
  /** Stable digest of the observed facts above. */
  evidence_hash: string;
  scope: string;
}

export interface SignedOnpageAudit extends OnpageAuditObservation {
  signature: string;
  public_key: string;
  signature_covers: string;
}

/** The KV envelope: the signed report plus what the purchase minted. */
export interface OnpageAuditRecord {
  audit: SignedOnpageAudit;
  cert_id: string;
  created_at: string;
}

export interface OnpageAuditOptions {
  fetch?: typeof fetch;
  now?: Date;
}

async function evidenceHash(
  core: Omit<OnpageAuditObservation, "evidence_hash" | "scope">,
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
 * the payment gate; a network failure becomes a signed "unreachable"
 * verdict rather than a throw, because a dated did-not-answer is
 * itself the observation — framed on the artifact as exactly that.
 */
export async function performOnpageAudit(
  env: Env,
  url: string,
  options: OnpageAuditOptions = {},
): Promise<SignedOnpageAudit> {
  let checks: OnpageCheck[];
  let advisories: OnpageAdvisory[];
  let verdict: OnpageAuditObservation["verdict"];
  try {
    const outcome = await fetchPageOnce(url, options.fetch ?? fetch, env);
    const ran = await runOnpageBattery(outcome);
    checks = ran.checks;
    advisories = ran.advisories;
    verdict = checks.every((check) => check.ok) ? "ready" : "not_ready";
  } catch (error) {
    if (error instanceof ProbeTargetRefused) {
      // The buy door refuses these before money moves; if this ever
      // runs, the signed report still tells the truth about whose
      // statement the refusal is.
      verdict = "refused";
      checks = [
        {
          name: "probe-target-refused",
          ok: false,
          detail: `no request was made: ${error.message} This is a statement about this store's published probe-target law, NOT an observation about that page — we did not look, so we report nothing about what is there.`,
        },
      ];
    } else {
      verdict = "unreachable";
      checks = [
        {
          name: "reachable",
          ok: false,
          detail: `the probe could not complete: ${String(error)}. A fact about the network path between us and that host at this moment — it does not prove the page is down, and a reader elsewhere may reach it fine.`,
        },
      ];
    }
    advisories = [];
  }

  const core = {
    audit_id: `opage_${newEntryId()}`,
    url,
    observed_at: (options.now ?? new Date()).toISOString(),
    criteria: onpageCriteriaNote(env.STORE_BASE_URL),
    verdict,
    checks,
    advisories,
    blind_spots: [...ONPAGE_BLIND_SPOTS],
  };
  const observation: OnpageAuditObservation = {
    ...core,
    evidence_hash: await evidenceHash(core),
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
 * signature was fixed before the mint, so the binding runs one
 * direction, through `attests` — the Once-Over's storage discipline.
 */
export async function storeOnpageAudit(
  env: Env,
  audit: SignedOnpageAudit,
  certId: string,
): Promise<OnpageAuditRecord> {
  const record: OnpageAuditRecord = {
    audit,
    cert_id: certId,
    created_at: new Date().toISOString(),
  };
  await kvPut(env.PATRONS, 
    KV_KEYS.onpageAudit(audit.audit_id),
    JSON.stringify(record),
  );
  return record;
}

export async function getOnpageAudit(
  env: Env,
  auditId: string,
): Promise<OnpageAuditRecord | null> {
  return env.PATRONS.get<OnpageAuditRecord>(
    KV_KEYS.onpageAudit(auditId),
    "json",
  );
}

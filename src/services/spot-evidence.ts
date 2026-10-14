import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson, kvPut } from "@/lib/kv-retry";
import { sha256Hex } from "@/lib/idempotency";
import { signJcs, jcsCanonicalize } from "@/lib/jcs";
import { signMessage, verifyMessageSignature, verifyCertificateSignature } from "@/lib/signing";
import { BASELINE_CERT_PATTERN, spotHosts } from "@/lib/spot-check-terms";
import { getCertificate } from "@/services/certificates";
import { performSpotCheck, type SignedSpotCheck } from "@/services/spot-check";
import type { SubjectRound } from "@/services/subject-history";
import type { Env } from "@/types";

export interface SpotComparison {
  state: "no_new_observations" | "new_observations_same_findings" | "changed" | "not_comparable";
  previous_observed_at: string | null;
  current_observed_at: string | null;
  changed_fields: string[];
  reason: string;
}
export interface ChangeRecord {
  kind: "change_check";
  host: string;
  baseline_cert_id: string;
  baseline: SignedSpotCheck;
  current: SignedSpotCheck;
  comparison: SpotComparison;
  limits: string;
}
export interface BatchRecord {
  kind: "batch_spot_check";
  started_at: string;
  completed_at: string;
  requested_hosts: string[];
  readings: SignedSpotCheck[];
  limits: string;
}
export interface SignedSpotAddition {
  record: ChangeRecord | BatchRecord;
  signed_payload: string;
  signature: string;
  signature_jcs: string;
  public_key: string;
  evidence_hash: string;
}
export type StoredSpotEvidence = { kind: "spot_check"; report: SignedSpotCheck } |
  { kind: "change_check" | "batch_spot_check"; report: SignedSpotAddition };

export const SPOT_EVIDENCE_LIMITS = "Existing records only; no live probe. Publication and request dates are not observation dates. No new observations does not mean no endpoint changes. Gaps remain gaps, and a changed finding is not a safety verdict.";
const observed = (report: SignedSpotCheck) => report.record.history.timeline.filter(row => row.probed);
const identity = (row: SubjectRound) => JSON.stringify([row.sequence, row.digest, row.url, row.observed_at]);
const latest = (rows: SubjectRound[]) => rows.filter(row => row.observed_at && Number.isFinite(Date.parse(row.observed_at)))
  .sort((a, b) => Date.parse(b.observed_at!) - Date.parse(a.observed_at!))[0];

/** Compare like observations only. A resealed round or new request date
 * cannot make an old probe new; removed historical rows prevent a verdict. */
export function compareSpotRecords(before: SignedSpotCheck, after: SignedSpotCheck): SpotComparison {
  const oldRows = observed(before), newRows = observed(after);
  const oldLast = latest(oldRows), newLast = latest(newRows);
  const result = (state: SpotComparison["state"], reason: string, changed_fields: string[] = []): SpotComparison => ({
    state, previous_observed_at: oldLast?.observed_at ?? null, current_observed_at: newLast?.observed_at ?? null, changed_fields, reason,
  });
  if (before.record.host !== after.record.host || oldRows.some(row => !newRows.some(candidate => identity(candidate) === identity(row) && jcsCanonicalize({...candidate}) === jcsCanonicalize({...row})))) {
    return result("not_comparable", "Different subjects or missing/replaced historical rows; no continuity inferred.");
  }
  const added = newRows.filter(row => !oldRows.some(candidate => identity(candidate) === identity(row)));
  if (added.length === 0) return result("no_new_observations", "No additional observed rows in the recorded history. This says nothing about the endpoint between observations.");
  if (!oldLast || !newLast || added.some(row => !row.observed_at || !Number.isFinite(Date.parse(row.observed_at))) ||
      Date.parse(newLast.observed_at!) <= Date.parse(oldLast.observed_at!) || !oldLast.url || oldLast.url !== newLast.url ||
      !oldLast.battery || oldLast.battery !== newLast.battery || !oldLast.verdict || !newLast.verdict) {
    return result("not_comparable", "New recorded rows exist, but dated observations of the same exact endpoint under the same named battery are unavailable. The originals name the gaps.");
  }
  const changes: string[] = [];
  if (oldLast.verdict !== newLast.verdict) changes.push("verdict");
  for (const field of ["failed", "advisories"] as const) {
    if (oldLast[field] && newLast[field] && jcsCanonicalize([...oldLast[field]!].sort()) !== jcsCanonicalize([...newLast[field]!].sort())) changes.push(field);
  }
  return result(changes.length ? "changed" : "new_observations_same_findings",
    "Comparison covers the latest dated verdict and mutually present failed-check/advisory lists only. Missing fields, payment addresses, prices, networks and unobserved intervals are not judged; both full originals are included.", changes);
}

/** A saved projection is never evidence until its signed bytes, certificate
 * binding and signer agree. In particular edit-and-rehash must still fail. */
export async function readSpotEvidence(env: Env, certId: string): Promise<StoredSpotEvidence | null> {
  if (!new RegExp(BASELINE_CERT_PATTERN).test(certId)) return null;
  const [saved, cert] = await Promise.all([
    kvGetJson<StoredSpotEvidence>(env.PATRONS, KV_KEYS.spotEvidence(certId), "json"), getCertificate(env, certId),
  ]);
  if (!saved || !cert || !["spot_check", "change_check", "batch_spot_check"].includes(saved.kind)) return null;
  try {
    const report = saved.report;
    if (cert.certificate.cert_id !== certId || cert.certificate.item !== saved.kind || cert.certificate.attests !== report.evidence_hash ||
        report.public_key !== cert.public_key || JSON.stringify(report.record) !== report.signed_payload ||
        await sha256Hex(report.signed_payload) !== report.evidence_hash ||
        !(await verifyCertificateSignature(cert.certificate, cert.signature, cert.public_key)) ||
        !(await verifyMessageSignature(report.signed_payload, report.signature, cert.public_key)) ||
        !(await verifyMessageSignature(jcsCanonicalize({...report.record}), report.signature_jcs, cert.public_key))) return null;
    return saved;
  } catch { return null; }
}
export async function readSpotOriginal(env: Env, certId: string, host: string): Promise<SignedSpotCheck | null> {
  const saved = await readSpotEvidence(env, certId);
  return saved?.kind === "spot_check" && saved.report.record.host === host ? saved.report : null;
}
export async function retainSpotEvidence(env: Env, certId: string, value: StoredSpotEvidence): Promise<void> {
  const key = KV_KEYS.spotEvidence(certId);
  const existing = await kvGetJson<StoredSpotEvidence>(env.PATRONS, key, "json");
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(value)) throw new Error("Retained spot evidence mismatch");
    return;
  }
  await kvPut(env.PATRONS, key, JSON.stringify(value));
}
async function signed(env: Env, record: ChangeRecord | BatchRecord): Promise<SignedSpotAddition> {
  const signed_payload = JSON.stringify(record);
  const { signature, publicKey } = await signMessage(signed_payload, env.SIGNING_KEY);
  return { record, signed_payload, signature, public_key: publicKey,
    signature_jcs: await signJcs({ ...record }, env.SIGNING_KEY), evidence_hash: await sha256Hex(signed_payload) };
}
export class SpotBaselineUnavailable extends Error {}
export async function performChangeCheck(env: Env, host: string, certId: string): Promise<SignedSpotAddition> {
  const baseline = await readSpotOriginal(env, certId, host.trim().toLowerCase());
  if (!baseline) throw new SpotBaselineUnavailable("Earlier original unavailable");
  const current = await performSpotCheck(env, host);
  return signed(env, { kind: "change_check", host: current.record.host, baseline_cert_id: certId,
    baseline, current, comparison: compareSpotRecords(baseline, current), limits: SPOT_EVIDENCE_LIMITS });
}
export async function performBatchSpotCheck(env: Env, rawHosts: string | undefined): Promise<SignedSpotAddition> {
  const hosts = spotHosts(rawHosts), started_at = new Date().toISOString();
  // Bounded input; each host retains its own read time, not an invented atomic snapshot.
  const readings = await Promise.all(hosts.map(host => performSpotCheck(env, host)));
  return signed(env, { kind: "batch_spot_check", started_at, completed_at: new Date().toISOString(),
    requested_hosts: hosts, readings, limits: SPOT_EVIDENCE_LIMITS });
}

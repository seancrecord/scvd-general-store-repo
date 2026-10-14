import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { sha256Hex } from "@/lib/idempotency";
import { checkProbeTarget } from "@/lib/probe-target";
import { KV_KEYS } from "@/lib/kv-keys";
import { kvGetJson } from "@/lib/kv-retry";
import { canonicalizeConformancePass, type ConformancePass, type ConformanceWatchRecord } from "@/services/conformance-watch";
import { publishWatch } from "@/services/watch-recovery";
import { EVIDENCE_PILOT, PILOT_LIMITS } from "@/store/evidence-pilot";
import type { Env } from "@/types";

export class PilotInputError extends Error {}

const DAY_MS = 24 * 3600_000;
export const isPilotId = (id: string) => /^cwatch_pilot_[a-f0-9]{32}$/.test(id);
export async function readPilot(env: Env, id: string): Promise<ConformanceWatchRecord | null> {
  if (!isPilotId(id)) return null;
  const record = await kvGetJson<ConformanceWatchRecord>(env.ORDERS, KV_KEYS.conformanceWatch(id), "json");
  return record?.pilot ? record : null;
}

/** Only the authenticated keeper calls this after agreeing scope and public
 * observation with the buyer. No billing or customer credentials are involved.
 * A retry keeps the same id; the durable watch journal refuses conflicting terms.
 */
export async function startEvidencePilot(env: Env, id: string, rawUrl: string, now: number): Promise<ConformanceWatchRecord> {
  if (!isPilotId(id) || !Number.isFinite(now)) throw new PilotInputError("Invalid pilot input");
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new PilotInputError("Invalid endpoint URL"); }
  if (!checkProbeTarget(url, new URL(env.STORE_BASE_URL).hostname).ok || url.search || url.hash) {
    throw new PilotInputError("Public credential-free endpoint URL required, without query or fragment");
  }
  const existing = await readPilot(env, id);
  if (existing) {
    if (existing.url !== url.href) throw new PilotInputError("Pilot id already belongs to another endpoint");
    return existing;
  }
  const record: ConformanceWatchRecord = {
    watch_id: id, url: url.href,
    started_at: new Date(now).toISOString(),
    ends_at: new Date(now + EVIDENCE_PILOT.duration_days * DAY_MS).toISOString(),
    passes: [], pilot: { ...EVIDENCE_PILOT },
  };
  const signed_payload = jcsCanonicalize({ type: EVIDENCE_PILOT.terms_version,
    watch_id: id, url: record.url, started_at: record.started_at, ends_at: record.ends_at,
    terms: record.pilot, public_observation_agreed: true, limitations: PILOT_LIMITS });
  const signed = await signMessage(signed_payload, env.SIGNING_KEY);
  record.commission = { signed_payload, signature: signed.signature, public_key: signed.publicKey,
    signature_covers: "UTF-8 bytes of signed_payload. Agreed public endpoint, bounded term and price; no assertion of payment." };
  return (await publishWatch(env, { kind: "conformance", record })).record;
}

const ranChecks = (pass: ConformancePass) => pass.verdict === "ready" || pass.verdict === "not_ready";
const readout = (pass: ConformancePass) => jcsCanonicalize({ failed: [...pass.failed].sort(), advisories: [...pass.advisories].sort() });

/** Count elapsed 24-hour slots from the agreed start, not rows. Two passes in
 * one slot cannot erase a missed day, and a refusal cannot masquerade as coverage.
 */
export function pilotReportBody(record: ConformanceWatchRecord, now: number) {
  if (!record.pilot) throw new Error("Not a pilot");
  const start = Date.parse(record.started_at), end = Date.parse(record.ends_at);
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error("Invalid report window");
  const until = Math.min(now, end);
  const passes = [...record.passes].sort((a, b) => a.at.localeCompare(b.at));
  if (passes.some(p => !Number.isFinite(Date.parse(p.at)) || Date.parse(p.at) < start || Date.parse(p.at) >= end || Date.parse(p.at) > now)) {
    throw new Error("Observation outside report window");
  }
  const elapsed = Math.max(0, Math.floor((until - start) / DAY_MS));
  const days = Array.from({ length: elapsed }, (_, index) => {
    const from = start + index * DAY_MS;
    const rows = passes.filter(p => Date.parse(p.at) >= from && Date.parse(p.at) < from + DAY_MS);
    return { day: index + 1, from: new Date(from).toISOString(), until: new Date(from + DAY_MS).toISOString(),
      attempts: rows.length, conformance_checks: rows.filter(ranChecks).length,
      gap: rows.some(ranChecks) ? null : rows.length ? "no_conformance_result" : "no_attempt",
      outcomes: rows.map(p => ({ at: p.at, verdict: p.verdict, observer_status: p.observer_status ?? null })) };
  });
  const changes: { at: string; previous_at: string; kind: "criteria_changed" | "checks_changed" }[] = [];
  let previous: ConformancePass | undefined;
  for (const pass of passes.filter(ranChecks)) {
    if (previous) {
      if (previous.battery !== pass.battery || !pass.battery) changes.push({ at: pass.at, previous_at: previous.at, kind: "criteria_changed" });
      else if (readout(previous) !== readout(pass)) changes.push({ at: pass.at, previous_at: previous.at, kind: "checks_changed" });
    }
    previous = pass;
  }
  return {
    type: "scvd.endpoint-evidence-report.v1", watch_id: record.watch_id,
    url: record.url, generated_at: new Date(now).toISOString(),
    window: { started_at: record.started_at, ends_at: record.ends_at, complete: now >= end },
    terms: record.pilot, commission: record.commission ?? null,
    coverage: { elapsed_days: elapsed, days_with_conformance_checks: days.filter(d => d.conformance_checks > 0).length,
      days_without_conformance_checks: days.filter(d => d.conformance_checks === 0).length,
      denominator: "Completed 24-hour slots from the agreed start; the current partial slot is excluded. Refusals, unresolved methods and unreachable results do not count as conformance checks." },
    days, changes,
    observations: passes.map(pass => ({ ...pass, signed_payload: canonicalizeConformancePass(record.watch_id, record.url, pass) })),
    limitations: PILOT_LIMITS,
  };
}
export async function signedPilotReport(env: Env, record: ConformanceWatchRecord, now: number) {
  const body = pilotReportBody(record, now);
  const commission = body.commission;
  if (!commission || !(await verifyMessageSignature(commission.signed_payload, commission.signature, commission.public_key))) throw new Error("Invalid commission signature");
  const agreed = JSON.parse(commission.signed_payload) as Record<string, unknown>;
  if (agreed.watch_id !== body.watch_id || agreed.url !== body.url || agreed.started_at !== body.window.started_at || agreed.ends_at !== body.window.ends_at ||
      jcsCanonicalize(agreed.terms) !== jcsCanonicalize(body.terms)) throw new Error("Commission mismatch");
  for (const row of body.observations) {
    if (!(await verifyMessageSignature(row.signed_payload, row.signature, row.public_key))) throw new Error("Invalid observation signature");
  }
  // The report commits to order and omissions within this export. It is not
  // an external timestamp or proof that SCVD never omitted an observation.
  const canonical = jcsCanonicalize(body);
  const signed = await signMessage(canonical, env.SIGNING_KEY);
  return { report: body, signed_payload: canonical, sha256: await sha256Hex(canonical),
    signature: signed.signature, public_key: signed.publicKey,
    how_to_verify: "Check public_key against the SCVD key history at /.well-known/scvd-signing-key. Verify the Ed25519 signature over the UTF-8 bytes of signed_payload; require signed_payload to equal RFC 8785 canonical JSON of report. sha256 is SHA-256 of those same bytes. Each observation and the commission include their original signed_payload, signature and public_key. The export has no external timestamp proof." };
}

export function samplePilotReport() {
  const start = Date.parse("2026-09-01T00:00:00Z");
  const record: ConformanceWatchRecord = { watch_id: "illustrative-only", url: "https://example.invalid/x402",
    started_at: new Date(start).toISOString(), ends_at: new Date(start + EVIDENCE_PILOT.duration_days * DAY_MS).toISOString(),
    pilot: { ...EVIDENCE_PILOT }, passes: [] };
  // A sparse three-day example makes the gap visible without inventing a
  // customer's history. No signature or real endpoint is attributed to it.
  for (const [day, verdict] of [[0, "ready"], [2, "not_ready"]] as const) record.passes.push({
    at: new Date(start + day * DAY_MS + 3600_000).toISOString(), verdict,
    failed: verdict === "ready" ? [] : ["illustrative-check"], advisories: [], battery: "illustrative-battery",
    signature: "", public_key: "",
  });
  const report = pilotReportBody(record, start + 3 * DAY_MS);
  return { sample: true, note: "Illustrative, unsigned, partial report. No real endpoint was observed.",
    report: { ...report, observations: report.observations.map(({ signature: _signature, public_key: _key, ...row }) => row) } };
}

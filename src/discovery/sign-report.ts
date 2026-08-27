import { moduleFromPayload } from "@/discovery/cite-module";
import { writeHostDiscoveryModule } from "@/discovery/host-module";
import { wrapDiffEnvelope, signDiffEnvelope } from "@/discovery/diff-envelope";
import { buildDiffObservation } from "@/discovery/diff-observation";
import {
  parseInventoryTarget,
} from "@/discovery/inventory";
import { probeHostCatalogs, type HostCatalogCapture } from "@/discovery/host-probe";
import { selfJoinDisagreements } from "@/discovery/self-coherence";
import { newEntryId } from "@/lib/ids";
import { KV_KEYS } from "@/lib/kv-keys";
import { getPublicKeyHex } from "@/lib/signing";
import { currentKeyInServiceFrom } from "@/store/key-registry";
import { SKILL_VERSION } from "@/store/spec";
import type { EvidenceEnvelope } from "@/evidence";
import type { Env } from "@/types";
import { kvPut } from "@/lib/kv-retry";

/**
 * SIGNED DISCOVERY REPORT — the free inventory, wrapped and signed.
 *
 * Landscape §11: paid sibling of the unsigned door. The SKU is not
 * priced yet (keeper). This file is the instrument: fetch, join,
 * wrap, sign, persist. Fewer than two claim-bearing surfaces is
 * refused — that is not_observed, and we do not sign a silent agree.
 * Authorization cites OUR key registry, not theirs. No scores.
 */

export interface DiscoveryReportRecord {
  report_id: string;
  about: string;
  issued_at: string;
  envelope: EvidenceEnvelope;
}

export async function signHostDiscoveryReport(input: {
  capture: HostCatalogCapture;
  env: Env;
  at: string;
  clock: string;
}): Promise<
  | { ok: true; envelope: EvidenceEnvelope }
  | { ok: false; error: string }
> {
  if (input.capture.sides.length < 2) {
    return {
      ok: false,
      error:
        "Fewer than two catalog surfaces produced claims. That is not_observed, and this store does not sign a silent agree. The free inventory at POST /api/discovery/v1 will say so without a signature.",
    };
  }
  const base = input.env.STORE_BASE_URL;
  const disagreements = selfJoinDisagreements(input.capture.sides);
  const blocks = await buildDiffObservation({
    about: input.capture.about,
    sides: input.capture.sides,
    disagreements,
    surfaceBodies: input.capture.bodies,
    surfaceUrls: input.capture.urls,
  });
  const keyId = await getPublicKeyHex(input.env.SIGNING_KEY);
  const payload = wrapDiffEnvelope({
    blocks,
    at: input.at,
    clock: input.clock,
    observer: {
      key_id: keyId,
      software_version: SKILL_VERSION,
      vantage: "cloudflare-workers/single-vantage",
    },
    key: { key_id: keyId, in_service_from: currentKeyInServiceFrom(keyId) },
    authorization: {
      key_registry_url: `${base}/.well-known/scvd-signing-key`,
      anchor_log_url: `${base}/.well-known/anchor-log.json`,
    },
  });
  return {
    ok: true,
    envelope: await signDiffEnvelope(payload, input.env.SIGNING_KEY),
  };
}

export async function persistDiscoveryReport(
  env: Env,
  envelope: EvidenceEnvelope,
  issuedAt: string,
): Promise<DiscoveryReportRecord> {
  const report_id = `drep_${newEntryId()}`;
  const record: DiscoveryReportRecord = {
    report_id,
    about: envelope.subject.endpoint,
    issued_at: issuedAt,
    envelope,
  };
  await kvPut(env.PATRONS, KV_KEYS.discoveryReport(report_id), JSON.stringify(record));
  await writeHostDiscoveryModule(
    env,
    new URL(record.about).host,
    await moduleFromPayload(envelope),
  );
  return record;
}

export async function readDiscoveryReport(
  env: Env,
  reportId: string,
): Promise<DiscoveryReportRecord | null> {
  const raw = await env.PATRONS.get(KV_KEYS.discoveryReport(reportId));
  if (!raw) return null;
  return JSON.parse(raw) as DiscoveryReportRecord;
}

export async function issueDiscoveryReport(input: {
  rawUrl: unknown;
  env: Env;
  at?: string;
  clock?: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { status: 200; record: DiscoveryReportRecord }
  | { status: 400 | 422; error: string }
> {
  const parsed = parseInventoryTarget(input.rawUrl, input.env.STORE_BASE_URL);
  if (!parsed.ok) {
    return { status: 400, error: parsed.error };
  }
  const at = input.at ?? new Date().toISOString();
  const clock = input.clock ?? "injected-request-clock";
  const capture = await probeHostCatalogs({
    origin: parsed.origin,
    env: input.env,
    fetchImpl: input.fetchImpl,
  });
  const signed = await signHostDiscoveryReport({
    capture,
    env: input.env,
    at,
    clock,
  });
  if (!signed.ok) {
    return { status: 422, error: signed.error };
  }
  return {
    status: 200,
    record: await persistDiscoveryReport(input.env, signed.envelope, at),
  };
}

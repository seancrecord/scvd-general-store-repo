import { wrapDiffEnvelope } from "@/discovery/diff-envelope";
import { buildDiffObservation } from "@/discovery/diff-observation";
import { selfJoinDisagreements } from "@/discovery/self-coherence";
import type { HostCatalogCapture } from "@/discovery/host-probe";
import type { SurfaceClaims } from "@/discovery/self-coherence";
import {
  canonicalEvidenceBytes,
  EVIDENCE_SCHEMA_V1,
  validateEnvelopePayload,
  type EvidenceEnvelopePayload,
} from "@/evidence";
import { getPublicKeyHex } from "@/lib/signing";
import { currentKeyInServiceFrom } from "@/store/key-registry";
import { SKILL_VERSION } from "@/store/spec";

/**
 * PASSPORT CITATION — wrap a join and hash it. The passport signs
 * the citation; this file does not fetch and does not grade.
 * Authorization cites `authorizationBase` — our store for someone
 * else's catalogs, our origin for the self-row (they are the same).
 */

export interface PassportModule {
  id: string;
  schema: string;
  evidence_hash: string;
  derived: string;
  not_checked: string[];
  does_not_prove: string[];
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function moduleFromPayload(
  payload: EvidenceEnvelopePayload,
): Promise<PassportModule> {
  return {
    id: payload.subject.protocol,
    schema: EVIDENCE_SCHEMA_V1,
    evidence_hash: await sha256Hex(canonicalEvidenceBytes(payload)),
    derived: payload.derived.verdict,
    not_checked: payload.limitations.not_checked,
    does_not_prove: payload.limitations.does_not_prove,
  };
}

export async function citeWrappedJoin(input: {
  about: string;
  sides: readonly SurfaceClaims[];
  bodies: Record<string, string>;
  urls: Record<string, string>;
  signingKeyHex: string;
  at: string;
  clock: string;
  authorizationBase: string;
}): Promise<PassportModule | null> {
  if (input.sides.length < 2) return null;
  const blocks = await buildDiffObservation({
    about: input.about,
    sides: [...input.sides],
    disagreements: selfJoinDisagreements(input.sides),
    surfaceBodies: input.bodies,
    surfaceUrls: input.urls,
  });
  const keyId = await getPublicKeyHex(input.signingKeyHex);
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
      key_registry_url: `${input.authorizationBase}/.well-known/scvd-signing-key`,
      anchor_log_url: `${input.authorizationBase}/.well-known/anchor-log.json`,
    },
  });
  const verdict = validateEnvelopePayload(payload);
  if (!verdict.ok) return null;
  return moduleFromPayload(payload);
}

export async function citeHostCapture(input: {
  capture: HostCatalogCapture;
  signingKeyHex: string;
  at: string;
  clock: string;
  authorizationBase: string;
}): Promise<PassportModule | null> {
  return citeWrappedJoin({
    about: input.capture.about,
    sides: input.capture.sides,
    bodies: input.capture.bodies,
    urls: input.capture.urls,
    signingKeyHex: input.signingKeyHex,
    at: input.at,
    clock: input.clock,
    authorizationBase: input.authorizationBase,
  });
}

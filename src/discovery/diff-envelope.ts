import {
  DISCOVERY_COHERENCE_CLASS,
  type DiffObservationBlocks,
} from "@/discovery/diff-observation";
import {
  DISCOVERY_COHERENCE_FAMILY,
  canonicalEvidenceBytes,
  envelopeCoverage,
  envelopeMethodology,
  validateEnvelopePayload,
  type EvidenceAuthorization,
  type EvidenceEnvelope,
  type EvidenceEnvelopePayload,
  type EvidenceKeyWindow,
  type EvidenceObserver,
} from "@/evidence";
import { signMessage } from "@/lib/signing";

/**
 * WRAP — drop the four Diff Observation fields into the envelope.
 *
 * Landscape §11: no new container. The join is observation /
 * evidence / limitations / derived. This file adds subject,
 * methodology, observer, coverage, key, authorization, and the
 * signature over the JCS payload. Clock is injected. A payload
 * that fails the validator is not signed.
 */

export interface WrapDiffInput {
  blocks: DiffObservationBlocks;
  at: string;
  clock: string;
  observer: EvidenceObserver;
  key: EvidenceKeyWindow;
  authorization: EvidenceAuthorization;
}

export function wrapDiffEnvelope(
  input: WrapDiffInput,
): EvidenceEnvelopePayload {
  const coverage = envelopeCoverage(DISCOVERY_COHERENCE_CLASS, {
    chain: "none",
  });
  if (!coverage) {
    throw new Error(
      "discovery_coherence has no coverage row — the class was not registered",
    );
  }
  const version = DISCOVERY_COHERENCE_FAMILY.versions[0];
  if (!version) {
    throw new Error("discovery_coherence family has no version");
  }
  return {
    methodology: envelopeMethodology(DISCOVERY_COHERENCE_FAMILY),
    subject: {
      endpoint: input.blocks.observation.about,
      protocol: DISCOVERY_COHERENCE_FAMILY.id,
      protocol_version: version,
      chain: "none",
      rail: "none",
    },
    observation: input.blocks.observation,
    evidence: input.blocks.evidence,
    observer: input.observer,
    at: input.at,
    clock: input.clock,
    derived: input.blocks.derived,
    limitations: input.blocks.limitations,
    coverage,
    key: input.key,
    authorization: input.authorization,
  };
}

export async function signDiffEnvelope(
  payload: EvidenceEnvelopePayload,
  signingKeyHex: string,
): Promise<EvidenceEnvelope> {
  const verdict = validateEnvelopePayload(payload);
  if (!verdict.ok) {
    throw new Error(
      `refusing to sign an invalid envelope: ${verdict.defects.join(", ")}`,
    );
  }
  const { signature } = await signMessage(
    canonicalEvidenceBytes(payload),
    signingKeyHex,
  );
  return { ...payload, signature };
}

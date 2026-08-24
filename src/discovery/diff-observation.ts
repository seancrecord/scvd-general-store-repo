import {
  IDENTITY_KINDS,
  joinClaimSets,
  type IdentityKind,
} from "@/discovery/binding";
import type { SelfJoinDisagreement, SurfaceClaims } from "@/discovery/self-coherence";
import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage } from "@/lib/signing";

/**
 * DIFF OBSERVATION — the envelope's inner blocks, pointed at a join.
 *
 * Landscape §11: Diff Observations are evidence envelopes already.
 * The diff is the observation, raw hashes are the evidence capture,
 * not_observed is limitations. No new container. This file builds
 * those four fields. The envelope module (phase1/1.1) is the wrapper
 * they drop into; it is not on this stack, so we do not invent a
 * twin schema. The signature covers these four fields via JCS —
 * the same preimage discipline the envelope uses for its payload.
 *
 * No scores. Counts and denominators only. same_operator is named
 * in not_checked, never answered.
 */

export const DISCOVERY_COHERENCE_CLASS = "discovery_coherence" as const;

export type DiffCheckState = "pass" | "fail" | "not_checked";

export interface DiffObservationBlocks {
  observation: {
    class_id: typeof DISCOVERY_COHERENCE_CLASS;
    about: string;
    compared_surfaces: string[];
    pair_count: number;
    join_count: number;
    disagreement_count: number;
    disagreements: SelfJoinDisagreement[];
    surface_sha256: Record<string, string>;
  };
  evidence: {
    artifact_urls: string[];
    body_sha256: string;
  };
  derived: {
    verdict: "agree" | "conflict";
    checks: Record<string, DiffCheckState>;
  };
  limitations: {
    does_not_prove: string[];
    not_checked: string[];
  };
}

export interface DiffObservationInput {
  about: string;
  sides: readonly SurfaceClaims[];
  disagreements: readonly SelfJoinDisagreement[];
  /** Raw fetched bytes, keyed by surface id. */
  surfaceBodies: Readonly<Record<string, string>>;
  /** Fetched URLs, keyed by surface id. Missing = not a document. */
  surfaceUrls: Readonly<Record<string, string>>;
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

function kindsOn(claims: SurfaceClaims["claims"]): Set<IdentityKind> {
  const kinds = new Set<IdentityKind>();
  for (const claim of claims) kinds.add(claim.kind);
  return kinds;
}

function checkId(left: string, right: string, kind: IdentityKind): string {
  return `${DISCOVERY_COHERENCE_CLASS}.${left}.${right}.${kind}`;
}

export async function buildDiffObservation(
  input: DiffObservationInput,
): Promise<DiffObservationBlocks> {
  const compared_surfaces = input.sides.map((side) => side.surface).sort();
  const surface_sha256: Record<string, string> = {};
  for (const [surface, body] of Object.entries(input.surfaceBodies)) {
    surface_sha256[surface] = await sha256Hex(body);
  }

  const checks: Record<string, DiffCheckState> = {};
  const not_checked: string[] = [
    "same_operator",
    "live_402_behavior",
  ];
  let pair_count = 0;
  let join_count = 0;
  for (let i = 0; i < input.sides.length; i += 1) {
    for (let j = i + 1; j < input.sides.length; j += 1) {
      const left = input.sides[i];
      const right = input.sides[j];
      if (!left || !right) continue;
      pair_count += 1;
      const leftKinds = kindsOn(left.claims);
      const rightKinds = kindsOn(right.claims);
      for (const kind of IDENTITY_KINDS) {
        const onLeft = leftKinds.has(kind);
        const onRight = rightKinds.has(kind);
        if (onLeft !== onRight) {
          not_checked.push(`${left.surface}/${right.surface}:${kind}`);
        }
      }
      for (const join of joinClaimSets(left.claims, right.claims)) {
        join_count += 1;
        const failed = join.only_left.length > 0 || join.only_right.length > 0;
        checks[checkId(left.surface, right.surface, join.kind)] = failed
          ? "fail"
          : "pass";
      }
    }
  }

  if (!input.surfaceUrls["mcp_clusters"]) {
    not_checked.push("mcp_clusters_as_fetched_document");
  }

  const disagreement_count = input.disagreements.length;
  const body_sha256 = await sha256Hex(jcsCanonicalize(surface_sha256));
  const artifact_urls = Object.values(input.surfaceUrls)
    .filter((url) => url.length > 0)
    .sort();

  return {
    observation: {
      class_id: DISCOVERY_COHERENCE_CLASS,
      about: input.about,
      compared_surfaces,
      pair_count,
      join_count,
      disagreement_count,
      disagreements: [...input.disagreements],
      surface_sha256,
    },
    evidence: { artifact_urls, body_sha256 },
    derived: {
      verdict: disagreement_count === 0 ? "agree" : "conflict",
      checks,
    },
    limitations: {
      does_not_prove: [
        "that the compared surfaces belong to the same operator — same_operator is refused (G2)",
        "that the live buy door still behaves like these catalogs",
      ],
      not_checked,
    },
  };
}

/**
 * Sign the four envelope fields. When the envelope wrapper lands,
 * these fields drop into the payload and that signature covers them
 * plus methodology/subject/observer. This preimage is the join.
 */
export async function signDiffObservation(
  blocks: DiffObservationBlocks,
  signingKeyHex: string,
): Promise<{
  signed_payload: string;
  signature: string;
  public_key: string;
}> {
  const signed_payload = jcsCanonicalize(blocks);
  const { signature, publicKey } = await signMessage(
    signed_payload,
    signingKeyHex,
  );
  return { signed_payload, signature, public_key: publicKey };
}

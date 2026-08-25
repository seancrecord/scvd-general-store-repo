import {
  SCHEMA_COHERENCE_CLASS,
  schemaRowVerdict,
  type SurfaceSchemaClaims,
} from "@/discovery/schema-coherence";
import {
  SCHEMA_COHERENCE_FAMILY,
  EVIDENCE_SCHEMA_V1,
  envelopeCoverage,
  type CheckState,
  type EvidenceAuthorization,
  type EvidenceEnvelopePayload,
  type EvidenceKeyWindow,
  type EvidenceObserver,
} from "@/evidence";
import { jcsCanonicalize } from "@/lib/jcs";

/**
 * SCHEMA DIFF — the envelope's inner blocks, pointed at required
 * inputs. Same container as discovery_coherence; different fact.
 * MCP is named not_checked: the self-row inventory fetches
 * published catalogs, not tools/list.
 */

export interface SchemaObservationBlocks {
  observation: {
    class_id: typeof SCHEMA_COHERENCE_CLASS;
    about: string;
    compared_surfaces: string[];
    pair_count: number;
    join_count: number;
    disagreement_count: number;
    disagreements: ReturnType<typeof schemaRowVerdict>["disagreements"];
    not_observed: ReturnType<typeof schemaRowVerdict>["not_observed"];
    surface_sha256: Record<string, string>;
  };
  evidence: {
    artifact_urls: string[];
    body_sha256: string;
  };
  derived: {
    verdict: "agree" | "conflict";
    checks: Record<string, CheckState>;
  };
  limitations: {
    does_not_prove: string[];
    not_checked: string[];
  };
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

function checkId(left: string, right: string, route: string): string {
  return `${SCHEMA_COHERENCE_CLASS}.${left}.${right}.${route}`;
}

export async function buildSchemaObservation(input: {
  about: string;
  sides: readonly SurfaceSchemaClaims[];
  surfaceBodies: Readonly<Record<string, string>>;
  surfaceUrls: Readonly<Record<string, string>>;
}): Promise<SchemaObservationBlocks> {
  const verdict = schemaRowVerdict(input.sides);
  const compared_surfaces = input.sides.map((side) => side.surface).sort();
  const surface_sha256: Record<string, string> = {};
  for (const [surface, body] of Object.entries(input.surfaceBodies)) {
    surface_sha256[surface] = await sha256Hex(body);
  }

  const checks: Record<string, CheckState> = {};
  let pair_count = 0;
  let join_count = 0;
  for (let i = 0; i < input.sides.length; i += 1) {
    for (let j = i + 1; j < input.sides.length; j += 1) {
      const left = input.sides[i];
      const right = input.sides[j];
      if (!left || !right) continue;
      pair_count += 1;
      const rightByRoute = new Map(right.claims.map((claim) => [claim.route, claim]));
      for (const claim of left.claims) {
        const other = rightByRoute.get(claim.route);
        if (!other) continue;
        join_count += 1;
        const failed =
          claim.required.some((name) => !other.required.includes(name)) ||
          other.required.some((name) => !claim.required.includes(name));
        checks[checkId(left.surface, right.surface, claim.route)] = failed
          ? "fail"
          : "pass";
      }
    }
  }

  return {
    observation: {
      class_id: SCHEMA_COHERENCE_CLASS,
      about: input.about,
      compared_surfaces,
      pair_count,
      join_count,
      disagreement_count: verdict.disagreements.length,
      disagreements: verdict.disagreements,
      not_observed: verdict.not_observed,
      surface_sha256,
    },
    evidence: {
      artifact_urls: Object.values(input.surfaceUrls)
        .filter((url) => url.length > 0)
        .sort(),
      body_sha256: await sha256Hex(jcsCanonicalize(surface_sha256)),
    },
    derived: {
      verdict: verdict.derived,
      checks,
    },
    limitations: {
      does_not_prove: [
        "that the compared surfaces belong to the same operator — same_operator is refused (G2)",
        "that the live buy door still behaves like these schemas",
      ],
      not_checked: ["same_operator", "mcp_tools", "live_402_behavior"],
    },
  };
}

export function wrapSchemaEnvelope(input: {
  blocks: SchemaObservationBlocks;
  at: string;
  clock: string;
  observer: EvidenceObserver;
  key: EvidenceKeyWindow;
  authorization: EvidenceAuthorization;
}): EvidenceEnvelopePayload {
  const coverage = envelopeCoverage(SCHEMA_COHERENCE_CLASS, { chain: "none" });
  if (!coverage) {
    throw new Error(
      "schema_coherence has no coverage row — the class was not registered",
    );
  }
  const version = SCHEMA_COHERENCE_FAMILY.versions[0];
  if (!version) {
    throw new Error("schema_coherence family has no version");
  }
  return {
    methodology: { schema: EVIDENCE_SCHEMA_V1 },
    subject: {
      endpoint: input.blocks.observation.about,
      protocol: SCHEMA_COHERENCE_FAMILY.id,
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

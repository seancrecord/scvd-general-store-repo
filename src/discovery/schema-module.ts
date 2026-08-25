import { moduleFromPayload, type PassportModule } from "@/discovery/cite-module";
import {
  schemaFromOpenApi,
  schemaFromX402,
} from "@/discovery/schema-claims";
import type { SurfaceSchemaClaims } from "@/discovery/schema-coherence";
import {
  buildSchemaObservation,
  wrapSchemaEnvelope,
} from "@/discovery/schema-observation";
import type { fetchSelfCatalogs } from "@/discovery/self-module";
import { validateEnvelopePayload } from "@/evidence";
import { getPublicKeyHex } from "@/lib/signing";
import { currentKeyInServiceFrom } from "@/store/key-registry";
import { SKILL_VERSION } from "@/store/spec";

/**
 * SCHEMA MODULE — cite the required-input join on a passport.
 *
 * Reads the same fetched catalogs the identity join already has.
 * OpenAPI and x402.json are the compared pair. MCP is not a
 * fetched document here; the envelope names it not_checked.
 */

type LiveCatalogs = Awaited<ReturnType<typeof fetchSelfCatalogs>>;

function schemaSides(live: LiveCatalogs): SurfaceSchemaClaims[] {
  const about = live.row.about;
  const openapiUrl = live.urls["openapi"] ?? `${about}/openapi.json`;
  const x402Url = live.urls["x402_catalog"] ?? `${about}/.well-known/x402.json`;
  const openapi = JSON.parse(live.bodies["openapi"] ?? "null");
  const x402 = JSON.parse(live.bodies["x402_catalog"] ?? "null");
  return [
    {
      surface: "openapi",
      claims: schemaFromOpenApi(openapi, about, openapiUrl),
    },
    {
      surface: "x402_catalog",
      claims: schemaFromX402(x402, about, x402Url),
    },
  ].filter((side) => side.claims.length > 0);
}

export async function schemaModuleFromCatalogs(
  live: LiveCatalogs,
  signingKeyHex: string,
  at: string,
  clock: string,
): Promise<PassportModule> {
  const sides = schemaSides(live);
  if (sides.length < 2) {
    throw new Error(
      "self-passport refused to cite the schema join — fewer than two schema-bearing catalogs",
    );
  }
  const bodies: Record<string, string> = {};
  const urls: Record<string, string> = {};
  for (const surface of ["openapi", "x402_catalog"] as const) {
    const body = live.bodies[surface];
    const url = live.urls[surface];
    if (typeof body === "string") bodies[surface] = body;
    if (typeof url === "string") urls[surface] = url;
  }
  const blocks = await buildSchemaObservation({
    about: live.row.about,
    sides,
    surfaceBodies: bodies,
    surfaceUrls: urls,
  });
  const keyId = await getPublicKeyHex(signingKeyHex);
  const payload = wrapSchemaEnvelope({
    blocks,
    at,
    clock,
    observer: {
      key_id: keyId,
      software_version: SKILL_VERSION,
      vantage: "cloudflare-workers/single-vantage",
    },
    key: { key_id: keyId, in_service_from: currentKeyInServiceFrom(keyId) },
    authorization: {
      key_registry_url: `${live.row.about}/.well-known/scvd-signing-key`,
      anchor_log_url: `${live.row.about}/.well-known/anchor-log.json`,
    },
  });
  const verdict = validateEnvelopePayload(payload);
  if (!verdict.ok) {
    throw new Error(
      `self-passport refused to cite the schema join — envelope invalid: ${verdict.defects.join(", ")}`,
    );
  }
  return moduleFromPayload(payload);
}

import { wrapDiffEnvelope } from "@/discovery/diff-envelope";
import {
  buildDiffObservation,
  DISCOVERY_COHERENCE_CLASS,
} from "@/discovery/diff-observation";
import {
  assembleSelfRow,
  selfJoinDisagreements,
  type FetchedSelfRow,
} from "@/discovery/self-coherence";
import {
  canonicalEvidenceBytes,
  EVIDENCE_SCHEMA_V1,
  validateEnvelopePayload,
} from "@/evidence";
import { jcsCanonicalize } from "@/lib/jcs";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { getPublicKeyHex } from "@/lib/signing";
import { currentKeyInServiceFrom } from "@/store/key-registry";
import { SKILL_VERSION } from "@/store/spec";

/**
 * SELF-PASSPORT MODULE — the join, cited on our own passport.
 *
 * Landscape §10.1: the passport is a derived signed view over
 * envelopes. This file runs the self-row join, wraps it, and
 * returns the citation the passport signs: class id, schema,
 * evidence hash, derived fold, limitations. No scores. Census
 * passports do not get this module yet — they were not joined.
 */

export interface PassportModule {
  id: string;
  schema: string;
  evidence_hash: string;
  derived: string;
  not_checked: string[];
  does_not_prove: string[];
}

export type CatalogFetcher = (path: string) => Promise<string>;

/** Loopback fetch from the incoming request's origin — not STORE_BASE_URL, which can leave the Worker. */
export function originCatalogFetcher(origin: string): CatalogFetcher {
  return async (path: string) => {
    const response = await fetch(`${origin}${path}`);
    if (!response.ok) {
      throw new Error(`self-catalog ${path} returned ${response.status}`);
    }
    return response.text();
  };
}

const CATALOG_PATHS = {
  menu_json: "/menu.json",
  x402_catalog: "/.well-known/x402.json",
  openapi: "/openapi.json",
  a2a_agent_card: "/.well-known/a2a.json",
  llms_txt: "/llms.txt",
  skill_md: "/skill.md",
} as const;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function fetchSelfCatalogs(
  base: string,
  getText: CatalogFetcher,
): Promise<{
  row: FetchedSelfRow;
  bodies: Record<string, string>;
  urls: Record<string, string>;
}> {
  const texts: Record<string, string> = {};
  const urls: Record<string, string> = {};
  for (const [surface, path] of Object.entries(CATALOG_PATHS)) {
    texts[surface] = await getText(path);
    urls[surface] = `${base}${path}`;
  }
  const mcpItemIds = SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]);
  texts["mcp_clusters"] = jcsCanonicalize(mcpItemIds);
  return {
    row: {
      about: base,
      fetchedFrom: base,
      menu: JSON.parse(texts["menu_json"] ?? "null"),
      x402: JSON.parse(texts["x402_catalog"] ?? "null"),
      openapi: JSON.parse(texts["openapi"] ?? "null"),
      a2a: JSON.parse(texts["a2a_agent_card"] ?? "null"),
      llms: texts["llms_txt"] ?? "",
      skillMd: texts["skill_md"] ?? "",
      mcpItemIds,
    },
    bodies: texts,
    urls,
  };
}

export async function discoveryModuleFromCatalogs(
  live: Awaited<ReturnType<typeof fetchSelfCatalogs>>,
  signingKeyHex: string,
  at: string,
  clock: string,
): Promise<PassportModule> {
  const sides = assembleSelfRow(live.row);
  const blocks = await buildDiffObservation({
    about: live.row.about,
    sides,
    disagreements: selfJoinDisagreements(sides),
    surfaceBodies: live.bodies,
    surfaceUrls: live.urls,
  });
  const keyId = await getPublicKeyHex(signingKeyHex);
  const payload = wrapDiffEnvelope({
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
      `self-passport refused an invalid envelope: ${verdict.defects.join("; ")}`,
    );
  }
  return {
    id: DISCOVERY_COHERENCE_CLASS,
    schema: EVIDENCE_SCHEMA_V1,
    evidence_hash: await sha256Hex(canonicalEvidenceBytes(payload)),
    derived: blocks.derived.verdict,
    not_checked: blocks.limitations.not_checked,
    does_not_prove: blocks.limitations.does_not_prove,
  };
}

export async function selfPassportDiscoveryModule(input: {
  base: string;
  signingKeyHex: string;
  at: string;
  clock: string;
  getText?: CatalogFetcher;
}): Promise<PassportModule> {
  const getText =
    input.getText ??
    (async (path: string) => {
      const response = await fetch(`${input.base}${path}`);
      if (!response.ok) {
        throw new Error(`self-catalog ${path} returned ${response.status}`);
      }
      return response.text();
    });
  const live = await fetchSelfCatalogs(input.base, getText);
  return discoveryModuleFromCatalogs(
    live,
    input.signingKeyHex,
    input.at,
    input.clock,
  );
}

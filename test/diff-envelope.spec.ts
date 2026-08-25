import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  assembleSelfRow,
  buildDiffObservation,
  DISCOVERY_COHERENCE_CLASS,
  selfJoinDisagreements,
  signDiffEnvelope,
  wrapDiffEnvelope,
  type FetchedSelfRow,
} from "@/discovery";
import {
  canonicalEvidenceBytes,
  DISCOVERY_COHERENCE_FAMILY,
  EVIDENCE_SCHEMA_V1,
  validateEnvelopePayload,
} from "@/evidence";
import { jcsCanonicalize } from "@/lib/jcs";
import { signMessage, verifyMessageSignature } from "@/lib/signing";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { SKILL_VERSION } from "@/store/spec";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";
const TEST_SEED = "42".repeat(32);
const AT = "2026-08-24T20:00:00Z";
const CLOCK = "injected-test-clock";

async function fetchLive(): Promise<{
  row: FetchedSelfRow;
  bodies: Record<string, string>;
  urls: Record<string, string>;
}> {
  const paths = {
    menu_json: "/menu.json",
    x402_catalog: "/.well-known/x402.json",
    openapi: "/openapi.json",
    a2a_agent_card: "/.well-known/a2a.json",
    llms_txt: "/llms.txt",
    skill_md: "/skill.md",
  } as const;
  const texts: Record<string, string> = {};
  const urls: Record<string, string> = {};
  for (const [surface, path] of Object.entries(paths)) {
    const response = await SELF.fetch(`${ABOUT}${path}`);
    expect(response.status, `${path} did not serve`).toBe(200);
    texts[surface] = await response.text();
    urls[surface] = `${ABOUT}${path}`;
  }
  const mcpItemIds = SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]);
  texts["mcp_clusters"] = jcsCanonicalize(mcpItemIds);
  return {
    row: {
      about: ABOUT,
      fetchedFrom: ABOUT,
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

function wrapMeta() {
  return {
    at: AT,
    clock: CLOCK,
    observer: {
      key_id: "test-key",
      software_version: SKILL_VERSION,
      vantage: "cloudflare-workers/single-vantage",
    },
    key: { key_id: "test-key", in_service_from: "2026-08-24" },
    authorization: {
      key_registry_url: `${ABOUT}/.well-known/scvd-signing-key`,
      anchor_log_url: `${ABOUT}/.well-known/anchor-log.json`,
    },
  };
}

/**
 * The four Diff Observation fields drop into the envelope. No new
 * container. Clock injected. Coverage is the class row (all `none`
 * — this join has no chain dimension).
 */
describe("the Diff Observation wraps in the evidence envelope", () => {
  it("the live self-row is a valid envelope, schema inside the bytes", async () => {
    const live = await fetchLive();
    const sides = assembleSelfRow(live.row);
    const blocks = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements: selfJoinDisagreements(sides),
      surfaceBodies: live.bodies,
      surfaceUrls: live.urls,
    });
    const payload = wrapDiffEnvelope({ blocks, ...wrapMeta() });
    const verdict = validateEnvelopePayload(payload);
    expect(verdict.ok, JSON.stringify(verdict)).toBe(true);
    expect(payload.methodology.schema).toBe(EVIDENCE_SCHEMA_V1);
    expect(payload.methodology.battery_version).toBe(
      DISCOVERY_COHERENCE_FAMILY.versions[0],
    );
    expect(payload.subject.protocol).toBe(DISCOVERY_COHERENCE_FAMILY.id);
    expect(payload.subject.chain).toBe("none");
    expect(payload.subject.rail).toBe("none");
    expect(payload.coverage.class_id).toBe(DISCOVERY_COHERENCE_CLASS);
    expect(payload.coverage.depth).toBe("none");
    expect(payload.derived.verdict).toBe("agree");
    expect(payload.observation["disagreement_count"]).toBe(0);
  });

  it("a planted extra route is a valid envelope whose derived says conflict", async () => {
    const live = await fetchLive();
    expect(isRecord(live.row.x402)).toBe(true);
    const x402 = { ...(live.row.x402 as Record<string, unknown>) };
    const resources = Array.isArray(x402["resources"]) ? [...x402["resources"]] : [];
    resources.push({ resourceUrl: `${ABOUT}/api/buy/planted_ghost_item` });
    x402["resources"] = resources;
    const sides = assembleSelfRow({ ...live.row, x402 });
    const blocks = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements: selfJoinDisagreements(sides),
      surfaceBodies: { ...live.bodies, x402_catalog: JSON.stringify(x402) },
      surfaceUrls: live.urls,
    });
    const payload = wrapDiffEnvelope({ blocks, ...wrapMeta() });
    expect(validateEnvelopePayload(payload).ok).toBe(true);
    expect(payload.derived.verdict).toBe("conflict");
    expect(payload.observation["disagreement_count"]).toBeGreaterThan(0);
  });

  it("the envelope signature covers the canonical payload and refuses an invalid one", async () => {
    const live = await fetchLive();
    const sides = assembleSelfRow(live.row);
    const blocks = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements: selfJoinDisagreements(sides),
      surfaceBodies: live.bodies,
      surfaceUrls: live.urls,
    });
    const payload = wrapDiffEnvelope({ blocks, ...wrapMeta() });
    const bytes = canonicalEvidenceBytes(payload);
    const { publicKey } = await signMessage(bytes, TEST_SEED);
    const signed = await signDiffEnvelope(payload, TEST_SEED);
    expect(
      await verifyMessageSignature(bytes, signed.signature, publicKey),
    ).toBe(true);
    const broken = { ...payload, clock: "" };
    await expect(signDiffEnvelope(broken, TEST_SEED)).rejects.toThrow(
      /invalid envelope/,
    );
  });
});

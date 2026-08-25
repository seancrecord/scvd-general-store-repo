import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  assembleSelfRow,
  buildDiffObservation,
  DISCOVERY_COHERENCE_CLASS,
  selfJoinDisagreements,
  signDiffObservation,
  type FetchedSelfRow,
} from "@/discovery";
import { jcsCanonicalize } from "@/lib/jcs";
import { verifyMessageSignature } from "@/lib/signing";
import { SHELF_CLUSTERS } from "@/lib/mcp-tools";
import { isRecord } from "@/types";

const ABOUT = "https://scvd.store";
const TEST_SEED = "42".repeat(32);

/**
 * JOINS THESIS STEP 5: the disagreement is an evidence envelope's
 * observation block. This spec is the instrument — a live self-row
 * signs as agree; a planted extra route signs as conflict; hashes
 * move when the bytes move; the signature covers the four fields.
 * Empty extractors would "agree" — the planted case is what proves
 * the join can fire.
 */

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
  const menu: unknown = JSON.parse(texts["menu_json"] ?? "null");
  const x402: unknown = JSON.parse(texts["x402_catalog"] ?? "null");
  const openapi: unknown = JSON.parse(texts["openapi"] ?? "null");
  const a2a: unknown = JSON.parse(texts["a2a_agent_card"] ?? "null");
  const mcpItemIds = SHELF_CLUSTERS.flatMap((cluster) => [...cluster.itemIds]);
  texts["mcp_clusters"] = jcsCanonicalize(mcpItemIds);
  return {
    row: {
      about: ABOUT,
      fetchedFrom: ABOUT,
      menu,
      x402,
      openapi,
      a2a,
      llms: texts["llms_txt"] ?? "",
      skillMd: texts["skill_md"] ?? "",
      mcpItemIds,
    },
    bodies: texts,
    urls,
  };
}

function refusedKeys(value: unknown, path: string): string[] {
  if (!isRecord(value)) return [];
  const found: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === "score" || key === "confidence" || key === "rating" || key === "rank") {
      found.push(`${path}.${key}`);
    }
    found.push(...refusedKeys(child, `${path}.${key}`));
  }
  return found;
}

describe("a Diff Observation is the envelope's inner blocks", () => {
  it("the live self-row signs as agree, with denominators", async () => {
    const live = await fetchLive();
    const sides = assembleSelfRow(live.row);
    const disagreements = selfJoinDisagreements(sides);
    const blocks = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements,
      surfaceBodies: live.bodies,
      surfaceUrls: live.urls,
    });
    expect(blocks.observation.class_id).toBe(DISCOVERY_COHERENCE_CLASS);
    expect(blocks.observation.compared_surfaces).toHaveLength(7);
    // Derived, not memorised: 21 is C(7,2), and typing both numbers
    // means a surface added to one and not the other still reads as
    // correct on the line that was supposed to catch it.
    const n = blocks.observation.compared_surfaces.length;
    expect(blocks.observation.pair_count).toBe((n * (n - 1)) / 2);
    expect(blocks.observation.join_count).toBeGreaterThan(0);
    expect(blocks.observation.disagreement_count).toBe(0);
    expect(blocks.observation.disagreements).toEqual([]);
    expect(blocks.derived.verdict).toBe("agree");
    expect(Object.values(blocks.derived.checks).every((state) => state === "pass")).toBe(
      true,
    );
    expect(blocks.limitations.not_checked).toContain("same_operator");
    expect(blocks.limitations.does_not_prove.join(" ")).toContain("G2");
    expect(refusedKeys(blocks, "blocks")).toEqual([]);
  });

  it("a planted extra x402 route signs as conflict — the join can fire", async () => {
    const live = await fetchLive();
    expect(isRecord(live.row.x402)).toBe(true);
    const x402 = { ...(live.row.x402 as Record<string, unknown>) };
    const resources = Array.isArray(x402["resources"]) ? [...x402["resources"]] : [];
    resources.push({ resourceUrl: `${ABOUT}/api/buy/planted_ghost_item` });
    x402["resources"] = resources;
    const plantedBody = JSON.stringify(x402);
    const row = { ...live.row, x402 };
    const sides = assembleSelfRow(row);
    const disagreements = selfJoinDisagreements(sides);
    const blocks = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements,
      surfaceBodies: { ...live.bodies, x402_catalog: plantedBody },
      surfaceUrls: live.urls,
    });
    expect(blocks.observation.disagreement_count).toBeGreaterThan(0);
    expect(blocks.derived.verdict).toBe("conflict");
    expect(
      blocks.observation.disagreements.some(
        (row) =>
          row.kind === "route_identity" &&
          row.only_right.includes("planted_ghost_item"),
      ),
    ).toBe(true);
    expect(
      Object.values(blocks.derived.checks).some((state) => state === "fail"),
    ).toBe(true);
  });

  it("hashes move when the fetched bytes move", async () => {
    const live = await fetchLive();
    const sides = assembleSelfRow(live.row);
    const disagreements = selfJoinDisagreements(sides);
    const clean = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements,
      surfaceBodies: live.bodies,
      surfaceUrls: live.urls,
    });
    const dirty = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements,
      surfaceBodies: { ...live.bodies, llms_txt: `${live.bodies["llms_txt"]}\n` },
      surfaceUrls: live.urls,
    });
    expect(dirty.observation.surface_sha256["llms_txt"]).not.toBe(
      clean.observation.surface_sha256["llms_txt"],
    );
    expect(dirty.evidence.body_sha256).not.toBe(clean.evidence.body_sha256);
  });

  it("the signature covers the four fields and verifies", async () => {
    const live = await fetchLive();
    const sides = assembleSelfRow(live.row);
    const blocks = await buildDiffObservation({
      about: ABOUT,
      sides,
      disagreements: selfJoinDisagreements(sides),
      surfaceBodies: live.bodies,
      surfaceUrls: live.urls,
    });
    const signed = await signDiffObservation(blocks, TEST_SEED);
    expect(signed.signed_payload).toBe(jcsCanonicalize(blocks));
    expect(signed.signed_payload).not.toContain('"signature"');
    const ok = await verifyMessageSignature(
      signed.signed_payload,
      signed.signature,
      signed.public_key,
    );
    expect(ok).toBe(true);
    const tampered = signed.signed_payload.replace("agree", "conflict");
    expect(tampered).not.toBe(signed.signed_payload);
    const still = await verifyMessageSignature(
      tampered,
      signed.signature,
      signed.public_key,
    );
    expect(still).toBe(false);
  });
});

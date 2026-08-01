import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { TAG_CAP } from "@/services/train";
import { isRecord } from "@/types";

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

/**
 * THE MCP SHELF, hardened for how tool catalogs actually get graded
 * and, more to the point, how planning models actually read them.
 *
 * Three defects this file pins shut:
 *  1. graffiti_on_a_train's ONE distinguishing input (the tag) was
 *     absent from its MCP schema while FulfillmentInput carried it the
 *     whole time — an MCP buyer could not choose their own tag.
 *  2. No tool declared MCP annotations, so a client had no machine
 *     word that a second buy_* call is a second charge.
 *  3. The novelty items' descriptions led with voice before function.
 */

async function rpc(body: Record<string, unknown>) {
  const res = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
  return (await res.json()) as Record<string, unknown>;
}

describe("annotations", () => {
  const tools = mcpToolCatalog(BASE);

  it("every tool on the shelf carries them", () => {
    for (const tool of tools) {
      expect(tool.annotations, tool.name).toBeDefined();
    }
  });

  it("every buy_* tool says the honest thing: not read-only, not idempotent, open world", () => {
    for (const tool of tools.filter((t) => t.name.startsWith("buy_"))) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(false);
      expect(tool.annotations?.destructiveHint, tool.name).toBe(false);
      // The hint that most protects a planning model: a retry of a
      // settled call is a SECOND CHARGE.
      expect(tool.annotations?.idempotentHint, tool.name).toBe(false);
      // Settlement happens on a public chain.
      expect(tool.annotations?.openWorldHint, tool.name).toBe(true);
      expect(tool.annotations?.title, tool.name).toBeTruthy();
    }
  });

  it("the free readers are read-only and idempotent; the free writers are neither", () => {
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const reader of ["read_store_guide", "verify_artifact"]) {
      expect(byName.get(reader)?.annotations?.readOnlyHint, reader).toBe(true);
      expect(byName.get(reader)?.annotations?.idempotentHint, reader).toBe(
        true,
      );
    }
    for (const writer of ["ring_bell", "sign_guestbook"]) {
      expect(byName.get(writer)?.annotations?.readOnlyHint, writer).toBe(
        false,
      );
      expect(byName.get(writer)?.annotations?.idempotentHint, writer).toBe(
        false,
      );
    }
  });

  it("flows through tools/list, since annotations only count if served", async () => {
    const body = await rpc({ method: "tools/list" });
    const result = isRecord(body["result"]) ? body["result"] : {};
    const listed = Array.isArray(result["tools"]) ? result["tools"] : [];
    expect(listed.length).toBeGreaterThan(0);
    for (const tool of listed) {
      expect(isRecord(tool) && isRecord(tool["annotations"])).toBe(true);
    }
  });
});

describe("graffiti_on_a_train over MCP", () => {
  const tool = mcpToolCatalog(BASE).find(
    (t) => t.name === "buy_graffiti_on_a_train",
  );

  it("declares the tag input, required, capped at the side of a train", () => {
    const props = isRecord(tool?.inputSchema["properties"])
      ? tool.inputSchema["properties"]
      : {};
    const tag = isRecord(props["tag"]) ? props["tag"] : undefined;
    expect(tag).toBeDefined();
    expect(tag?.["maxLength"]).toBe(TAG_CAP);
    expect(tool?.inputSchema["required"]).toContain("tag");
  });

  it("refuses an empty tag before money moves, same as the HTTP door", async () => {
    const body = await rpc({
      method: "tools/call",
      params: { name: "buy_graffiti_on_a_train", arguments: {} },
    });
    const error = isRecord(body["error"]) ? body["error"] : {};
    // Invalid params, NOT a 402: no tag, no charge, no payment terms.
    expect(error["code"]).toBe(-32602);
    expect(String(error["message"])).toContain("No tag, no charge");
  });

  it("refuses a URL tag before money moves", async () => {
    const body = await rpc({
      method: "tools/call",
      params: {
        name: "buy_graffiti_on_a_train",
        arguments: { tag: "see https://example.com for more" },
      },
    });
    const error = isRecord(body["error"]) ? body["error"] : {};
    expect(error["code"]).toBe(-32602);
    expect(String(error["message"])).toContain("No URLs on the train");
  });

  it("issues payment terms once the tag is a tag", async () => {
    const body = await rpc({
      method: "tools/call",
      params: {
        name: "buy_graffiti_on_a_train",
        arguments: { tag: "CV WAS HERE" },
      },
    });
    const error = isRecord(body["error"]) ? body["error"] : {};
    expect(error["code"]).toBe(402);
  });
});

describe("boundary language (the DR3 retrieval lever)", () => {
  const byName = new Map(mcpToolCatalog(BASE).map((t) => [t.name, t]));

  it("verify_artifact disclaims being a conformance checker for other services", () => {
    const desc = byName.get("verify_artifact")?.description ?? "";
    expect(desc).toContain("NOT a conformance checker");
    expect(desc).toContain("only ids scvd.store itself issued");
  });

  it("read_store_guide disclaims being a payment endpoint", () => {
    const desc = byName.get("read_store_guide")?.description ?? "";
    expect(desc).toContain("NOT a purchase or payment endpoint");
  });

  it("buy_dibs points state-storage seekers at the anchor instead", () => {
    const desc = byName.get("buy_dibs")?.description ?? "";
    expect(desc).toContain("buy_context_anchor");
  });
});

describe("purpose lines", () => {
  it("the six novelty tools open by answering what calling them does", () => {
    const tools = mcpToolCatalog(BASE);
    for (const name of [
      "buy_graffiti_on_a_train",
      "buy_the_drawer",
      "buy_nomenclature",
      "buy_certificate_of_patronage",
      "buy_dibs",
      "buy_luckies",
    ]) {
      const tool = tools.find((t) => t.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.description.startsWith("Purpose:"), name).toBe(true);
    }
  });
});

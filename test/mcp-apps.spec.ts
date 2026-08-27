import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { installFacilitatorMock } from "./helpers/facilitator-mock";
import {
  MCP_APPS_EXTENSION,
  PREFLIGHT_CARD_URI,
  UI_MIME,
  VERIFY_CARD_URI,
  readUiResource,
  uiMetaFor,
  uiResourceCatalog,
} from "@/lib/mcp-apps";
import { mcpToolCatalog } from "@/lib/mcp-tools";

/**
 * MCP APPS — THE CARDS (2026-08-27). Two free evidence tools render;
 * nothing that moves money ever does. The wire shapes asserted here
 * are the ones the four-host render test proved live (design doc
 * §8.5): nested `_meta: { ui: { resourceUri } }` on the tool, the
 * profile MIME on the resource, and a template that actually speaks
 * the ui/initialize handshake — a silent template renders as nothing
 * while the host's own marker claims otherwise, which is exactly the
 * failure the test rounds found.
 */

const BASE = "https://scvd.store";

beforeAll(() => {
  installFacilitatorMock();
});

let rpcId = 0;
async function rpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  rpcId += 1;
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
  });
  return (await response.json()) as Record<string, unknown>;
}

describe("the extension is declared where hosts negotiate", () => {
  it("initialize offers io.modelcontextprotocol/ui with the profile MIME", async () => {
    const reply = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    const result = reply["result"] as Record<string, any>;
    const extensions = result["capabilities"]["extensions"];
    expect(extensions).toBeTruthy();
    expect(extensions[MCP_APPS_EXTENSION]).toEqual({ mimeTypes: [UI_MIME] });
  });
});

describe("exactly the two evidence tools carry a card, and nothing paid ever does", () => {
  /**
   * THE PAYMENT-SURFACE GUARD, rule 17's amended property as a test.
   * A rendered surface beside a buy_* tool would put pixels of ours
   * next to a payment decision; the approval press stays in the
   * client's own chrome. If a future card ever wants onto a paid
   * tool, this test is the door it has to argue with — in review,
   * not by accident.
   */
  it("no tool that can take money carries ui metadata", () => {
    for (const tool of mcpToolCatalog(BASE)) {
      const paid = Boolean(tool.itemId || tool.itemIds);
      if (paid || tool.name.startsWith("buy_")) {
        expect(
          uiMetaFor(tool.name),
          `${tool.name} takes payment and must never carry a ui card`,
        ).toBeUndefined();
      }
    }
  });

  it("the card-bearing tools are free tools that exist in the catalog", () => {
    const catalog = mcpToolCatalog(BASE);
    for (const name of ["preflight_endpoint", "verify_artifact"]) {
      const tool = catalog.find((entry) => entry.name === name);
      expect(tool, `${name} is not in the catalog`).toBeTruthy();
      expect(tool?.itemId).toBeUndefined();
      expect(tool?.itemIds).toBeUndefined();
      expect(uiMetaFor(name)?.ui.resourceUri).toBeTruthy();
    }
  });

  it("tools/list carries _meta.ui.resourceUri on the two, nested as the spec fixes", async () => {
    const reply = await rpc("tools/list");
    const tools = (reply["result"] as Record<string, any>)["tools"] as Array<
      Record<string, any>
    >;
    const withUi = tools.filter((tool) => tool["_meta"]?.["ui"]?.["resourceUri"]);
    expect(withUi.map((tool) => tool["name"]).sort()).toEqual([
      "preflight_endpoint",
      "verify_artifact",
    ]);
    // Nested object, not a flat "ui/resourceUri" key — hosts key on
    // the exact shape and the flat form fails silently.
    for (const tool of tools) {
      expect(tool["_meta"]?.["ui/resourceUri"]).toBeUndefined();
    }
  });
});

describe("the ui:// resources are listed and readable", () => {
  it("resources/list carries both cards with the profile MIME", async () => {
    const reply = await rpc("resources/list");
    const resources = (reply["result"] as Record<string, any>)[
      "resources"
    ] as Array<Record<string, any>>;
    for (const uri of [PREFLIGHT_CARD_URI, VERIFY_CARD_URI]) {
      const listed = resources.find((resource) => resource["uri"] === uri);
      expect(listed, `${uri} missing from resources/list`).toBeTruthy();
      expect(listed?.["mimeType"]).toBe(UI_MIME);
    }
    // The scvd:// shelves are still there; the cards are additive.
    expect(
      resources.some((resource) => String(resource["uri"]).startsWith("scvd://")),
    ).toBe(true);
  });

  it("resources/read serves each template", async () => {
    for (const uri of [PREFLIGHT_CARD_URI, VERIFY_CARD_URI]) {
      const reply = await rpc("resources/read", { uri });
      const contents = (reply["result"] as Record<string, any>)[
        "contents"
      ] as Array<Record<string, any>>;
      expect(contents).toHaveLength(1);
      const card = contents[0] as Record<string, unknown>;
      expect(card["uri"]).toBe(uri);
      expect(card["mimeType"]).toBe(UI_MIME);
      expect(String(card["text"])).toContain("<!doctype html>");
    }
  });

  it("an unknown ui:// uri is a spec-correct -32002, not a crash", async () => {
    const reply = await rpc("resources/read", {
      uri: "ui://scvd-general-store/no-such-card.html",
    });
    const error = reply["error"] as Record<string, any>;
    expect(error["code"]).toBe(-32002);
  });
});

describe("the templates hold the properties the render test proved load-bearing", () => {
  const templates = [PREFLIGHT_CARD_URI, VERIFY_CARD_URI].map((uri) => {
    const found = readUiResource(uri);
    expect(found).toBeTruthy();
    return { uri, html: found?.text ?? "" };
  });

  it.each(templates)("$uri speaks the handshake", ({ html }) => {
    // Without ui/initialize -> initialized the host renders NOTHING
    // while injecting its own "widget rendered" marker (observed
    // live, three rounds). This is the one property that cannot
    // regress silently.
    expect(html).toContain("ui/initialize");
    expect(html).toContain("ui/notifications/initialized");
    expect(html).toContain("ui/notifications/tool-result");
    expect(html).toContain("ui/notifications/size-changed");
  });

  it.each(templates)("$uri renders third-party bytes as text only", ({ html }) => {
    // A preflight report quotes an endpoint's own detail strings; a
    // card must not become their renderer.
    expect(html).not.toContain("innerHTML");
    expect(html).not.toContain("document.write");
    expect(html).not.toContain("insertAdjacentHTML");
  });

  it.each(templates)("$uri loads nothing from the network", ({ html }) => {
    // The host iframe CSP is deny-by-default; a card that needs the
    // network is a card that breaks. Self-contained by construction.
    expect(html).not.toContain("<script src");
    expect(html).not.toContain("<link");
    expect(html).not.toContain("fetch(");
    expect(html).not.toContain("XMLHttpRequest");
    expect(html).not.toContain("@import");
  });

  it.each(templates)("$uri carries the colophon and the keeper's line", ({ html }) => {
    expect(html).toContain("You know your own risk better than we do.");
    expect(html).toContain("House rule 43");
  });

  it("the preflight card keeps the unclimbed rungs at full weight", () => {
    const html = readUiResource(PREFLIGHT_CARD_URI)?.text ?? "";
    // The tri-state distinction the card exists to protect: rungs the
    // battery never climbed are named, not omitted.
    for (const rung of ["L3b", "L3c", "L3d", "L4–L6", "not measured"]) {
      expect(html).toContain(rung);
    }
    expect(html).toContain("What this cannot tell you");
    expect(html).toContain("Our conflict of interest");
    // No expiry line in v1: "one probe, one moment" is the freshness
    // claim; the stored-reading label is the keeper's open copy call.
    expect(html).not.toContain("expires in");
  });

  it("the verify card refuses to inflate a signature into an endorsement", () => {
    const html = readUiResource(VERIFY_CARD_URI)?.text ?? "";
    expect(html).toContain("a signature, not an endorsement");
    expect(html).toContain("Reproduce offline");
  });

  it("the catalog descriptions say display only", () => {
    for (const resource of uiResourceCatalog()) {
      expect(resource.description).toContain("Display only");
    }
  });
});

describe("the call result repeats the card pointer", () => {
  it("verify_artifact returns _meta.ui beside structuredContent", async () => {
    const { mintCertificate } = await import("@/services/certificates");
    const minted = await mintCertificate(env as never, { itemId: "hello" });
    const reply = await rpc("tools/call", {
      name: "verify_artifact",
      arguments: { id: minted.certificate.cert_id },
    });
    const result = reply["result"] as Record<string, any>;
    expect(result["structuredContent"]["valid"]).toBe(true);
    expect(result["_meta"]["ui"]["resourceUri"]).toBe(VERIFY_CARD_URI);
  });

  it("a free tool without a card carries no _meta", async () => {
    const reply = await rpc("tools/call", {
      name: "read_store_guide",
      arguments: {},
    });
    const result = reply["result"] as Record<string, any>;
    expect(result["structuredContent"]).toBeTruthy();
    expect(result["_meta"]).toBeUndefined();
  });
});

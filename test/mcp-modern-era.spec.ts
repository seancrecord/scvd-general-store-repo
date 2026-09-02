import { SELF, env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PROTOCOL,
  LATEST_PROTOCOL,
  MCP_SERVER_VERSION,
  MODERN_PROTOCOL_VERSIONS,
  PROTOCOL_VERSIONS,
} from "@/routes/mcp";
import { readMcpClients } from "@/services/mcp-clients";
import type { Env } from "@/types";
import { isRecord } from "@/types";

const testEnv = env as unknown as Env;
const BASE = "https://scvd.store";
const META_VERSION = "io.modelcontextprotocol/protocolVersion";
const META_CLIENT = "io.modelcontextprotocol/clientInfo";
const META_CAPS = "io.modelcontextprotocol/clientCapabilities";
const META_SERVER = "io.modelcontextprotocol/serverInfo";

/**
 * ONE DOOR, TWO ERAS (2026-09-02).
 *
 * Revision 2026-07-28 of the protocol removed the initialize
 * handshake: a modern client carries its version, identity and
 * capabilities in `_meta` on every request, mirrors its method into
 * headers so a gateway can route without reading the body, and asks
 * `server/discover` what `initialize` used to answer. The clients on
 * this porch span both eras, so the door answers both — and the
 * spec's compatibility matrix is explicit about what each pairing
 * must see. These tests are that matrix, row by row, plus the
 * refusals the modern transport defines as protocol-level.
 */

let rpcId = 0;

function modernMeta(client = "modern-spec"): Record<string, unknown> {
  return {
    [META_VERSION]: LATEST_PROTOCOL,
    [META_CAPS]: {},
    [META_CLIENT]: { name: client, version: "1.0.0" },
  };
}

async function post(
  method: string,
  params: Record<string, unknown> | undefined,
  headers: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  rpcId += 1;
  const response = await SELF.fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
  });
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

/** A conforming modern request: _meta in the body, the mirrors in headers. */
async function modern(
  method: string,
  params: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
) {
  const name =
    typeof params["name"] === "string"
      ? params["name"]
      : typeof params["uri"] === "string"
        ? params["uri"]
        : undefined;
  return post(
    method,
    { ...params, _meta: { ...modernMeta(), ...(params["_meta"] as object) } },
    {
      "MCP-Protocol-Version": LATEST_PROTOCOL,
      "Mcp-Method": method,
      ...(name ? { "Mcp-Name": name } : {}),
      ...extraHeaders,
    },
  );
}

function result(body: Record<string, unknown>): Record<string, unknown> {
  expect(body["error"], JSON.stringify(body["error"])).toBeUndefined();
  expect(isRecord(body["result"])).toBe(true);
  return body["result"] as Record<string, unknown>;
}

describe("the version list is one list", () => {
  it("names the modern revision first and the handshake default among the rest", () => {
    expect(PROTOCOL_VERSIONS[0]).toBe(LATEST_PROTOCOL);
    expect(MODERN_PROTOCOL_VERSIONS).toContain(LATEST_PROTOCOL);
    expect(PROTOCOL_VERSIONS).toContain(DEFAULT_PROTOCOL);
    expect(MODERN_PROTOCOL_VERSIONS).not.toContain(DEFAULT_PROTOCOL);
  });
});

describe("server/discover — the modern front door", () => {
  it("answers with versions, capabilities, identity, instructions and a cache hint", async () => {
    const { status, body } = await modern("server/discover");
    expect(status).toBe(200);
    const r = result(body);
    expect(r["resultType"]).toBe("complete");
    expect(r["supportedVersions"]).toEqual([...PROTOCOL_VERSIONS]);
    expect(isRecord(r["capabilities"])).toBe(true);
    expect((r["capabilities"] as Record<string, unknown>)["tools"]).toBeTruthy();
    expect(typeof r["instructions"]).toBe("string");
    expect(r["ttlMs"]).toBeGreaterThan(0);
    expect(r["cacheScope"]).toBe("public");
    const meta = r["_meta"] as Record<string, unknown>;
    const info = meta[META_SERVER] as Record<string, unknown>;
    expect(info["name"]).toBe("scvd-general-store");
    expect(info["version"]).toBe(MCP_SERVER_VERSION);
  });

  it("says the same thing initialize says — one server, not two", async () => {
    const discovered = result((await modern("server/discover")).body);
    const shaken = result(
      (
        await post(
          "initialize",
          { protocolVersion: DEFAULT_PROTOCOL, capabilities: {} },
          {},
        )
      ).body,
    );
    expect(discovered["capabilities"]).toEqual(shaken["capabilities"]);
    expect(discovered["instructions"]).toBe(shaken["instructions"]);
    const info = (discovered["_meta"] as Record<string, unknown>)[META_SERVER];
    expect(info).toEqual(shaken["serverInfo"]);
  });

  it("is answered for a legacy caller too, with the identity where that shape can hold it", async () => {
    const r = result((await post("server/discover", {}, {})).body);
    expect(r["supportedVersions"]).toEqual([...PROTOCOL_VERSIONS]);
    expect(isRecord(r["serverInfo"])).toBe(true);
    // No modern envelope on a legacy answer.
    expect(r["resultType"]).toBeUndefined();
  });
});

describe("modern results carry the modern envelope; legacy ones do not", () => {
  it("tools/list: resultType, serverInfo in _meta, ttlMs and cacheScope", async () => {
    const r = result((await modern("tools/list")).body);
    expect(r["resultType"]).toBe("complete");
    expect(r["ttlMs"]).toBeGreaterThan(0);
    expect(r["cacheScope"]).toBe("public");
    expect(isRecord((r["_meta"] as Record<string, unknown>)[META_SERVER])).toBe(true);
    expect(Array.isArray(r["tools"])).toBe(true);
  });

  it("the legacy tools/list is byte-for-byte the shape it always was", async () => {
    const r = result((await post("tools/list", {}, {})).body);
    expect(r["resultType"]).toBeUndefined();
    expect(r["ttlMs"]).toBeUndefined();
    expect(r["_meta"]).toBeUndefined();
  });

  it("both eras list the same tools in the same order — deterministic, cacheable", async () => {
    const a = (result((await modern("tools/list")).body)["tools"] as { name: string }[]).map((t) => t.name);
    const b = (result((await post("tools/list", {}, {})).body)["tools"] as { name: string }[]).map((t) => t.name);
    const c = (result((await modern("tools/list")).body)["tools"] as { name: string }[]).map((t) => t.name);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it("resources/read carries the cache hint; a free tools/call completes", async () => {
    const list = result((await modern("resources/list")).body);
    const first = (list["resources"] as { uri: string }[])[0]!;
    const read = result((await modern("resources/read", { uri: first.uri })).body);
    expect(read["resultType"]).toBe("complete");
    expect(read["ttlMs"]).toBeGreaterThan(0);

    const call = result(
      (await modern("tools/call", { name: "read_store_guide", arguments: {} })).body,
    );
    expect(call["resultType"]).toBe("complete");
    expect(Array.isArray(call["content"])).toBe(true);
    // Not a list: no cache hint on a call.
    expect(call["ttlMs"]).toBeUndefined();
  });
});

describe("the refusals the modern transport defines", () => {
  it("a version this door does not speak: 400 and -32022 naming what it does", async () => {
    const { status, body } = await post(
      "tools/list",
      { _meta: { ...modernMeta(), [META_VERSION]: "1900-01-01" } },
      { "MCP-Protocol-Version": "1900-01-01", "Mcp-Method": "tools/list" },
    );
    expect(status).toBe(400);
    const error = body["error"] as Record<string, unknown>;
    expect(error["code"]).toBe(-32022);
    expect((error["data"] as Record<string, unknown>)["supported"]).toEqual([
      ...PROTOCOL_VERSIONS,
    ]);
    expect((error["data"] as Record<string, unknown>)["requested"]).toBe("1900-01-01");
  });

  it("a header that disagrees with the body: 400 and -32020", async () => {
    const versionClash = await modern("tools/list", {}, {
      "MCP-Protocol-Version": DEFAULT_PROTOCOL,
    });
    expect(versionClash.status).toBe(400);
    expect((versionClash.body["error"] as Record<string, unknown>)["code"]).toBe(-32020);

    const methodClash = await modern("tools/list", {}, { "Mcp-Method": "tools/call" });
    expect(methodClash.status).toBe(400);
    expect((methodClash.body["error"] as Record<string, unknown>)["code"]).toBe(-32020);

    const nameClash = await modern(
      "tools/call",
      { name: "read_store_guide", arguments: {} },
      { "Mcp-Name": "ring_bell" },
    );
    expect(nameClash.status).toBe(400);
    expect((nameClash.body["error"] as Record<string, unknown>)["code"]).toBe(-32020);
  });

  it("a modern request with no Mcp-Method header is refused, not guessed at", async () => {
    const { status, body } = await post(
      "tools/list",
      { _meta: modernMeta() },
      { "MCP-Protocol-Version": LATEST_PROTOCOL },
    );
    expect(status).toBe(400);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe(-32020);
  });

  it("decodes the Base64 sentinel on Mcp-Name before comparing", async () => {
    const encoded = `=?base64?${btoa("read_store_guide")}?=`;
    const { status, body } = await modern(
      "tools/call",
      { name: "read_store_guide", arguments: {} },
      { "Mcp-Name": encoded },
    );
    expect(status).toBe(200);
    result(body);
  });

  it("an unknown method is a 404 for a modern caller — the signal that separates 'modern server' from 'no server'", async () => {
    const { status, body } = await modern("no/such/method");
    expect(status).toBe(404);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe(-32601);
    // The legacy caller keeps the 200 it always got.
    const legacy = await post("no/such/method", {}, {});
    expect(legacy.status).toBe(200);
  });

  it("resource-not-found moved to -32602 under the modern revision, and stays -32002 for legacy", async () => {
    const gone = await modern("resources/read", { uri: "scvd://nothing-here" });
    expect((gone.body["error"] as Record<string, unknown>)["code"]).toBe(-32602);
    const legacy = await post("resources/read", { uri: "scvd://nothing-here" }, {});
    expect((legacy.body["error"] as Record<string, unknown>)["code"]).toBe(-32002);
  });
});

describe("the legacy handshake is untouched, and negotiates by the old rule", () => {
  it("echoes a handshake-era version it speaks", async () => {
    const r = result(
      (await post("initialize", { protocolVersion: "2025-06-18", capabilities: {} }, {})).body,
    );
    expect(r["protocolVersion"]).toBe("2025-06-18");
    expect(r["resultType"]).toBeUndefined();
  });

  it("offers the newest handshake-era revision to a version it does not, never the modern one", async () => {
    const unknown = result(
      (await post("initialize", { protocolVersion: "1900-01-01", capabilities: {} }, {})).body,
    );
    expect(unknown["protocolVersion"]).toBe(DEFAULT_PROTOCOL);
    // initialize is a legacy act; 2026-07-28 has no handshake to offer.
    const modernAsk = result(
      (await post("initialize", { protocolVersion: LATEST_PROTOCOL, capabilities: {} }, {})).body,
    );
    expect(modernAsk["protocolVersion"]).toBe(DEFAULT_PROTOCOL);
  });

  it("a legacy client's MCP-Protocol-Version header on later requests is honoured, not mistaken for modern", async () => {
    const { status, body } = await post(
      "tools/list",
      {},
      { "MCP-Protocol-Version": "2025-06-18" },
    );
    expect(status).toBe(200);
    expect(result(body)["resultType"]).toBeUndefined();
  });
});

describe("the census counts a modern visitor once, from _meta", () => {
  it("records the client named in _meta on discover and tools/list, not on every call", async () => {
    await modern("server/discover", { _meta: modernMeta("modern-census-client") });
    await vi.waitFor(async () => {
      const census = await readMcpClients(testEnv);
      expect(census["modern-census-client"]).toBeGreaterThanOrEqual(1);
    });
    const before = (await readMcpClients(testEnv))["modern-census-client"] ?? 0;
    await modern("tools/call", {
      name: "read_store_guide",
      arguments: {},
      _meta: modernMeta("modern-census-client"),
    });
    // A tool call is not an arrival.
    expect((await readMcpClients(testEnv))["modern-census-client"] ?? 0).toBe(before);
  });
});

describe("the door's own documents describe both ways in", () => {
  it("the manifest prints a discover example that works, beside the handshake", async () => {
    const manifest = (await (await SELF.fetch(`${BASE}/.well-known/mcp`)).json()) as {
      discover: { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> };
      free_methods: string[];
      protocol_versions: string[];
    };
    expect(manifest.free_methods).toContain("server/discover");
    expect(manifest.protocol_versions[0]).toBe(LATEST_PROTOCOL);
    const response = await SELF.fetch(manifest.discover.url, {
      method: manifest.discover.method,
      headers: manifest.discover.headers,
      body: JSON.stringify(manifest.discover.body),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(result(body)["supportedVersions"]).toEqual([...PROTOCOL_VERSIONS]);
  });

  it("the A2A card names the modern revision as MCP's own version", async () => {
    const card = (await (await SELF.fetch(`${BASE}/.well-known/a2a.json`)).json()) as {
      supportedInterfaces: { protocolBinding: string; protocolVersion: string }[];
    };
    const mcp = card.supportedInterfaces.find((i) => i.protocolBinding.includes("modelcontextprotocol"));
    expect(mcp?.protocolVersion).toBe(LATEST_PROTOCOL);
  });
});

describe("owners.json — the claim VerifyMCP reads", () => {
  it("is served at the host root, names the published contact, and nothing else", async () => {
    const response = await SELF.fetch(`${BASE}/.well-known/owners.json`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { $schema: string; owners: string[] };
    expect(body.$schema).toBe("https://verifymcp.io/schemas/owners.json");
    expect(body.owners).toHaveLength(1);
    expect(body.owners[0]).toMatch(/^[^@\s]+@[^@\s]+$/);
    expect(Object.keys(body).sort()).toEqual(["$schema", "owners"]);
  });
});

describe("every tool shows a worked call", () => {
  it("carries at least one example that satisfies its own required fields", async () => {
    const r = result((await modern("tools/list")).body);
    for (const tool of r["tools"] as Array<{ name: string; inputSchema: Record<string, unknown> }>) {
      const examples = tool.inputSchema["examples"];
      expect(Array.isArray(examples), `${tool.name} has no examples`).toBe(true);
      expect((examples as unknown[]).length, `${tool.name} examples empty`).toBeGreaterThan(0);
      const required = (tool.inputSchema["required"] ?? []) as string[];
      const properties = (tool.inputSchema["properties"] ?? {}) as Record<string, Record<string, unknown>>;
      for (const example of examples as Record<string, unknown>[]) {
        for (const field of required) {
          expect(example, `${tool.name} example lacks required ${field}`).toHaveProperty(field);
        }
        for (const [field, value] of Object.entries(example)) {
          const schema = properties[field];
          expect(schema, `${tool.name} example names unknown field ${field}`).toBeTruthy();
          const allowed = schema!["enum"];
          if (Array.isArray(allowed)) {
            expect(allowed, `${tool.name}.${field} example off the enum`).toContain(value);
          }
        }
      }
    }
  });
});

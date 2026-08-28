import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROTOCOL } from "@/routes/mcp";

/**
 * THE MANIFEST PATH ANSWERS THE PROTOCOL, NOT JUST DESCRIBES IT.
 *
 * 2026-08-26. A scanner reported "MCP server in registry but no live
 * protocol handshake" against a server that has answered `initialize`
 * since it opened. It had POSTed its JSON-RPC to `/.well-known/mcp`
 * — the MANIFEST path — rather than reading `endpoint` out of the
 * manifest and POSTing to `/mcp`, and taken the 405 as the answer.
 *
 * The 405 body said, in plain English, that the path was served and
 * the method was wrong. The scanner ignored it, which tells us
 * something load-bearing about the reader: it branches on the status
 * code and never opens the body. Prose cannot reach a client like
 * that. A route can.
 *
 * WHAT THESE TESTS HOLD, and why each one is here rather than
 * assumed:
 *
 * - Both mounts complete a real handshake, and negotiate the SAME
 *   protocol version as /mcp. Two doors to one server; the moment
 *   they can disagree, the manifest is lying about one of them.
 * - GET is untouched. The fix is additive or it is a regression
 *   dressed as a fix.
 * - The manifest's own `handshake` object works when executed
 *   literally, field for field, by a client that does exactly what
 *   the document says and nothing more. That object is the store's
 *   instruction to a stranger; an instruction nobody executes in
 *   test is an instruction nobody has checked.
 */

const BASE = "https://scvd.store";

/** Every path that must complete a handshake, and why it exists. */
const HANDSHAKE_PATHS = [
  // The endpoint the manifest names. The original and the canonical.
  "/mcp",
  // The manifest path a scanner POSTs to instead of reading it.
  "/.well-known/mcp",
  // Same guess, plus the extension half of them append.
  "/.well-known/mcp.json",
] as const;

function initializeBody(id: number | string = 1) {
  return {
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: DEFAULT_PROTOCOL,
      capabilities: {},
      clientInfo: { name: "handshake-spec", version: "1.0.0" },
    },
  };
}

async function initialize(path: string): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(initializeBody()),
  });
}

describe("the MCP handshake, at every path a client actually tries", () => {
  it("completes an initialize on the endpoint and on both manifest paths", async () => {
    const versions: string[] = [];

    for (const path of HANDSHAKE_PATHS) {
      const response = await initialize(path);
      // The finding, inverted: a 405 here is the whole defect.
      expect(response.status, `${path} status`).toBe(200);

      const body = (await response.json()) as {
        jsonrpc?: string;
        id?: unknown;
        result?: Record<string, unknown>;
        error?: unknown;
      };
      expect(body.error, `${path} error`).toBeUndefined();
      expect(body.jsonrpc, `${path} jsonrpc`).toBe("2.0");
      expect(body.id, `${path} id`).toBe(1);

      const result = body.result ?? {};
      // A handshake that returns no serverInfo is not a handshake a
      // client can proceed from.
      expect(result["serverInfo"], `${path} serverInfo`).toBeTruthy();
      expect(result["capabilities"], `${path} capabilities`).toBeTruthy();

      versions.push(String(result["protocolVersion"]));
    }

    /*
     * ONE SERVER, DERIVED — not three constants that happen to match
     * today (rule 46). The versions are compared to each other and to
     * the module the server negotiates from, so a change to the
     * protocol moves all three or fails here.
     */
    expect(new Set(versions).size, `negotiated: ${versions.join(", ")}`).toBe(1);
    expect(versions[0]).toBe(DEFAULT_PROTOCOL);
  });

  it("still serves the manifest on GET, at both of its paths", async () => {
    for (const path of ["/.well-known/mcp", "/.well-known/mcp.json"]) {
      const response = await SELF.fetch(`${BASE}${path}`);
      expect(response.status, `${path} status`).toBe(200);

      const body = (await response.json()) as Record<string, unknown>;
      // The manifest is a pointer first. If GET ever starts answering
      // JSON-RPC, the discovery document has been eaten by the door.
      expect(String(body["endpoint"]), `${path} endpoint`).toBe(`${BASE}/mcp`);
      expect(body["transport"], `${path} transport`).toBe("streamable-http");
      expect(body["jsonrpc"], `${path} is not an RPC reply`).toBeUndefined();
    }
  });

  it("completes the handshake the manifest itself prints, executed literally", async () => {
    /*
     * NOTHING IS READ FROM THIS TEST'S OWN KNOWLEDGE. The method, the
     * URL, the headers and the body all come out of the served
     * document, so this fails if the manifest ever describes a
     * handshake the server would refuse — which is the failure mode
     * that produced this file in the first place, one layer up.
     */
    const manifest = (await (
      await SELF.fetch(`${BASE}/.well-known/mcp`)
    ).json()) as {
      handshake: {
        method: string;
        url: string;
        headers: Record<string, string>;
        body: unknown;
      };
      protocol_versions: string[];
    };

    const { method, url, headers, body } = manifest.handshake;
    const response = await SELF.fetch(url, {
      method,
      headers,
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);

    const answer = (await response.json()) as {
      result?: Record<string, unknown>;
      error?: unknown;
    };
    expect(answer.error).toBeUndefined();

    /*
     * The negotiated version must be one the manifest ADVERTISES. A
     * document promising a version the server will not speak is worse
     * than a document with no versions in it.
     */
    const negotiated = String(answer.result?.["protocolVersion"]);
    expect(manifest.protocol_versions).toContain(negotiated);
  });

  it("keeps the wrong-method answer for methods that are still wrong", async () => {
    /*
     * The fix is a second METHOD, not an open path. DELETE was never
     * a door here and still is not — and the 405 it gets now has to
     * name both methods that are, because index.ts counts the router
     * rather than remembering a list.
     */
    const response = await SELF.fetch(`${BASE}/.well-known/mcp`, {
      method: "DELETE",
    });
    expect(response.status).toBe(405);

    const allow = response.headers.get("Allow") ?? "";
    expect(allow).toContain("GET");
    expect(allow).toContain("POST");

    const body = (await response.json()) as { error?: string; allow?: string[] };
    expect(body.allow).toEqual(expect.arrayContaining(["GET", "POST"]));
    expect(String(body.error)).toContain("DELETE");
  });

  it("refuses a non-JSON-RPC body at the manifest path, exactly as /mcp does", async () => {
    /*
     * The mount is the same function, so the refusal must be the same
     * refusal. If these two ever differ, the protocol logic has been
     * copied rather than shared.
     */
    const bodies = await Promise.all(
      HANDSHAKE_PATHS.map(async (path) => {
        const response = await SELF.fetch(`${BASE}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ hello: "not rpc" }),
        });
        return (await response.json()) as { error?: { code?: number } };
      }),
    );

    for (const body of bodies) {
      expect(body.error?.code).toBe(-32700);
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
  });
});

/**
 * THE CARD'S VERSION IS THE HANDSHAKE'S VERSION (scanner finding C2,
 * 2026-08-27). The SEP-2127 server-card shape requires name,
 * description, version — and the card had 15 keys with version not
 * among them, while the server declared one in every initialize
 * result. The scvd-tab package once shipped a handshake saying 0.2.0
 * while the package said 0.3.0; that drift class is what this pins:
 * ONE fetch of each document, compared to each other, never to a
 * literal (rule 46).
 */
describe("the server card carries the server's own version", () => {
  it("card.version strictly equals the serverInfo.version initialize returns", async () => {
    const card = (await (
      await SELF.fetch(`${BASE}/.well-known/mcp.json`)
    ).json()) as Record<string, unknown>;
    const handshake = (await (await initialize("/mcp")).json()) as {
      result?: { serverInfo?: { version?: unknown } };
    };
    const declared = handshake.result?.serverInfo?.version;
    expect(typeof declared).toBe("string");
    expect(card["version"]).toBe(declared);
    // Semver-shaped, never a range — the SEP rejects '^', '~', 'x'.
    expect(String(card["version"])).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });
});

describe("the card has a face", () => {
  it("carries icons whose src actually answers", async () => {
    // Scanner, 2026-08-28: name and description but no icon. SEP-2127
    // lists icons as optional; a card in a host picker without one is
    // the anonymous grey square. The src is fetched, not assumed — an
    // icon URL that 404s is worse than none.
    const card = (await (
      await SELF.fetch(`${BASE}/.well-known/mcp.json`)
    ).json()) as { icons?: Array<{ src: string; mimeType: string }> };
    expect(Array.isArray(card.icons)).toBe(true);
    expect(card.icons!.length).toBeGreaterThanOrEqual(1);
    for (const icon of card.icons!) {
      const response = await SELF.fetch(icon.src);
      expect(response.status, icon.src).toBe(200);
      expect(response.headers.get("Content-Type") ?? "").toContain(
        icon.mimeType.split("/")[0] ?? "",
      );
    }
  });
});

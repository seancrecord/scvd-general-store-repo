#!/usr/bin/env node
/**
 * THE FOUR-HOST RENDER TEST — a throwaway MCP server for the keeper's
 * laptop. NOT the store, NOT deployed, NOT a dependency of anything.
 *
 * It exists to answer one question before the P8 shape ruling takes
 * effect: does the verdict card's refusal survive four hosts' own
 * styling, or does one of them shrink the unclimbed rungs into fine
 * print? (docs/WEBMCP_AND_MCP_APPS_2026-08.md §8.5.)
 *
 * One tool, `verify_reading`, returns a fixed observation and points
 * at a ui:// resource carrying card.html. Wire details are from the
 * spec repo read 2026-08-27, not from secondary coverage:
 *   - tool _meta:   { ui: { resourceUri } }          (nested object)
 *   - resource mime: "text/html;profile=mcp-app"
 *   - iframe CSP is deny-by-default, so the card uses system fonts.
 *
 * Zero dependencies. Two transports:
 *   node server.mjs              stdio  (Claude Desktop, VS Code, Goose)
 *   node server.mjs --http 8765  HTTP   (ChatGPT dev mode, via a tunnel)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const CARD = readFileSync(join(HERE, "card.html"), "utf8");
const RESOURCE_URI = "ui://scvd-render-test/verify-card.html";
const MIME = "text/html;profile=mcp-app";

const READING = {
  verdict: "ready",
  reached_level: "L3a",
  observed: "2026-08-08",
  age_days: 19,
  expires_in_days: 11,
  checks_vector: [
    { name: "status-402", state: "pass" },
    { name: "payment-required-header", state: "pass" },
    { name: "x402-version", state: "pass" },
    { name: "accepts", state: "pass" },
  ],
  not_climbed: ["L3b", "L3c", "L3d", "L4-L6"],
  single_probe_note:
    "One request, one moment. A passing preflight quoted as an uptime claim is a misquote.",
};

// The text fallback IS the test's control group: hosts that drop the
// extension show this, and it must carry the same refusability.
const TEXT_FALLBACK = [
  "Ready at L3a — the challenge is well-formed. That is the whole claim.",
  "Observed 2026-08-08 (19 days ago); expires in 11 days. One probe, one moment.",
  "NOT climbed: L3b internal consistency, L3c authenticity, L3d cross-probe, L4-L6 purchasability.",
  "You know your own risk better than we do.",
].join("\n");

function trace(line) {
  try {
    writeFileSync(
      join(HERE, "render-test-trace.log"),
      `${new Date().toISOString()} ${line}\n`,
      { flag: "a" },
    );
  } catch {
    /* tracing must never break the handshake */
  }
}

function handle(msg) {
  const { id, method } = msg;
  if (method) {
    const uri =
      method === "resources/read" ? ` uri=${msg.params?.uri ?? "?"}` : "";
    trace(`${method}${uri}`);
  }
  const reply = (result) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize":
      /*
       * THE DIAGNOSTIC THAT DECIDES A "NO CARD" RESULT. The host is
       * the party that advertises MCP Apps support — via
       * capabilities.extensions["io.modelcontextprotocol/ui"] in its
       * initialize params (spec 2026-01-26, Capability Negotiation).
       * If that key is absent here, the host is not offering the
       * extension on this connection and a missing card is a
       * host-capability finding, not a kit bug. Written to a file so
       * the keeper can read it without spelunking host logs.
       */
      try {
        writeFileSync(
          join(HERE, "render-test-log.json"),
          JSON.stringify(
            {
              when: new Date().toISOString(),
              client: msg.params?.clientInfo ?? null,
              protocolVersion: msg.params?.protocolVersion ?? null,
              client_capabilities: msg.params?.capabilities ?? null,
              host_offers_mcp_apps: Boolean(
                msg.params?.capabilities?.extensions?.[
                  "io.modelcontextprotocol/ui"
                ],
              ),
            },
            null,
            2,
          ),
        );
      } catch {
        /* a read-only folder loses the log, never the handshake */
      }
      return reply({
        protocolVersion: msg.params?.protocolVersion ?? "2025-06-18",
        capabilities: {
          tools: {},
          resources: {},
          extensions: {
            "io.modelcontextprotocol/ui": { mimeTypes: [MIME] },
          },
        },
        serverInfo: { name: "scvd-render-test", version: "0.0.1" },
        instructions:
          "A throwaway render test. Call verify_reading and look at what renders.",
      });
    case "ping":
      return reply({});
    case "tools/list":
      return reply({
        tools: [
          {
            name: "verify_reading",
            description:
              "Return the fixed test observation (obs_7f3a) with its verdict card. Ask: 'verify obs_7f3a'.",
            inputSchema: { type: "object", properties: {}, additionalProperties: true },
            _meta: { ui: { resourceUri: RESOURCE_URI } },
          },
        ],
      });
    case "tools/call":
      return reply({
        content: [{ type: "text", text: TEXT_FALLBACK }],
        structuredContent: READING,
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      });
    case "resources/list":
      return reply({
        resources: [
          { uri: RESOURCE_URI, name: "verify-card", mimeType: MIME },
        ],
      });
    case "resources/read":
      return reply({
        contents: [{ uri: RESOURCE_URI, mimeType: MIME, text: CARD }],
      });
    default:
      if (id === undefined) return null; // notification — say nothing
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Not on this bench: ${method}` },
      };
  }
}

const httpFlag = process.argv.indexOf("--http");
if (httpFlag !== -1) {
  const port = Number(process.argv[httpFlag + 1] ?? 8765);
  createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405).end("POST JSON-RPC here.");
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      let out = null;
      try {
        out = handle(JSON.parse(body));
      } catch {
        out = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } };
      }
      res.writeHead(out ? 200 : 202, { "Content-Type": "application/json" });
      res.end(out ? JSON.stringify(out) : "");
    });
  }).listen(port, () => {
    console.error(`render-test listening on http://localhost:${port} (POST JSON-RPC)`);
  });
} else {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const out = handle(JSON.parse(line));
        if (out) process.stdout.write(JSON.stringify(out) + "\n");
      } catch {
        /* a malformed line gets silence, not a crash */
      }
    }
  });
}

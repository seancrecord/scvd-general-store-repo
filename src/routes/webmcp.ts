import { Hono } from "hono";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import type { McpTool } from "@/lib/mcp-tools";
import type { HonoEnv } from "@/types";

/**
 * THE WEBMCP DOOR (P7, unblocked 2026-08-27; design doc §10 and §12).
 *
 * WebMCP is the browser's own tool surface: a page registers tools on
 * `document.modelContext` (or `navigator.modelContext`, the trial's
 * older root, read second) and an agent RESIDENT IN THE VISITOR'S
 * BROWSER — Chrome/Edge origin trials, ChatGPT Desktop, Brave Leo —
 * discovers them by arriving. Since 2026-09-05 the script rides EVERY
 * room, not only the storefront and the till pages: arrival is
 * discovery only if the door is wherever the agent arrives, and the
 * script fence (lib/csp.ts) rides every HTML answer for the same
 * reason. Handlers answer in the spec's shape — MCP's content array,
 * one compact text block — take the host's AbortSignal, and pass it
 * to the fetch so a cancelled call cancels the request. No server connection, no directory, no
 * auth beyond the browsing session itself. API shape read from the
 * spec repo first-hand (webmachinelearning/webmcp, 2026-08-27):
 * `document.modelContext.registerTool({name, description, inputSchema,
 * execute})`, secure context, gated by the `tools` permissions policy.
 *
 * THE BUILD CONSTRAINT, from the keeper's ruling: not small enough to
 * be wrong about — smart enough not to create risk or headache, which
 * measured as two questions with construction answers:
 *
 * CAN IT ACT? No. The registered set derives from the MCP catalog's
 * free, read-only tools (readOnlyHint === true, no itemId/itemIds),
 * so nothing that writes and nothing that can take money can appear
 * here — the same class of guard as the MCP Apps payment-surface
 * test, and a test pins this one too. Every handler is a fetch to a
 * public endpoint this store already serves; the script holds no
 * keys, no wallet code, and asks the visitor for nothing. Rule 17's
 * property, on the store's second executable surface.
 *
 * CAN IT DRIFT? No. Names, input schemas and annotations are the
 * MCP catalog's own objects, and the description is the catalog
 * row's own short form (McpTool.summary), serialized into the script
 * at request time — one source for both doors, the MENU_ITEMS/ROOMS pattern.
 * A tool renamed or retired on the MCP door changes here on the same
 * deploy without anyone editing a list. The only hand-written part
 * is the endpoint map below, and webmcpUnhandledTools() lets a test
 * refuse the build when derivation outruns it.
 *
 * P7 TRACKING: every fetch the handlers make carries ?src=webmcp —
 * the same designed self-identification the skill uses — and
 * inferChannel names it as its own channel.
 */

/**
 * The endpoint each WebMCP tool's handler calls. Public, same-origin.
 * Exported since 2026-09-03 (roadmap C4): /openapi-tools.json derives
 * its HTTP door per tool from THIS map, so the browser surface and the
 * function-calling document cannot name different doors for one tool.
 */
export const TOOL_ENDPOINTS: Readonly<
  Record<string, { method: "GET" | "POST"; path: string }>
> = {
  read_store_guide: { method: "GET", path: "/llms.txt" },
  preflight_endpoint: { method: "POST", path: "/api/preflight/v2" },
  /*
   * The dry run belongs on the browser surface for the same reason it
   * belongs on MCP: the moment it serves is the moment before a
   * payment, and an agent in someone's browser is as likely to be
   * standing in that moment as one in a tool loop. Free, read-only,
   * one probe, nothing signed.
   */
  check_before_you_pay: { method: "POST", path: "/api/before-you-pay/v1" },
  /* The look belongs in a browser for the same reason the dry run does: an agent in someone's browser is as likely to be holding a URL and a wallet as one in a tool loop. Free, read-only, one probe plus our own chain. */
  look_at_door: { method: "POST", path: "/api/look/v1" },
  check_conformance: { method: "POST", path: "/api/conformance/v1" },
  verify_artifact: { method: "GET", path: "/api/verify/{id}" },
  /* The poll half of the async job, for an agent in a browser holding an order id: free, read-only, the store's own books. */
  check_order: { method: "GET", path: "/api/order/{order_id}" },
};

/** Free and read-only, derived — the only tools the browser surface may carry. */
export function webmcpTools(): McpTool[] {
  return mcpToolCatalog("https://scvd.store").filter(
    (tool) =>
      !tool.itemId &&
      !tool.itemIds &&
      tool.annotations?.readOnlyHint === true,
  );
}

/**
 * Derivation outrunning the handler map must fail a test, not silently
 * drop a tool (the derive-or-refuse pattern, rule 46).
 */
export function webmcpUnhandledTools(): string[] {
  return webmcpTools()
    .map((tool) => tool.name)
    .filter((name) => !TOOL_ENDPOINTS[name]);
}

/** The registrations, serialized for the script: catalog objects verbatim. */
function registrations(): string {
  return JSON.stringify(
    webmcpTools()
      .filter((tool) => TOOL_ENDPOINTS[tool.name])
      .map((tool) => ({
        name: tool.name,
        // The short, descriptive form (McpTool.summary says why); a
        // tool without one is refused by test, never served long.
        description: tool.summary ?? tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        endpoint: TOOL_ENDPOINTS[tool.name],
      })),
    null,
    2,
  );
}

/**
 * The served script. Plain ES module, no dependencies, no build step —
 * the till's pattern. Feature-detects and no-ops in a browser without
 * the API; registers the derived read-only set in one that has it.
 */
export function webmcpScript(): string {
  return `/*
 * scvd.store WebMCP surface — the store's free evidence instruments,
 * registered for the agent in YOUR browser. Read-only by derivation:
 * every tool here mirrors a public endpoint, nothing can act on your
 * behalf, and nothing that moves money is registered. House rule:
 * nothing from this store can act without your decision, and we never
 * ask for credentials, keys, or wallet secrets.
 */
(function () {
  "use strict";
  // Two-headed detection, in spec order: document.modelContext is the
  // surface the spec settled on; navigator.modelContext is what the
  // origin trial shipped and Chrome 150 deprecated. Read both, survive
  // neither (which is nearly every browser there is).
  var mc = (typeof document !== "undefined" && document.modelContext) ||
    (typeof navigator !== "undefined" && navigator.modelContext);
  if (!mc || typeof mc.registerTool !== "function") return;

  var TOOLS = ${registrations()};

  // Every fetch self-identifies as the WebMCP channel (?src=webmcp),
  // the same designed marker the skill uses. It tags the store's own
  // ledger and nothing else; no cookies, no storage, no identifiers.
  function tag(path) {
    return path + (path.indexOf("?") === -1 ? "?" : "&") + "src=webmcp";
  }

  // The handler's answer, in the shape the spec fixes: MCP's own
  // content array, the endpoint's JSON as one compact text block, and
  // the same object under structuredContent for a host that reads it.
  function answer(payload) {
    return {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  }
  function call(endpoint, args, signal) {
    // Every {placeholder} in the door's path is the argument of that
    // name, URL-encoded; a GET door carries its input in the path.
    var path = endpoint.path.replace(/\{([a-z_]+)\}/g, function (_m, name) {
      return encodeURIComponent(String(args[name] || ""));
    });
    var init = { method: endpoint.method };
    if (endpoint.method === "POST") {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(args || {});
    }
    // A cancelled call aborts the request too, not only the promise.
    if (signal) init.signal = signal;
    return fetch(tag(path), init).then(function (response) {
      var type = response.headers.get("Content-Type") || "";
      if (type.indexOf("json") !== -1) {
        return response.json().then(answer);
      }
      return response.text().then(function (text) {
        return answer({ guide: text });
      });
    });
  }

  TOOLS.forEach(function (tool) {
    var registration = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: tool.annotations,
      // (input, { signal }): the second argument carries the host's
      // AbortSignal; an already-aborted call never touches the network.
      execute: function (args, opts) {
        var signal = opts && opts.signal ? opts.signal : undefined;
        if (signal && typeof signal.throwIfAborted === "function") signal.throwIfAborted();
        return call(tool.endpoint, args || {}, signal);
      },
    };
    Promise.resolve()
      .then(function () { return mc.registerTool(registration); })
      .catch(function () { /* permission withheld: the browser's call, honored silently */ });
  });
})();
`;
}

export const webmcpRoutes = new Hono<HonoEnv>();

webmcpRoutes.get("/webmcp.js", (c) => {
  c.header("Content-Type", "text/javascript; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(webmcpScript());
});

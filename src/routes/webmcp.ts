import purchaseSource from "../../webmcp/purchase.js";
import { MENU_ITEMS } from "@/store";
import { Hono } from "hono";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import type { McpTool } from "@/lib/mcp-tools";
import type { HonoEnv } from "@/types";

/**
 * Browser tools derive the free instruments from MCP. The purchase bridge is
 * explicit: a free quote, then an already-signed buyer authorization. The
 * September 4 WebMCP draft provides consequentialHint, not a wallet API.
 * See docs/SPEC_READS.md, 2026-09-06. Nothing signs or retries by itself.
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
  /* The shelf, searchable: the first two steps of the journey a browser agent is most likely to be on. */
  find_in_catalog: { method: "GET", path: "/api/catalog/v1" },
};

/** The free instrument set, derived from MCP; purchase tools are defined below. */
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

export function webmcpPurchaseTools() {
  return [
    {
      name: "quote_store_purchase",
      description: "A free x402 v2 quote for a catalog buy_url or paid publication URL, including query inputs. Returns offered networks, atomic USDC amounts, a quote_id and retry key. No wallet is opened and no payment is sent. The compact catalog is /menu.json?view=compact.",
      inputSchema: { type: "object", properties: { buy_url: { type: "string", description: "A buy_url on this store with the required query inputs filled in." } }, required: ["buy_url"], additionalProperties: false },
      annotations: { readOnlyHint: true, consequentialHint: false },
      operation: "quote",
    },
    {
      name: "complete_store_purchase",
      description: "Submits a buyer-authorized, already-signed x402 v2 payment for a quote from this page. May transfer USDC. Returns the goods or order, HTTP status and payment receipt. Requires a compatible external wallet/client; never accepts private keys or wallet secrets. Retries reuse the quote's original URL and key. Cancellation does not prove settlement stopped.",
      inputSchema: { type: "object", properties: { quote_id: { type: "string" }, signed_payment: { type: "object", description: "The signed x402 v2 JSON payload from the buyer's wallet/client, containing x402Version, accepted and payload." } }, required: ["quote_id", "signed_payment"], additionalProperties: false },
      annotations: { readOnlyHint: false, consequentialHint: true },
      operation: "complete",
    },
  ];
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
        /*
         * WHAT COMES BACK, not only how to ask (2026-09-06). Every
         * catalogue row has carried an outputSchema since the surface
         * contract; this serializer dropped it, so a browser agent
         * had to call a tool to learn what a call returns — the one
         * cost the schema exists to remove — and a planner could not
         * see that find_in_catalog hands back the id the next tool
         * takes. Passed through, never restated: one schema, both
         * doors, no way for them to drift.
         */
        outputSchema: tool.outputSchema,
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
 * the API; registers free instruments and the explicit purchase bridge.
 */
export function webmcpScript(): string {
  return `/*
 * scvd.store WebMCP surface — free instruments and an explicit buyer-signed
 * purchase bridge for the agent in YOUR browser. House rule:
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
  var PURCHASE_TOOLS = ${JSON.stringify(webmcpPurchaseTools(), null, 2)};
  var purchaseBridge;
  function bridge() {
    if (!purchaseBridge) purchaseBridge = import("/webmcp-purchase.js").then(function (module) {
      return module.createPurchaseBridge({ origin: location.origin, itemIds: ${JSON.stringify(MENU_ITEMS.map(item => item.id))} });
    });
    return purchaseBridge;
  }

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
    // name, URL-encoded. Anything left over rides the query string on
    // a GET, because a GET door has nowhere else to carry an input —
    // before this, a GET tool's arguments reached the server only if
    // the path happened to name them.
    var used = {};
    var path = endpoint.path.replace(/\{([a-z_]+)\}/g, function (_m, name) {
      used[name] = true;
      return encodeURIComponent(String(args[name] || ""));
    });
    var init = { method: endpoint.method };
    if (endpoint.method === "POST") {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(args || {});
    } else {
      var query = [];
      Object.keys(args || {}).forEach(function (key) {
        if (used[key]) return;
        var value = args[key];
        if (value === undefined || value === null || value === "") return;
        query.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
      });
      if (query.length) path += (path.indexOf("?") === -1 ? "?" : "&") + query.join("&");
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

  TOOLS.concat(PURCHASE_TOOLS).forEach(function (tool) {
    var registration = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      // (input, { signal }): the second argument carries the host's
      // AbortSignal; an already-aborted call never touches the network.
      execute: function (args, opts) {
        var signal = opts && opts.signal ? opts.signal : undefined;
        if (signal && typeof signal.throwIfAborted === "function") signal.throwIfAborted();
        if (tool.operation) return bridge().then(function (purchase) {
          return purchase[tool.operation](args || {}, signal);
        });
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
  /*
   * Five minutes, and the conditional-GET layer supplies the ETag
   * that makes each re-check cost a header rather than 12KB. Short
   * because a tool registered today should reach an already-open tab
   * today; the validator is what makes short cheap.
   */
  c.header("Cache-Control", "public, max-age=300");
  /*
   * No sniffing. The till has said this since it shipped and this
   * script did not, which was an inconsistency rather than a
   * decision: a script served without it is a script somebody else's
   * browser guessed the type of.
   */
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(webmcpScript());
});

webmcpRoutes.get("/webmcp-purchase.js", (c) => c.body(purchaseSource, 200, {
  "Content-Type": "text/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=300, must-revalidate",
  "X-Content-Type-Options": "nosniff",
}));

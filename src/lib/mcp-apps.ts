/**
 * MCP APPS — THE CARDS (2026-08-27, shipped the day the four-host
 * test closed; docs/WEBMCP_AND_MCP_APPS_2026-08.md is the record).
 *
 * A card is the store's answer to the one hop no JSON survives: the
 * agent's summary to its human. Prose flattens "ready, at L3a, one
 * probe, four rungs never climbed" into "ready"; a rendered card
 * puts the reading itself in front of the person, gaps at the same
 * weight as the finding. Rule 54 governs every pixel here: every
 * surface we render must make refusal easier than acceptance.
 *
 * THE SHAPE, from the spec read first-hand (ext-apps, 2026-01-26):
 * a tool declares `_meta: { ui: { resourceUri } }` pointing at a
 * `ui://` resource; the host prefetches the HTML, renders it in a
 * sandboxed iframe, and the page — itself an MCP client — must
 * speak: `ui/initialize` over postMessage, then
 * `ui/notifications/initialized`, or the host shows nothing while
 * its own marker claims otherwise (observed live, three rounds).
 * Data arrives as `ui/notifications/tool-result` carrying the
 * standard CallToolResult; the template reads structuredContent and
 * fills itself. `ui/notifications/size-changed` keeps the unclimbed
 * rungs above any fold a host imposes (also observed live).
 *
 * WHAT NEVER GETS A CARD: anything that moves money. The buy_*
 * tools carry no ui metadata by design and a test pins that — rule
 * 17's amended property ("nothing from this store can act without
 * your decision") is load-bearing here, and the approval press
 * stays in the client's own chrome. Rendering is for evidence.
 *
 * SYSTEM FONTS ONLY: the host iframe runs a deny-by-default CSP, so
 * a webfont would fall back silently anyway. The card is designed
 * for the fonts the sandbox actually serves.
 */

/** The extension identifier and MIME the spec fixes. */
export const MCP_APPS_EXTENSION = "io.modelcontextprotocol/ui";
export const UI_MIME = "text/html;profile=mcp-app";

export const PREFLIGHT_CARD_URI = "ui://scvd-general-store/preflight-card.html";
export const VERIFY_CARD_URI = "ui://scvd-general-store/verify-card.html";

/** Tools that render, and the template each points at. Nothing paid. */
const TOOL_CARDS: Readonly<Record<string, string>> = {
  preflight_endpoint: PREFLIGHT_CARD_URI,
  verify_artifact: VERIFY_CARD_URI,
};

/** The `_meta` a UI-bearing tool carries, or undefined for the rest. */
export function uiMetaFor(
  toolName: string,
): { ui: { resourceUri: string } } | undefined {
  const uri = TOOL_CARDS[toolName];
  return uri ? { ui: { resourceUri: uri } } : undefined;
}

export function uiResourceCatalog(): Array<{
  uri: string;
  name: string;
  title: string;
  mimeType: string;
  description: string;
}> {
  return [
    {
      uri: PREFLIGHT_CARD_URI,
      name: "preflight-card",
      title: "The Preflight Card",
      mimeType: UI_MIME,
      description:
        "Renders a preflight reading for the human behind the agent: verdict with its reached_level ceiling, the evidence ladder with unclimbed rungs at full weight, what a single probe cannot tell you, and the store's conflict of interest. Display only; nothing on it can act.",
    },
    {
      uri: VERIFY_CARD_URI,
      name: "verify-card",
      title: "The Verify Card",
      mimeType: UI_MIME,
      description:
        "Renders a signature check on an artifact this store issued: valid or not, the artifact kind, and how to reproduce the check offline without trusting us. Display only; nothing on it can act.",
    },
  ];
}

export function readUiResource(
  uri: string,
): { uri: string; mimeType: string; text: string } | null {
  if (uri === PREFLIGHT_CARD_URI) {
    return { uri, mimeType: UI_MIME, text: preflightCardHtml() };
  }
  if (uri === VERIFY_CARD_URI) {
    return { uri, mimeType: UI_MIME, text: verifyCardHtml() };
  }
  return null;
}

/*
 * THE SHARED SHELL. One palette, both themes, the colophon — the
 * bench settled all of it (same CSS the two passing hosts rendered).
 * The keeper's line is inked (2026-08-27); the drawer holds one line
 * until more pass his pen, and a drawer of one is still a chalkboard,
 * not a slot machine (rule 22).
 */
const CARD_CSS = `
  :root {
    --ground: #eff2f1; --surface: #fafbfb; --surface-sunk: #e7ecea;
    --ink: #141d1c; --ink-muted: #596967; --ink-faint: #869593;
    --rule: #cfd8d6; --rule-strong: #a9b7b4;
    --structure: #1d4e5a; --attention: #95452b; --ok-flat: #3f5c4e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ground: #101617; --surface: #171f20; --surface-sunk: #0c1213;
      --ink: #e2e9e7; --ink-muted: #93a29f; --ink-faint: #6d7c7a;
      --rule: #2a3435; --rule-strong: #3d4a4b;
      --structure: #79b8c6; --attention: #d5876a; --ok-flat: #8fb3a1;
    }
  }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  body {
    margin: 0; padding: 8px; background: var(--ground); color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 15px; line-height: 1.55;
  }
  .card {
    max-width: 560px; margin: 0 auto; background: var(--surface);
    border: 1px solid var(--rule); border-radius: 10px; overflow: hidden;
  }
  .head { padding: 18px 22px 16px; border-bottom: 1px solid var(--rule); }
  .kicker {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px; letter-spacing: .08em; text-transform: uppercase;
    color: var(--ink-faint); display: flex; gap: 10px; flex-wrap: wrap;
    overflow-wrap: anywhere;
  }
  .verdict {
    font-family: ui-serif, Georgia, "Times New Roman", serif;
    font-size: 25px; font-weight: 600; letter-spacing: -.01em;
    margin-top: 8px; line-height: 1.15;
  }
  .qual { display: block; font-size: 14px; font-weight: 400; color: var(--ink-muted); font-style: italic; margin-top: 2px; }
  .age {
    margin-top: 8px; display: flex; gap: 8px 14px; flex-wrap: wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px; color: var(--ink-muted); font-variant-numeric: tabular-nums;
  }
  .age b { color: var(--attention); font-weight: 500; }
  .block { padding: 15px 22px; border-bottom: 1px solid var(--rule); }
  .label {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10.5px; font-weight: 600; letter-spacing: .11em;
    text-transform: uppercase; color: var(--structure); margin-bottom: 9px;
  }
  .rows { margin: 0; padding: 0; list-style: none; }
  .rung {
    display: grid; grid-template-columns: 52px minmax(0,1fr); gap: 4px 12px;
    align-items: baseline; padding: 6px 0; border-bottom: 1px dotted var(--rule);
    font-size: 13px;
  }
  .rung:last-child { border-bottom: 0; }
  .rid { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11.5px; font-weight: 600; }
  .pass .rid { color: var(--ok-flat); }
  .off .rid { color: var(--ink-faint); }
  .off .rtext { color: var(--ink-muted); }
  .fail .rid { color: var(--attention); }
  .rtext { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
  .pill {
    display: inline-block; padding: 1px 7px; border: 1px dashed var(--rule-strong);
    border-radius: 3px; font-family: ui-monospace, Menlo, monospace;
    font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--ink-faint); white-space: nowrap;
    background: repeating-linear-gradient(135deg, transparent, transparent 4px, var(--surface-sunk) 4px, var(--surface-sunk) 8px);
  }
  .pill-fail { border-style: solid; color: var(--attention); background: none; }
  .cannot { margin: 0; padding: 0; list-style: none; }
  .cannot li { font-size: 13px; line-height: 1.5; padding: 3px 0 3px 16px; position: relative; }
  .cannot li::before { content: "\\2014"; position: absolute; left: 0; color: var(--attention); }
  .conflict { margin: 0; font-size: 13px; line-height: 1.5; }
  .conflict b { color: var(--attention); }
  .foot {
    padding: 12px 22px; background: var(--surface-sunk);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px; line-height: 1.55; color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .colophon {
    padding: 13px 22px 16px; border-top: 1px solid var(--rule);
    display: flex; gap: 14px; align-items: center; flex-wrap: wrap;
  }
  .mark {
    flex: none; border: 1px solid var(--rule-strong); border-radius: 2px;
    padding: 6px 10px 5px; font-family: ui-monospace, Menlo, monospace;
    font-size: 9px; font-weight: 600; letter-spacing: .18em; text-indent: .18em;
    line-height: 1.45; text-align: center; color: var(--ink-muted);
    text-transform: uppercase;
  }
  .mark span { display: block; font-weight: 400; }
  .cline {
    min-width: 0; flex: 1 1 180px; margin: 0;
    font-family: ui-serif, Georgia, serif; font-style: italic;
    font-size: 12.5px; line-height: 1.45; color: var(--ink-muted);
  }
  .cline b {
    display: block; font-family: ui-monospace, Menlo, monospace;
    font-style: normal; font-weight: 500; font-size: 9px;
    letter-spacing: .09em; text-transform: uppercase;
    color: var(--structure); margin-top: 6px;
  }
  .waiting { padding: 26px 22px; color: var(--ink-faint); font-size: 13px; font-style: italic; }
`;

const COLOPHON_HTML = `
    <div class="colophon">
      <div class="mark">SCVD<span>Store</span></div>
      <p class="cline">"You know your own risk better than we do."
        <b>House rule 43 — dated observation, never a score</b></p>
    </div>`;

/*
 * The bridge, shared verbatim by both cards: handshake, then wait for
 * the result. Everything the page shows comes from structuredContent
 * — one derivation, so the card cannot disagree with the JSON the
 * agent read. Every value lands via textContent, never innerHTML: the
 * report quotes third-party bytes (an endpoint's detail strings) and
 * a card must not become their renderer.
 */
const BRIDGE_JS = `
    var pending = 1;
    function send(msg) { window.parent.postMessage(msg, "*"); }
    function announceSize() {
      send({ jsonrpc: "2.0", method: "ui/notifications/size-changed",
        params: { width: document.documentElement.scrollWidth,
                  height: document.documentElement.scrollHeight } });
    }
    window.addEventListener("message", function (event) {
      var m = event.data;
      if (!m || m.jsonrpc !== "2.0") return;
      if (m.id === pending && m.result) {
        send({ jsonrpc: "2.0", method: "ui/notifications/initialized" });
        requestAnimationFrame(announceSize);
        if (window.ResizeObserver) {
          new ResizeObserver(announceSize).observe(document.documentElement);
        }
        return;
      }
      if (m.method === "ui/notifications/tool-result" && m.params) {
        try { render(m.params.structuredContent || {}); } catch (e) { /* leave the waiting note */ }
        requestAnimationFrame(announceSize);
        return;
      }
      if (m.id !== undefined && m.method) {
        send({ jsonrpc: "2.0", id: m.id, result: {} });
      }
    });
    send({ jsonrpc: "2.0", id: pending, method: "ui/initialize",
      params: { protocolVersion: "2026-01-26",
        appInfo: { name: "scvd-card", version: "1.0.0" },
        appCapabilities: {} } });
`;

function page(body: string, renderJs: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${CARD_CSS}</style>
</head>
<body>
${body}
<script>
  (function () {
    if (window.parent === window) return;
    function el(id) { return document.getElementById(id); }
    function text(id, value) { el(id).textContent = value == null ? "" : String(value); }
${renderJs}
${BRIDGE_JS}
  })();
</script>
</body>
</html>`;
}

/**
 * THE PREFLIGHT CARD. Populated from the PreflightReport the tool
 * already returns — verdict, reached_level and its meaning, the
 * tri-state vector, what_this_cannot_tell_you, and the conflict of
 * interest, all fields the agent's summary is known to drop
 * (observed live, §8.5 of the design doc). The ladder prints the
 * unmeasured rungs by name because absence-because-not-climbed is
 * the distinction the tri-state work exists to protect.
 *
 * No expiry line: this reading is seconds old by construction, and
 * "one probe, one moment" is its honest freshness claim. The label
 * for stored readings ("stale after" vs "current until") is the
 * keeper's open copy call and lands with the first corpus card.
 */
function preflightCardHtml(): string {
  const body = `
  <article class="card">
    <div class="head">
      <div class="kicker"><span id="battery">preflight</span><span id="host"></span></div>
      <div class="verdict"><span id="verdict">Reading…</span>
        <span class="qual" id="qual"></span>
      </div>
      <div class="age">
        <span>observed just now</span><span>one probe, one moment</span>
        <span><b>this card does not re-probe</b></span>
      </div>
    </div>
    <div class="block">
      <div class="label">The ladder — what this battery measured</div>
      <ul class="rows" id="ladder"><li class="waiting">Waiting for the reading…</li></ul>
    </div>
    <div class="block">
      <div class="label">What this cannot tell you</div>
      <ul class="cannot" id="cannot"></ul>
    </div>
    <div class="block">
      <div class="label">Our conflict of interest</div>
      <p class="conflict" id="conflict"></p>
    </div>
    <div class="foot" id="note"></div>
${COLOPHON_HTML}
  </article>`;

  const renderJs = `
    var QUAL = {
      ready: "— the challenge is well-formed. That is the whole claim.",
      not_ready: "— at least one structural check failed. The rows say which.",
      unreachable: "— the probe never completed. That says nothing about their code."
    };
    var UNMEASURED = [
      ["L3b", "Internal consistency"],
      ["L3c", "Authenticity of the signed offers"],
      ["L3d", "Cross-probe consistency"],
      ["L4–L6", "Purchasable through delivery"]
    ];
    /* The rung each battery check gates, mirroring reachedLevel(). */
    var RUNG_ID = {
      "status-402": "L1",
      "payment-required-header": "L2",
      "x402-version": "L3a",
      "accepts": "L3a"
    };
    function rung(cls, id, label, pill, pillCls) {
      var li = document.createElement("li");
      li.className = "rung " + cls;
      var rid = document.createElement("span");
      rid.className = "rid"; rid.textContent = id;
      var rt = document.createElement("span");
      rt.className = "rtext"; rt.textContent = label + " ";
      if (pill) {
        var p = document.createElement("span");
        p.className = "pill" + (pillCls ? " " + pillCls : "");
        p.textContent = pill;
        rt.appendChild(p);
      }
      li.appendChild(rid); li.appendChild(rt);
      return li;
    }
    function render(r) {
      text("battery", "preflight " + (r.version || ""));
      text("verdict", (r.verdict || "unknown") + " at " + (r.reached_level || "?"));
      text("qual", QUAL[r.verdict] || "");
      text("conflict", r.our_conflict_of_interest || "");
      text("note", r.single_probe_note || "");
      var ladder = el("ladder");
      ladder.textContent = "";
      (r.checks_vector || []).forEach(function (row) {
        var cls = row.state === "pass" ? "pass" : row.state === "fail" ? "fail" : "off";
        var pill = row.state === "pass" ? "" : row.state === "fail" ? "failed" : "not reached";
        ladder.appendChild(rung(cls, RUNG_ID[row.name] || "\\u00b7", row.name, pill, row.state === "fail" ? "pill-fail" : ""));
      });
      UNMEASURED.forEach(function (u) {
        ladder.appendChild(rung("off", u[0], u[1], "not measured", ""));
      });
      var cannot = el("cannot");
      cannot.textContent = "";
      (r.what_this_cannot_tell_you || []).forEach(function (line) {
        var li = document.createElement("li");
        li.textContent = line;
        cannot.appendChild(li);
      });
    }
    window.addEventListener("message", function (event) {
      var m = event.data;
      if (m && m.jsonrpc === "2.0" && m.method === "ui/notifications/tool-input" && m.params) {
        var args = m.params.arguments || {};
        if (args.url) { try { text("host", new URL(args.url).host); } catch (e) { text("host", args.url); } }
      }
    });
`;
  return page(body, renderJs);
}

/**
 * THE VERIFY CARD. Thin on purpose — valid, kind, the store's word,
 * and the offline path. A signature check is binary and the card's
 * whole job is to say so without inflating it into an endorsement:
 * the qual line states what a valid signature does NOT prove, in the
 * /attestation tradition.
 */
function verifyCardHtml(): string {
  const body = `
  <article class="card">
    <div class="head">
      <div class="kicker"><span>signature check</span><span id="kind"></span></div>
      <div class="verdict"><span id="verdict">Checking…</span>
        <span class="qual" id="qual"></span>
      </div>
      <div class="age">
        <span>checked just now</span>
        <span><b>a signature, not an endorsement</b></span>
      </div>
    </div>
    <div class="block">
      <div class="label">The store's word on it</div>
      <p class="conflict" id="note"></p>
    </div>
    <div class="foot">Reproduce offline: fetch the artifact's signed bytes and public key,
      check with any ed25519 library — no network, no trusting us. If this card and
      that check ever disagree, the check is right.</div>
${COLOPHON_HTML}
  </article>`;

  const renderJs = `
    function render(r) {
      text("kind", r.kind || "");
      text("verdict", r.valid === true ? "Signature holds" : r.valid === false ? "Does not verify" : "Unknown");
      text("qual", r.valid === true
        ? "— these bytes were signed by this store's key. Nothing more."
        : r.valid === false
          ? "— not signed by this store's live key. Treat accordingly."
          : "");
      text("note", r.note || "");
    }
`;
  return page(body, renderJs);
}

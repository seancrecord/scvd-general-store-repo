/**
 * THE SIX DOORS — what an agent finds when it arrives, and by which road.
 *
 * An agent can reach an app six ways, and the store is reachable — or
 * not — down each one independently. Furthest from the interface to
 * closest: the raw API, a backend MCP server, computer use, browser
 * automation, WebMCP, and the site's own built-in assistant. The
 * lineup is not ours; it is the frame the Chrome/Edge WebMCP write-ups
 * use, and it is worth adopting precisely because it is somebody
 * else's yardstick. SIX_DOORS.md holds the reasoning; this file holds
 * the checks, so the reasoning cannot drift from what is served.
 *
 * WHAT THIS IS NOT. It is not a score on anyone, ourselves included in
 * the sense rule 43 forbids — there is no accumulating number, nothing
 * is ranked against another operator, and no door's reading survives
 * its own date. It is one dated observation of OUR OWN doors, re-taken
 * on a schedule, with the misses published beside the hits and counted
 * against us. That is the instrument we sell, pointed at the shop.
 *
 * THREE PROPERTIES THE READERS HOLD, and each one was a decision:
 *
 *   1. UNREACHABLE IS `unknown`, NEVER `unmet` (rule 52). A checker
 *      that fails a door because the network ate the request is a
 *      checker that manufactures findings, and it will do it on the
 *      exact day nobody is watching closely.
 *   2. NUMBERS ARE READ, NOT TYPED (AT_SCALE rule 1). Every count in
 *      an observation — tools, rooms, bytes, days — comes off the
 *      served bytes at read time. Nothing here memorises a figure that
 *      lives somewhere else, because the day it moves, a memorised
 *      figure becomes the store's argument for the stale version
 *      (rule 46).
 *   3. EVERY CRITERION CARRIES ITS OWN WALKABLE PATH (rule 55). The
 *      `how` field is a command or URL a reader can run without
 *      trusting us. A criterion whose verdict you have to take our
 *      word for is an opinion with an id.
 *
 * The readers are pure functions over a snapshot the caller fetched,
 * so the whole battery tests offline against synthetic bytes and
 * nothing in CI depends on production being up to be correct.
 */

/** How long a door's design assumptions stand before a human re-reads them. */
export const REVIEW_EVERY_DAYS = 90;

/** How long one observation is fresh before the reading is stale. */
export const OBSERVATION_FRESH_DAYS = 30;

/**
 * The share of published rooms that must declare the browser door
 * before the coverage criterion reads `met`.
 *
 * ⚑ A DIAL, NOT A FACT. One third is a stated arbitrary target, not a
 * derived one — the keeper's to set. It is here rather than in prose
 * so that moving it is one edit with a test behind it, and so the
 * observation records the fraction actually served either way. The
 * fraction is the finding; the threshold only decides the word.
 */
export const WEBMCP_ROOM_COVERAGE_TARGET = 1 / 3;

/** Home page bytes above which a pixel-reading agent is paying for our layout. */
export const FRONT_DOOR_BYTE_BUDGET = 200_000;

const DAY = 86_400_000;

/* ── snapshot helpers ────────────────────────────────────────────────
 * Every reader takes the same shape: `snap.get(key)` answers with
 * { ok, status, bytes, text, json, error } or undefined when the
 * fetch was never attempted. `unknown` is the honest verdict for both.
 */

const met = (note) => ({ verdict: "met", note });
const partial = (note) => ({ verdict: "partial", note });
const unmet = (note) => ({ verdict: "unmet", note });
const unknown = (note) => ({ verdict: "unknown", note });

/** A fetch that did not land tells us nothing about the door. */
function reached(snap, key) {
  const row = snap[key];
  if (!row) return unknown(`${key}: never fetched`);
  if (row.error) return unknown(`${key}: ${row.error}`);
  if (!row.ok) return unknown(`${key}: answered ${row.status}`);
  return null;
}

/** Read a served page's script tags for the browser door's declaration. */
export function declaresWebmcp(html) {
  return /<script[^>]+src=["']\/webmcp\.js["']/.test(String(html ?? ""));
}

/**
 * The origin-trial token's own expiry, read out of the token rather
 * than out of a comment beside it. Chrome origin trials end on a date;
 * when this one does, the browser door stops being reachable in a
 * shipping browser and nothing in the HTML changes to say so. That
 * silence is the reason this is a checked criterion and not a note.
 */
export function originTrialExpiry(html) {
  const tag = /<meta[^>]+http-equiv=["']origin-trial["'][^>]+content=["']([^"']+)["']/i.exec(
    String(html ?? ""),
  );
  if (!tag) return null;
  let raw;
  try {
    // Token layout: an ed25519 signature and a length prefix, then the
    // JSON payload. The signature is ARBITRARY BYTES, and on this
    // store's real token byte 15 happens to be `{` — so reaching for
    // the first brace and running to the last one hands JSON.parse a
    // string of binary noise with the payload stapled to the end.
    // That is not a theoretical hazard: the first cut of this function
    // did exactly that and reported the live token as absent, which is
    // the worst thing an instrument can do — accuse confidently while
    // confused. Try each brace and keep the first that actually parses.
    raw = Buffer.from(tag[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const end = raw.lastIndexOf("}");
  if (end === -1) return null;
  for (let start = raw.indexOf("{"); start !== -1 && start < end; start = raw.indexOf("{", start + 1)) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (typeof parsed?.expiry === "number") return parsed.expiry * 1000;
    } catch {
      // This brace opened noise, not the payload. Try the next one.
    }
  }
  return null;
}

/** Same-origin page URLs the sitemap publishes, which is our own denominator. */
export function sitemapRooms(xml, base) {
  const locs = String(xml ?? "").match(/<loc>([^<]+)<\/loc>/g) ?? [];
  return locs
    .map((loc) => loc.replace(/<\/?loc>/g, "").trim())
    .filter((url) => url.startsWith(base));
}

/* ── THE DOORS ───────────────────────────────────────────────────────
 * Ordered furthest from the interface to closest, the way the lineup
 * is drawn. Each door names what it is, what the visiting agent gives
 * up to use it, and the criteria we hold ourselves to on it.
 */

export const DOORS = [
  {
    id: "raw_api",
    number: 1,
    name: "The raw API",
    /** The lineup's own description, so ours can be checked against it. */
    what: "A script hits the backend directly. Precise and fast; the caller found the endpoints and holds the key, and the website is never involved.",
    gives_up:
      "The site is out of the loop, and the caller does the configuring.",
    /** What the keeper is watching for on this door as the ground moves. */
    watch: [
      {
        what: "x402 v2 spec revisions and any successor payment header",
        where: "https://x402.org, the coinbase/x402 repo",
        why: "A payment door that answers an outdated dialect is unreachable while looking healthy.",
      },
      {
        what: "RFC 9727 api-catalog adoption by agent crawlers",
        where: "IETF RFC 9727, our /.well-known/api-catalog",
        why: "Discovery paths only pay off once somebody reads them; if a different well-known path wins, we serve that one too.",
      },
    ],
    criteria: [
      {
        id: "openapi_served",
        asks: "Is there a machine-readable description of every HTTP door?",
        how: "curl -s https://scvd.store/openapi.json | head",
        read(snap) {
          const miss = reached(snap, "openapi");
          if (miss) return miss;
          const paths = snap.openapi.json?.paths;
          if (!paths || typeof paths !== "object") {
            return unmet("openapi.json served but declares no paths");
          }
          return met(`${Object.keys(paths).length} paths described`);
        },
      },
      {
        id: "catalog_discoverable",
        asks: "Can an agent find that description without being told where it is?",
        how: "curl -s https://scvd.store/.well-known/api-catalog",
        read(snap) {
          const miss = reached(snap, "apiCatalog");
          if (miss) return miss;
          return met("RFC 9727 catalog served at the well-known path");
        },
      },
      {
        id: "payment_terms_declared",
        asks: "Are the payment terms readable before anyone spends?",
        how: "curl -s https://scvd.store/.well-known/x402.json",
        read(snap) {
          const miss = reached(snap, "x402");
          if (miss) return miss;
          const text = snap.x402.text ?? "";
          if (!/x402/i.test(text)) {
            return unmet("discovery document does not name the payment protocol");
          }
          return met("x402 discovery document served");
        },
      },
      {
        id: "no_credential_to_be_refused",
        asks: "Does a free instrument answer a caller holding no key at all?",
        how: 'curl -s -o /dev/null -w "%{http_code}" -X POST https://scvd.store/api/preflight/v2 -H "content-type: application/json" -d "{}"',
        read(snap) {
          const row = snap.preflightNoAuth;
          if (!row || row.error) {
            return unknown(`preflightNoAuth: ${row?.error ?? "never fetched"}`);
          }
          if (row.status === 401 || row.status === 403) {
            return unmet(`free instrument demanded a credential (${row.status})`);
          }
          // A shaped 400 is the right answer to an empty body: the door
          // told an anonymous caller what was wrong instead of who to be.
          return met(`answered ${row.status} to an anonymous, keyless call`);
        },
      },
      {
        id: "paid_doors_documented",
        asks: "Does the description cover the paid doors, not just the free ones?",
        how: "curl -s https://scvd.store/openapi.json | grep -c '\"402\"'",
        read(snap) {
          const miss = reached(snap, "openapi");
          if (miss) return miss;
          const count = (snap.openapi.text?.match(/"402"/g) ?? []).length;
          if (count === 0) {
            return unmet("no 402 response documented anywhere in the schema");
          }
          return met(`${count} documented 402 responses`);
        },
      },
    ],
  },

  {
    id: "backend_mcp",
    number: 2,
    name: "A backend MCP server",
    what: "The company describes its actions as named tools and the agent connects. Somebody who understands the product defined the tools; the interface is still skipped.",
    gives_up: "The user configures a connection, and the site never renders.",
    watch: [
      {
        what: "MCP spec revisions and transport deprecations",
        where: "modelcontextprotocol.io/specification",
        why: "A door speaking last year's transport is a door that has quietly closed.",
      },
      {
        what: "Registry and directory listings drifting from what we now are",
        where:
          "registry.modelcontextprotocol.io, PulseMCP, the Claude connectors directory",
        why: "An aggregator repeats the description it holds, not the one we serve — DISTRIBUTION.md §1.",
      },
    ],
    criteria: [
      {
        id: "mcp_endpoint_live",
        asks: "Does the MCP door answer tools/list over streamable HTTP?",
        how: 'curl -s -X POST https://scvd.store/mcp -H "content-type: application/json" -H "accept: application/json, text/event-stream" -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\'',
        read(snap) {
          const miss = reached(snap, "mcpTools");
          if (miss) return miss;
          const tools = snap.mcpTools.json?.result?.tools;
          if (!Array.isArray(tools) || tools.length === 0) {
            return unmet("the door answered without a tool list");
          }
          return met(`${tools.length} tools listed`);
        },
      },
      {
        id: "tools_annotated",
        asks: "Does every tool declare whether it is read-only before it runs?",
        how: "the same tools/list call; check each tool for annotations.readOnlyHint",
        read(snap) {
          const miss = reached(snap, "mcpTools");
          if (miss) return miss;
          const tools = snap.mcpTools.json?.result?.tools ?? [];
          if (tools.length === 0) return unknown("no tools to read");
          const bare = tools.filter(
            (tool) => typeof tool.annotations?.readOnlyHint !== "boolean",
          );
          if (bare.length > 0) {
            return unmet(
              `${bare.length} of ${tools.length} tools carry no readOnlyHint: ${bare
                .map((tool) => tool.name)
                .join(", ")}`,
            );
          }
          return met(`all ${tools.length} tools annotated`);
        },
      },
      {
        id: "tools_described_for_a_model",
        asks: "Is every tool described in prose a model can route on, with a typed input schema?",
        how: "the same tools/list call; check description length and inputSchema",
        read(snap) {
          const miss = reached(snap, "mcpTools");
          if (miss) return miss;
          const tools = snap.mcpTools.json?.result?.tools ?? [];
          if (tools.length === 0) return unknown("no tools to read");
          const thin = tools.filter(
            (tool) =>
              !tool.inputSchema ||
              typeof tool.description !== "string" ||
              tool.description.length < 40,
          );
          if (thin.length > 0) {
            return unmet(
              `${thin.length} tools without a typed schema or a routable description`,
            );
          }
          return met(`all ${tools.length} tools typed and described`);
        },
      },
      {
        id: "payment_rides_the_same_door",
        asks: "Can an agent buy without leaving MCP for a browser?",
        how: "the same tools/list call; look for buy_* tools and their x402 terms",
        read(snap) {
          const miss = reached(snap, "mcpTools");
          if (miss) return miss;
          const tools = snap.mcpTools.json?.result?.tools ?? [];
          const buys = tools.filter((tool) => tool.name?.startsWith("buy_"));
          if (buys.length === 0) {
            return unmet("no purchasable tool on the MCP door");
          }
          const silent = buys.filter(
            (tool) => !/x402|payment/i.test(tool.description ?? ""),
          );
          if (silent.length > 0) {
            return partial(
              `${buys.length} buy tools, ${silent.length} of them silent about how payment is presented`,
            );
          }
          return met(`${buys.length} buy tools, each naming its payment path`);
        },
      },
      {
        id: "registry_description_current",
        asks: "Does the public registry repeat what the store is today?",
        how: "curl -s 'https://registry.modelcontextprotocol.io/v0/servers?search=scvd'",
        read(snap) {
          const row = snap.registry;
          if (!row || row.error || !row.ok) {
            return unknown(`registry: ${row?.error ?? `answered ${row?.status}`}`);
          }
          const servers = row.json?.servers ?? row.json?.data ?? [];
          const ours = (Array.isArray(servers) ? servers : []).find((entry) =>
            JSON.stringify(entry).includes("scvd"),
          );
          if (!ours) return unmet("no scvd entry found in the registry");
          const description = JSON.stringify(ours);
          // The reversal's own word. A listing written before the store
          // became an observatory sells the old shop to every aggregator
          // downstream of it.
          if (/observ|evidence|conformance/i.test(description)) {
            return met("registry entry carries the observatory description");
          }
          return unmet(
            "registry entry still carries the pre-reversal description (DISTRIBUTION.md §1)",
          );
        },
      },
    ],
  },

  {
    id: "computer_use",
    number: 3,
    name: "Computer use",
    what: "The agent sees the live page as an image and clicks around. Nothing to set up; slow, and every look costs money.",
    gives_up: "Structure. It is handed pixels and asked to work it out.",
    watch: [
      {
        what: "Whether the front door still fits one screenshot's worth of reading",
        where: "the byte budget in this file, and the rendered page",
        why: "A page that grows costs every pixel-reading visitor money on every look.",
      },
      {
        what: "Bot walls arriving in front of us without our asking",
        where: "Cloudflare bot-management defaults on the zone",
        why: "The cheapest way to close this door is to have somebody else close it for you.",
      },
    ],
    criteria: [
      {
        id: "renders_without_script",
        asks: "Is the content in the served HTML, or does it need a client to build it?",
        how: "curl -s https://scvd.store/ | grep -c '<main'",
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const html = snap.home.text ?? "";
          const hasContent = /<main[\s>]/.test(html) && /<h1[\s>]/.test(html);
          // Every script tag on the front door that is not inert data.
          const executable = (html.match(/<script(?![^>]*application\/ld\+json)/g) ?? [])
            .length;
          if (!hasContent) return unmet("no server-rendered main content");
          return met(
            `content server-rendered; ${executable} executable script tag(s) on the page`,
          );
        },
      },
      {
        id: "front_door_within_budget",
        asks: "Is one look at the front door cheap?",
        how: 'curl -s -o /dev/null -w "%{size_download}" https://scvd.store/',
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const bytes = snap.home.bytes ?? 0;
          const kb = Math.round(bytes / 1024);
          if (bytes > FRONT_DOOR_BYTE_BUDGET) {
            return unmet(
              `${kb} KB served against a ${Math.round(FRONT_DOOR_BYTE_BUDGET / 1024)} KB budget`,
            );
          }
          return met(`${kb} KB, budget ${Math.round(FRONT_DOOR_BYTE_BUDGET / 1024)} KB`);
        },
      },
      {
        id: "cheaper_road_advertised",
        asks: "Does a pixel-reading agent get told there is a text road it could take instead?",
        how: "curl -s https://scvd.store/robots.txt; curl -s https://scvd.store/llms.txt | head",
        read(snap) {
          const robotsMiss = reached(snap, "robots");
          if (robotsMiss) return robotsMiss;
          const llmsMiss = reached(snap, "llms");
          if (llmsMiss) return llmsMiss;
          if (!/llms\.txt/.test(snap.robots.text ?? "")) {
            return partial("llms.txt is served but robots.txt does not point at it");
          }
          return met("robots.txt names the text maps; llms.txt answers");
        },
      },
      {
        id: "no_wall_in_front",
        asks: "Does an unremarkable client get the page, or a challenge?",
        how: 'curl -s -o /dev/null -w "%{http_code}" -A "agent-probe/1.0" https://scvd.store/',
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const html = snap.home.text ?? "";
          if (/cf-challenge|Just a moment|captcha/i.test(html)) {
            return unmet("an interstitial answered instead of the page");
          }
          if (!/Allow:\s*\//.test(snap.robots?.text ?? "")) {
            return partial("page served, but robots.txt does not broadly allow");
          }
          return met("plain fetch, no challenge, robots allows");
        },
      },
    ],
  },

  {
    id: "browser_automation",
    number: 4,
    name: "Browser automation",
    what: "The agent reads the page's underlying code instead of a picture of it. More reliable than pixels; the tools are generic, so meaning is inferred from anonymous divs.",
    gives_up:
      "Site-specific meaning. The structure is real but says nothing about what anything does.",
    watch: [
      {
        what: "Whether our rooms keep their landmarks through redesigns",
        where: "src/pages/",
        why: "A layout change that drops <main> or an id breaks every script anyone wrote against us, silently.",
      },
      {
        what: "Accessibility-tree-driven agents (the ARIA road) overtaking selector-driven ones",
        where: "Playwright/CDP release notes, the accessibility tree APIs",
        why: "If agents move to the a11y tree, roles and names become the contract instead of selectors.",
      },
    ],
    criteria: [
      {
        id: "semantic_landmarks",
        asks: "Can a generic tool find the content by structure alone?",
        how: "curl -s https://scvd.store/ | grep -o '<main\\|<h1\\|<section'",
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const html = snap.home.text ?? "";
          const found = ["<main", "<h1", "<section", "<nav"].filter((tag) =>
            html.includes(tag),
          );
          if (found.length < 3) {
            return unmet(`only ${found.length} of 4 landmark kinds present`);
          }
          return met(`landmarks present: ${found.join(" ")}`);
        },
      },
      {
        id: "stable_hooks",
        asks: "Is there anything on the page a script can hold that is not a style class?",
        how: "curl -s https://scvd.store/ | grep -o 'data-[a-z-]*=\\|id=\"[^\"]*\"' | sort -u",
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const html = snap.home.text ?? "";
          const data = new Set(
            (html.match(/\sdata-[a-z-]+=/g) ?? []).map((match) => match.trim()),
          );
          const ids = new Set(html.match(/\sid="[^"]+"/g) ?? []);
          const hooks = data.size + ids.size;
          if (hooks === 0) {
            return unmet(
              "no data-* attributes and no ids: every hook is a style class, which redesigns move",
            );
          }
          if (data.size === 0) {
            return partial(
              `${ids.size} ids and no data-* attributes — ids exist for anchors, not for automation`,
            );
          }
          return met(`${data.size} data-* attribute kinds, ${ids.size} ids`);
        },
      },
      {
        id: "navigation_is_links",
        asks: "Is getting around the site real hrefs rather than script handlers?",
        how: "curl -s https://scvd.store/ | grep -c '<a href='",
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const links = (snap.home.text?.match(/<a\s+href=/g) ?? []).length;
          if (links < 5) return unmet(`only ${links} plain links on the front door`);
          return met(`${links} plain links; navigation needs no script`);
        },
      },
      {
        id: "machine_twin_linked",
        asks: "Does each page point at its own machine-readable twin, so nobody has to scrape it?",
        how: "curl -s https://scvd.store/ | grep 'rel=\"alternate\"'",
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const html = snap.home.text ?? "";
          if (/rel=["']alternate["']/.test(html)) {
            return met("alternate representation linked from the page head");
          }
          if (/application\/ld\+json/.test(html)) {
            return partial(
              "JSON-LD in the page, but no rel=alternate pointing at a twin document",
            );
          }
          return unmet("nothing links a machine-readable twin");
        },
      },
    ],
  },

  {
    id: "webmcp",
    number: 5,
    name: "WebMCP",
    what: "The page declares its own actions with names, descriptions and typed inputs, and the agent in the visitor's own browser calls them. Their agent, no configuration, real named actions.",
    gives_up:
      "Nothing structural — which is why it is the interesting one — but it runs inside the visitor's session, so the session is the authority and nothing about the call is signed.",
    watch: [
      {
        what: "The origin trial's end date, and whether the API ships unflagged after it",
        where: "chromestatus.com WebMCP entry, developer.chrome.com/origintrials",
        why: "The token expires on a date. When it does the door closes in a shipping browser and nothing in our HTML says so.",
      },
      {
        what: "The spec's shape moving under registerTool",
        where: "github.com/webmachinelearning/webmcp",
        why: "It is a draft. A renamed field turns our declaration into inert JavaScript.",
      },
      {
        what: "Whether declarative form annotation (toolname / tooldescription) lands",
        where: "the same spec repo",
        why: "The cheapest declaration in the lineup is two attributes on a form we already have — the day we have a public form.",
      },
      {
        what: "Which other agents in the browser read document.modelContext",
        where: "ChatGPT Desktop, Brave Leo, Edge Copilot release notes",
        why: "The door's value is the number of resident agents that walk through it, and we do not control that number.",
      },
    ],
    criteria: [
      {
        id: "script_served",
        asks: "Is there a browser-door script at all?",
        how: "curl -s https://scvd.store/webmcp.js | head",
        read(snap) {
          const miss = reached(snap, "webmcpScript");
          if (miss) return miss;
          const text = snap.webmcpScript.text ?? "";
          if (!/registerTool/.test(text)) {
            return unmet("a script is served but it registers nothing");
          }
          return met("registerTool declarations served");
        },
      },
      {
        id: "declarations_derive_from_the_mcp_door",
        asks: "Are the browser's tool names the same objects the MCP door serves, or a second hand-typed list?",
        how: "compare the names in /webmcp.js against the names in the MCP tools/list answer",
        read(snap) {
          const scriptMiss = reached(snap, "webmcpScript");
          if (scriptMiss) return scriptMiss;
          const mcpMiss = reached(snap, "mcpTools");
          if (mcpMiss) return mcpMiss;
          const declared = new Set(
            (snap.webmcpScript.text?.match(/"name":\s*"([a-z_]+)"/g) ?? []).map(
              (match) => /"name":\s*"([a-z_]+)"/.exec(match)[1],
            ),
          );
          const served = new Set(
            (snap.mcpTools.json?.result?.tools ?? []).map((tool) => tool.name),
          );
          if (declared.size === 0) return unknown("no tool names read out of the script");
          const orphans = [...declared].filter((name) => !served.has(name));
          if (orphans.length > 0) {
            return unmet(
              `${orphans.length} browser tools have no MCP twin: ${orphans.join(", ")}`,
            );
          }
          return met(
            `${declared.size} browser tools, every one a read-only tool the MCP door also serves`,
          );
        },
      },
      {
        id: "declared_where_agents_arrive",
        asks: "Do the rooms an agent lands in declare the door, or only the front page?",
        how: "fetch every URL in /sitemap.xml and grep for the /webmcp.js script tag",
        read(snap) {
          const rooms = snap.rooms;
          if (!rooms || rooms.total === 0) {
            return unknown("rooms were not swept");
          }
          const share = rooms.declaring / rooms.total;
          const line = `${rooms.declaring} of ${rooms.total} published rooms declare it (${Math.round(share * 100)}%)`;
          if (share >= WEBMCP_ROOM_COVERAGE_TARGET) return met(line);
          if (rooms.declaring === 0) return unmet(`${line} — nothing declares it`);
          return partial(
            `${line}, against a stated target of ${Math.round(WEBMCP_ROOM_COVERAGE_TARGET * 100)}%`,
          );
        },
      },
      {
        id: "origin_trial_unexpired",
        asks: "Will a shipping Chrome still enable the API on our origin tomorrow?",
        how: "read the origin-trial meta on https://scvd.store/ and base64-decode its payload",
        read(snap, asOf) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const expiry = originTrialExpiry(snap.home.text);
          if (expiry === null) {
            return unmet("no origin-trial token on the front door");
          }
          const days = Math.floor((expiry - asOf) / DAY);
          const on = new Date(expiry).toISOString().slice(0, 10);
          if (days < 0) return unmet(`origin trial expired ${on}; the door is shut`);
          if (days < 30) return partial(`origin trial ends ${on}, in ${days} days`);
          return met(`origin trial valid until ${on} (${days} days)`);
        },
      },
      {
        id: "declarative_forms",
        asks: "Is the zero-JavaScript path — toolname on a form we already have — taken anywhere?",
        how: "curl -s https://scvd.store/ | grep -c 'toolname='",
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const html = snap.home.text ?? "";
          if (/toolname=/.test(html)) return met("annotated form served");
          if (!/<form/.test(html)) {
            return unmet(
              "no public form exists to annotate — the cheapest declaration in the lineup has no target here",
            );
          }
          return unmet("public forms exist and none carries toolname");
        },
      },
    ],
  },

  {
    id: "site_assistant",
    number: 6,
    name: "The site's built-in assistant",
    what: "The company ships its own chat box, picks the model, pays the tokens — and the visitor's own agent stays outside.",
    gives_up:
      "The visitor's agent. Nothing it learns carries anywhere else, and you cannot bring your own.",
    /**
     * THE ONE DOOR WHERE `met` MEANS WE DID NOT BUILD IT. This store's
     * whole position is that the visiting agent is the customer, so a
     * chat box that stands between an agent and the shelf is a
     * regression here, not a feature. The criteria check that the
     * refusal still holds.
     */
    stance: "deliberately not taken",
    watch: [
      {
        what: "Any drift toward a hosted chat surface on the storefront",
        where: "src/pages/, the storefront's script tags",
        why: "The refusal is the position; it should fail a check the day it stops being true, not be remembered.",
      },
      {
        what: "Whether visitors keep arriving with their own agents",
        where: "the channel counters, /visitors",
        why: "If they stop, the refusal costs something, and the keeper should price it rather than inherit it.",
      },
    ],
    criteria: [
      {
        id: "no_hosted_chat_surface",
        asks: "Does the store put its own model between a visitor and the shelf?",
        how: "curl -s https://scvd.store/ | grep -ci 'chat\\|assistant widget'",
        read(snap) {
          const miss = reached(snap, "home");
          if (miss) return miss;
          const html = snap.home.text ?? "";
          if (/<(iframe|div)[^>]+(chat-widget|intercom|drift|crisp)/i.test(html)) {
            return unmet("a hosted chat surface is on the page");
          }
          return met("no chat box; the visiting agent is the visitor");
        },
      },
      {
        id: "guide_instead_of_gatekeeper",
        asks: "Is the thing a chat box would have explained published as text any model can read?",
        how: "curl -s https://scvd.store/llms.txt; curl -s https://scvd.store/agents.md",
        read(snap) {
          const llmsMiss = reached(snap, "llms");
          if (llmsMiss) return llmsMiss;
          const bytes = snap.llms.bytes ?? 0;
          if (bytes < 500) return partial(`llms.txt is only ${bytes} bytes`);
          const agents = snap.agentsMd?.ok ? " and /agents.md" : "";
          return met(`llms.txt (${Math.round(bytes / 1024)} KB)${agents} carry the guide`);
        },
      },
      {
        id: "no_model_lock_in",
        asks: "Can any model use the doors, or does one host have to be in the loop?",
        how: "the MCP tools/list answer: JSON Schema inputs, no host-specific fields",
        read(snap) {
          const miss = reached(snap, "mcpTools");
          if (miss) return miss;
          const tools = snap.mcpTools.json?.result?.tools ?? [];
          if (tools.length === 0) return unknown("no tools to read");
          const schemaTyped = tools.filter(
            (tool) => tool.inputSchema?.type === "object",
          );
          if (schemaTyped.length !== tools.length) {
            return partial(
              `${schemaTyped.length} of ${tools.length} tools use plain JSON Schema inputs`,
            );
          }
          return met(`all ${tools.length} tools typed in plain JSON Schema`);
        },
      },
    ],
  },
];

/* ── reading a snapshot ──────────────────────────────────────────── */

/**
 * Turn one snapshot into one dated observation. Pure: same bytes and
 * same clock in, same reading out, which is what lets the whole
 * battery be tested offline against synthetic pages.
 */
export function readDoors(snapshot, asOf = Date.now()) {
  const doors = DOORS.map((door) => {
    const criteria = door.criteria.map((criterion) => {
      const reading = criterion.read(snapshot, asOf);
      return {
        id: criterion.id,
        asks: criterion.asks,
        how: criterion.how,
        verdict: reading.verdict,
        note: reading.note,
      };
    });
    const tally = { met: 0, partial: 0, unmet: 0, unknown: 0 };
    for (const criterion of criteria) tally[criterion.verdict] += 1;
    return {
      id: door.id,
      number: door.number,
      name: door.name,
      stance: door.stance ?? null,
      tally,
      criteria,
    };
  });
  return {
    taken_at: new Date(asOf).toISOString(),
    expires_at: new Date(asOf + OBSERVATION_FRESH_DAYS * DAY).toISOString(),
    doors,
  };
}

/**
 * What moved since the recorded observation.
 *
 * `unknown` NEVER counts as a regression in either direction — it is
 * the absence of a reading, and a checker that treated it as a fall
 * would go red every time a third party's registry had an outage. New
 * criteria are reported as new rather than as changes, so adding one
 * never reads as a repair we did not make.
 */
export function compare(previous, current) {
  const rank = { unmet: 0, partial: 1, met: 2 };
  const before = new Map();
  for (const door of previous?.doors ?? []) {
    for (const criterion of door.criteria) {
      before.set(`${door.id}/${criterion.id}`, criterion.verdict);
    }
  }
  const regressions = [];
  const improvements = [];
  const added = [];
  for (const door of current.doors) {
    for (const criterion of door.criteria) {
      const key = `${door.id}/${criterion.id}`;
      const was = before.get(key);
      if (was === undefined) {
        added.push({ key, now: criterion.verdict, note: criterion.note });
        continue;
      }
      before.delete(key);
      if (was === "unknown" || criterion.verdict === "unknown") continue;
      if (rank[criterion.verdict] < rank[was]) {
        regressions.push({ key, was, now: criterion.verdict, note: criterion.note });
      } else if (rank[criterion.verdict] > rank[was]) {
        improvements.push({ key, was, now: criterion.verdict, note: criterion.note });
      }
    }
  }
  return {
    regressions,
    improvements,
    added,
    removed: [...before.keys()].map((key) => ({ key })),
  };
}

/**
 * Which doors are due a human re-read.
 *
 * This is the half of the mechanism no probe can do. The criteria
 * above check that the doors we built still work; this checks that the
 * doors we built are still the right doors — the ground moves, and a
 * green battery against stale criteria is the most confident way to be
 * wrong. Each door names what to re-read and where.
 */
export function reviewsDue(record, asOf = Date.now()) {
  const reviewed = new Map(
    Object.entries(record?.reviewed_at ?? {}).map(([id, at]) => [
      id,
      new Date(at).getTime(),
    ]),
  );
  return DOORS.flatMap((door) => {
    const last = reviewed.get(door.id);
    const days = last === undefined ? null : Math.floor((asOf - last) / DAY);
    if (days !== null && days < REVIEW_EVERY_DAYS) return [];
    return [
      {
        id: door.id,
        name: door.name,
        days_since_review: days,
        watch: door.watch,
      },
    ];
  });
}

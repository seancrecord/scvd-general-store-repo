/**
 * THE VERSIONS AND THE SHELF, ON EVERY INDEX (2026-09-03, roadmap V4).
 *
 * listings.mjs asks which GENERATION of the store's words each mirror
 * carries. This asks the narrower, more expensive question: does what
 * an index says about us still match what the repository and the
 * live shelf say — the version a registry lists against the manifest
 * in this tree, the description a registry lists against the one in
 * `server.json`, the number of doors a directory counts against the
 * paid shelf, and whether the doctrine sentence survived their field.
 *
 * Drift there is invisible revenue loss: a registry three versions
 * behind, a directory listing thirty-one doors of thirty-two, a
 * description that lost its last sentence on the way in. None of it
 * shows on any surface this store serves, because the file on disk
 * looks right (DISTRIBUTION §1 recorded exactly that on 2026-08-29).
 *
 * READ-ONLY, and press stays the keeper's (rule 30): nothing here
 * writes to any index. It reads public surfaces, compares, and says
 * `agrees`, `differs` (naming the field, ours and theirs), `unknown`
 * (the surface answered but not in a shape we read — rule 52: never
 * `differs` from a page we could not parse) or `unreachable`.
 *
 * The readers are pure functions over fetched bytes, so the whole
 * battery tests offline against fixtures and nothing depends on an
 * index being up to be correct.
 */

/** The doctrine sentence every listing should carry (src/store/copy/doctrine.ts). Read from the live og:description when possible; this is the fallback probe. */
export const DOCTRINE_PROBE = "never a ranking";

// ---------- readers: one per index, bytes in, facts out ----------

/** The official MCP registry: /v0/servers?search=… → the latest entry for one server name. */
export function readMcpRegistry(json, name) {
  const servers = Array.isArray(json?.servers) ? json.servers : Array.isArray(json) ? json : null;
  if (!servers) return { state: "unknown", note: "no servers array in the registry's answer" };
  const rows = servers
    .map((row) => ({ server: row.server ?? row, meta: row?._meta?.["io.modelcontextprotocol.registry/official"] ?? {} }))
    .filter((row) => row.server?.name === name);
  if (rows.length === 0) return { state: "unknown", note: `no entry named ${name}` };
  const latest = rows.find((row) => row.meta.isLatest === true) ?? rows[rows.length - 1];
  return {
    state: "read",
    version: String(latest.server.version ?? ""),
    description: String(latest.server.description ?? ""),
    status: String(latest.meta.status ?? ""),
    versions_listed: rows.length,
  };
}

/** The npm registry: /<package> → dist-tags.latest and that version's description. */
export function readNpm(json) {
  const latest = json?.["dist-tags"]?.latest;
  if (typeof latest !== "string") return { state: "unknown", note: "no dist-tags.latest" };
  const versionRow = json?.versions?.[latest] ?? {};
  return {
    state: "read",
    version: latest,
    description: String(versionRow.description ?? json?.description ?? ""),
    published_at: String(json?.time?.[latest] ?? ""),
  };
}

/**
 * The bodies of every <script type="application/ld+json"> on a page,
 * found by walking the text rather than by a regular expression: a
 * pattern with two open-ended tag classes around an attribute is the
 * shape CodeQL flags as polynomial, and a bare `</script>` end tag is
 * the one it flags as a bad filter. This reads the way a browser
 * tokenises: the tag ends at the first `>`, the block at the next
 * `</script` in any casing followed by anything but a name character.
 */
export function jsonLdBlocks(html) {
  const bodies = [];
  const lower = html.toLowerCase();
  let at = 0;
  for (;;) {
    const open = lower.indexOf("<script", at);
    if (open < 0) break;
    const tagEnd = lower.indexOf(">", open);
    if (tagEnd < 0) break;
    const tag = lower.slice(open, tagEnd + 1);
    const close = lower.indexOf("</script", tagEnd + 1);
    if (close < 0) break;
    const after = lower.charAt(close + "</script".length);
    const bodyEnd = /[a-z0-9-]/.test(after) ? -1 : close;
    if (bodyEnd >= 0 && tag.includes("application/ld+json")) bodies.push(html.slice(tagEnd + 1, bodyEnd));
    at = tagEnd + 1;
  }
  return bodies;
}

/** x402-list's service page: the JSON-LD WebAPI node carries the description and the offer count. */
export function readX402List(html) {
  for (const body of jsonLdBlocks(html ?? "")) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
    const api = nodes.find((node) => node?.["@type"] === "WebAPI");
    if (!api) continue;
    const count = api?.offers?.offerCount;
    return {
      state: "read",
      description: String(api.description ?? ""),
      offer_count: typeof count === "number" ? count : Number.parseInt(String(count ?? ""), 10) || null,
      doctrine_present: String(api.description ?? "").toLowerCase().includes(DOCTRINE_PROBE),
    };
  }
  return { state: "unknown", note: "no WebAPI node in the page's JSON-LD" };
}

/**
 * ClawHub's skill page: the version is read only where the page
 * labels one ("version 3.15.0", "v3.15.0" beside the skill's name),
 * never the first dotted number after the name — the first live read
 * (2026-09-03) took a "65.5.5" from somewhere else on the page and
 * called it a difference. Anything looser is unknown (rule 52).
 */
export function readClawHub(html, skillName) {
  const text = html ?? "";
  const at = text.indexOf(skillName);
  if (at < 0) return { state: "unknown", note: `the page does not name ${skillName}` };
  const near = text.slice(at, at + 2000);
  const match = /(?:\bversion\b[^0-9]{0,24}|\bv)(\d+\.\d+\.\d+)\b/i.exec(near);
  if (!match) return { state: "unknown", note: "no labelled version near the skill name" };
  return { state: "read", version: match[1] };
}

/** agentic.market's search: the service's endpoint count, when the shape is one we recognise. */
export function readAgenticMarket(json, host) {
  const list = Array.isArray(json?.services) ? json.services : Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : null;
  if (!list) return { state: "unknown", note: "no services array in the answer" };
  const row = list.find((entry) => JSON.stringify(entry).includes(host));
  if (!row) return { state: "unknown", note: `no service naming ${host}` };
  const endpoints = Array.isArray(row.endpoints) ? row.endpoints.length : Array.isArray(row.resources) ? row.resources.length : null;
  if (endpoints === null) return { state: "unknown", note: "the service row carries no endpoints array we read" };
  return { state: "read", endpoint_count: endpoints, description: String(row.description ?? "") };
}

/** The live shelf: menu.json's paid items. */
export function readShelf(json) {
  const items = Array.isArray(json?.items) ? json.items : null;
  if (!items) return { state: "unknown", note: "menu.json carries no items array" };
  const paid = items.filter((item) => Number(item?.price_usdc) > 0);
  return { state: "read", paid_count: paid.length, ids: paid.map((item) => String(item.id)) };
}

// ---------- the comparison ----------

function row(index, field, ours, theirs, note) {
  const state = theirs === undefined ? "unknown" : String(ours) === String(theirs) ? "agrees" : "differs";
  return { index, field, ours: ours === undefined ? null : ours, theirs: theirs === undefined ? null : theirs, state, ...(note ? { note } : {}) };
}

function unreadRow(index, field, ours, read) {
  return {
    index,
    field,
    ours: ours ?? null,
    theirs: null,
    state: read?.state === "unreachable" ? "unreachable" : "unknown",
    note: read?.note ?? read?.error ?? "not read",
  };
}

/**
 * `local` is what this tree and the live shelf say; `reads` is what
 * each index answered, each `{ state: "read" | "unknown" | "unreachable", … }`.
 * One row per fact compared; no score, no total.
 */
export function compareListings(local, reads) {
  const rows = [];
  const mcp = reads.mcp_registry_store;
  if (mcp?.state === "read") {
    rows.push(row("mcp-registry", "general-store version", local.server.version, mcp.version));
    rows.push(row("mcp-registry", "general-store description", local.server.description, mcp.description, "a published version is immutable: a differing description means server.json changed without a version bump and a publish"));
  } else {
    rows.push(unreadRow("mcp-registry", "general-store version", local.server.version, mcp));
  }
  const tab = reads.mcp_registry_tab;
  if (tab?.state === "read") rows.push(row("mcp-registry", "tab version", local.tabServer.version, tab.version));
  else rows.push(unreadRow("mcp-registry", "tab version", local.tabServer.version, tab));

  for (const pkg of local.packages) {
    const read = reads.npm?.[pkg.name];
    if (read?.state === "read") rows.push(row("npm", `${pkg.name} version`, pkg.version, read.version));
    else rows.push(unreadRow("npm", `${pkg.name} version`, pkg.version, read));
  }

  const claw = reads.clawhub;
  if (claw?.state === "read") rows.push(row("clawhub", "skill version", local.clawhub.version, claw.version));
  else rows.push(unreadRow("clawhub", "skill version", local.clawhub.version, claw));

  const list = reads.x402_list;
  if (list?.state === "read") {
    rows.push(row("x402-list", "doctrine sentence present", true, list.doctrine_present, "their description field dropped or capped the last sentence"));
    if (local.shelf?.state === "read") rows.push(row("x402-list", "doors listed", local.shelf.paid_count, list.offer_count, "paid items on the live shelf against their offerCount"));
  } else {
    rows.push(unreadRow("x402-list", "doctrine sentence present", true, list));
  }

  const market = reads.agentic_market;
  if (market?.state === "read" && local.shelf?.state === "read") rows.push(row("agentic-market", "doors listed", local.shelf.paid_count, market.endpoint_count));
  else rows.push(unreadRow("agentic-market", "doors listed", local.shelf?.paid_count, market));

  return rows;
}

// ---------- the walk ----------

const UA = "Mozilla/5.0 (compatible; scvd-listings-check/1.0; +https://scvd.store/llms.txt)";

async function fetchText(url, fetchImpl, accept, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { "User-Agent": UA, Accept: accept }, redirect: "follow", signal: controller.signal });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: "", error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
}

function asJson(read) {
  if (!read.ok) return { state: "unreachable", error: read.error ?? `HTTP ${read.status}` };
  try {
    return { state: "ok", json: JSON.parse(read.text) };
  } catch {
    return { state: "unknown", note: "the answer was not JSON" };
  }
}

/** Every index this store is listed on, by public read URL. Press is the keeper's; these are reads. */
export const INDEX_URLS = Object.freeze({
  mcp_registry: "https://registry.modelcontextprotocol.io/v0/servers?search=scvd",
  npm: (name) => `https://registry.npmjs.org/${name}`,
  clawhub: (skill) => `https://clawhub.ai/skills/${skill}`,
  x402_list: "https://x402-list.com/services/sean-claude-van-damme-s-general-store",
  agentic_market: "https://api.agentic.market/v1/services/search?q=scvd",
});

/**
 * Read every index once and compare against `local`. `local` carries
 * the manifests from this tree (the caller reads the files) and the
 * live shelf is fetched here from `base`.
 */
export async function walkVersions(base, local, fetchImpl = fetch) {
  const shelfRead = asJson(await fetchText(`${base}/menu.json`, fetchImpl, "application/json"));
  const shelf = shelfRead.state === "ok" ? readShelf(shelfRead.json) : { state: shelfRead.state, note: shelfRead.note ?? shelfRead.error };

  const registry = asJson(await fetchText(INDEX_URLS.mcp_registry, fetchImpl, "application/json"));
  const mcpStore = registry.state === "ok" ? readMcpRegistry(registry.json, local.server.name) : { state: registry.state, note: registry.note ?? registry.error };
  const mcpTab = registry.state === "ok" ? readMcpRegistry(registry.json, local.tabServer.name) : { state: registry.state, note: registry.note ?? registry.error };

  const npm = {};
  for (const pkg of local.packages) {
    const read = asJson(await fetchText(INDEX_URLS.npm(pkg.name), fetchImpl, "application/json"));
    npm[pkg.name] = read.state === "ok" ? readNpm(read.json) : { state: read.state, note: read.note ?? read.error };
  }

  const clawRead = await fetchText(INDEX_URLS.clawhub(local.clawhub.name), fetchImpl, "text/html");
  const clawhub = clawRead.ok ? readClawHub(clawRead.text, local.clawhub.name) : { state: "unreachable", error: clawRead.error ?? `HTTP ${clawRead.status}` };

  const listRead = await fetchText(INDEX_URLS.x402_list, fetchImpl, "text/html");
  const x402List = listRead.ok ? readX402List(listRead.text) : { state: "unreachable", error: listRead.error ?? `HTTP ${listRead.status}` };

  const marketRead = asJson(await fetchText(INDEX_URLS.agentic_market, fetchImpl, "application/json"));
  const market = marketRead.state === "ok" ? readAgenticMarket(marketRead.json, new URL(base).host) : { state: marketRead.state, note: marketRead.note ?? marketRead.error };

  const reads = { mcp_registry_store: mcpStore, mcp_registry_tab: mcpTab, npm, clawhub, x402_list: x402List, agentic_market: market };
  const rows = compareListings({ ...local, shelf }, reads);
  return { read_at: new Date().toISOString(), shelf, reads, rows };
}

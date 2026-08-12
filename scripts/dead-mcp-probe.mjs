#!/usr/bin/env node
/**
 * THE COST OF PICKING A DEAD MCP SERVER, MEASURED INSTEAD OF FEARED.
 *
 * MCP-ABANDONMENT is the catalogue problem that says: directories fill
 * with abandoned servers, an agent picks one, and money or time burns
 * before anybody notices. Every product cut against that problem died
 * in review ("real but nobody pays"), but the problem itself was left
 * open on a suspicion — that the waste might be quiet. This script
 * exists to close it with a number rather than a feeling.
 *
 * THE QUESTION IS NARROW. When a client walks up to a dead MCP server
 * and does what any client does first — the initialize handshake —
 * does the failure arrive LOUD (a transport error, a DNS refusal, an
 * HTTP status, arriving in well under a breath) or QUIET (a hang, a
 * plausible-but-empty answer, something an agent could sit inside and
 * spend against)? Loud failures cost a retry and a line in a log.
 * Quiet ones are the only shape of this problem worth a product.
 *
 * TWO POPULATIONS, TWO QUESTIONS, ONE RUBRIC.
 *
 * The default is FROZEN HISTORY: every remote server URL from the
 * 2025-05-30 snapshot of the most-starred public remote-MCP directory
 * (jaw9c/awesome-remote-mcp-servers, commit 258ebc0) — a list old
 * enough that whatever was going to be abandoned has had fifteen
 * months to die. That measures ATTRITION, and being frozen, a re-run
 * is comparable to the last one. The list is history from someone
 * else's repo, which is why it may be hand-copied here (AT_SCALE
 * rule 1 covers values that live in OUR code; provenance is the
 * citation).
 *
 * --registry asks the FRESH question instead: of what the official
 * MCP registry (registry.modelcontextprotocol.io) lists TODAY, how
 * much is dead on arrival? The registry stamps every entry with
 * publishedAt, so the sample is stratified by listing month and the
 * summary shows death against age. First run (2026-08-11, 70 probed):
 * 23 dead — a THIRD of current "active" listings — with the two
 * oldest cohorts at 5/6 dead each and the newest at 0/6; the registry
 * appears never to prune. Still zero dead-quiet, still ~800ms median
 * to a verdict, so the closure held on the freshest population there
 * is. A fabricated dead endpoint would only measure our own
 * fabrication; both populations measure how servers actually go dark.
 *
 * WHAT COUNTS AS WHAT, decided before the run so the run cannot
 * negotiate:
 *   ALIVE      — a JSON-RPC initialize result, an SSE stream that
 *                opens, or ANY auth challenge (401/403/407). A door
 *                that asks for a key has somebody behind it.
 *   DEAD-LOUD  — DNS failure, connection refused, TLS failure, or an
 *                HTTP 4xx/5xx with no MCP shape behind it. The client
 *                knows on the first exchange.
 *   DEAD-QUIET — a hang past the timeout, or a 2xx that answers the
 *                handshake with something that is not MCP. The shape
 *                an agent could waste real time inside.
 *   MOVED      — the listed path is dead but the sibling transport
 *                path (/sse ↔ /mcp) answers. A stale directory entry
 *                over a live server: the operator did not abandon
 *                anything, the directory just kept the old address.
 *                Found on the first run — half the "dead" were this.
 *
 * Read-only. Two small GET/POST probes per endpoint, one pass, no
 * retries, no spend, nothing written anywhere. Capped at TIMEOUT_MS
 * each, whole run bounded in a minute or two.
 *
 * Usage, from the repo root:
 *
 *   npm run probe:dead-mcp                    # frozen 2025-05 snapshot
 *   npm run probe:dead-mcp -- --registry     # today's official registry,
 *                                            # sampled 6 per listing-month
 */

const TIMEOUT_MS = 15_000;

/**
 * Every URL under a "Remote Server" heading in the 2025-05-30
 * snapshot, minus documentation pages (Anthropic/OpenAI docs, the
 * subreddit) which are links about MCP rather than doors to it.
 */
const SNAPSHOT = "jaw9c/awesome-remote-mcp-servers @ 258ebc0 (2025-05-30)";
const ENDPOINTS = [
  "https://api.dashboard.plaid.com/mcp/sse",
  "https://app.hubspot.com/mcp/v1/http",
  "https://bindings.mcp.cloudflare.com/sse",
  "https://mcp.asana.com/sse",
  "https://mcp.atlassian.com/v1/sse",
  "https://mcp.bitte.ai/sse",
  "https://mcp.cloudflare.com/sse",
  "https://mcp.deepwiki.com/sse",
  "https://mcp.globalping.dev/sse",
  "https://mcp.intercom.com/sse",
  "https://mcp.linear.app/sse",
  "https://mcp.llmtxt.dev/sse",
  "https://mcp.mcpoogle.com/sse",
  "https://mcp.needle-ai.com/mcp",
  "https://mcp.neon.tech/sse",
  "https://mcp.paypal.com/sse",
  "https://mcp.semgrep.ai/sse",
  "https://mcp.sentry.dev/sse",
  "https://mcp.simplescraper.com/mcp",
  "https://mcp.squareup.com/sse",
  "https://mcp.thekollektiv.ai/sse",
  "https://mcp.webflow.com/sse",
  "https://mcp.wix.com/sse",
  "https://mcp.zapier.com/api/mcp/mcp",
  "https://observability.mcp.cloudflare.com/sse",
  "https://radar.mcp.cloudflare.com/sse",
  "https://rag-mcp-2.whatsmcp.workers.dev/sse",
  "https://scorecard-mcp.dare-d5b.workers.dev/mcp",
  "https://waystation.ai/mcp",
];

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "scvd-dead-server-probe", version: "0.1.0" },
  },
});

/** One bounded fetch; returns enough to classify, never throws. */
async function attempt(url, init) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      ...init,
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Read just the opening of the body: an SSE stream never ends, so
    // "read it all" would turn every healthy stream into a timeout.
    let opening = "";
    if (response.body) {
      const reader = response.body.getReader();
      const raced = await Promise.race([
        reader.read(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), 3_000),
        ),
      ]);
      if (raced.value) opening = new TextDecoder().decode(raced.value);
      await reader.cancel().catch(() => {});
    }
    return {
      ms: Date.now() - started,
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      opening: opening.slice(0, 300),
    };
  } catch (error) {
    const cause = error?.cause?.code ?? error?.code ?? error?.name ?? "";
    return {
      ms: Date.now() - started,
      transportError: `${error?.name ?? "Error"}${cause ? `/${cause}` : ""}`,
    };
  }
}

/** The pre-registered rubric from the header, applied to one probe. */
function classify(probe) {
  if (probe.transportError) {
    const timedOut = /Timeout|Abort/i.test(probe.transportError);
    return {
      verdict: timedOut ? "DEAD-QUIET" : "DEAD-LOUD",
      why: probe.transportError,
    };
  }
  const { status, contentType, opening } = probe;
  if ([401, 403, 407].includes(status)) {
    return { verdict: "ALIVE", why: `auth challenge (${status})` };
  }
  const looksMcp =
    /"jsonrpc"/.test(opening) ||
    /event:|data:/.test(opening) ||
    contentType.includes("text/event-stream");
  if (status >= 200 && status < 300) {
    return looksMcp
      ? { verdict: "ALIVE", why: `${status}, MCP-shaped reply` }
      : { verdict: "DEAD-QUIET", why: `${status} but not MCP: "${opening.slice(0, 60)}"` };
  }
  // 4xx/5xx that still speaks JSON-RPC (e.g. "session required") is a
  // living server enforcing its protocol, not an abandoned one.
  return looksMcp
    ? { verdict: "ALIVE", why: `${status}, but the error is MCP-shaped` }
    : { verdict: "DEAD-LOUD", why: `HTTP ${status}` };
}

/**
 * Probe one endpoint the way a client would: the modern Streamable
 * HTTP handshake first (POST initialize), and if that comes back a
 * plain 4xx/405, the older SSE opening (GET) the /sse era used. The
 * BETTER of the two answers stands — the question is whether anybody
 * is home, not which transport they prefer.
 */
async function probe(url) {
  const post = await attempt(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: INITIALIZE,
  });
  const postVerdict = classify(post);
  if (postVerdict.verdict === "ALIVE") return { probe: post, ...postVerdict };

  const get = await attempt(url, {
    method: "GET",
    headers: { accept: "text/event-stream" },
  });
  const getVerdict = classify(get);
  if (getVerdict.verdict === "ALIVE") return { probe: get, ...getVerdict };

  // Both dead: report the louder (cheaper) of the two failures, since
  // a real client stops at the first one it understands.
  return postVerdict.verdict === "DEAD-LOUD"
    ? { probe: post, ...postVerdict }
    : { probe: get, ...getVerdict };
}

/** The other era's spelling of the same door, or null if there is none. */
function siblingPath(url) {
  if (url.endsWith("/sse")) return `${url.slice(0, -4)}/mcp`;
  if (url.endsWith("/mcp")) return `${url.slice(0, -4)}/sse`;
  return null;
}

const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";
const REGISTRY_PAGES = 40;
const PER_MONTH = 6;

/**
 * THE FRESH POPULATION: every remote URL the official registry lists
 * right now, stamped with its listing month, sampled evenly (every
 * k-th entry, not randomly, so two people running this the same hour
 * probe the same doors) at PER_MONTH per cohort. The month is what
 * turns a death count into an ATTRITION CURVE.
 */
async function registrySample() {
  const rows = [];
  let cursor = "";
  for (let page = 0; page < REGISTRY_PAGES; page += 1) {
    const url = `${REGISTRY}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) {
      throw new Error(`registry page fetch failed: HTTP ${response.status}`);
    }
    const body = await response.json();
    for (const entry of body.servers ?? []) {
      const meta = entry._meta?.["io.modelcontextprotocol.registry/official"] ?? {};
      if (meta.isLatest === false) continue;
      for (const remote of entry.server?.remotes ?? []) {
        if (remote.url) {
          rows.push({ url: remote.url, month: String(meta.publishedAt ?? "").slice(0, 7) });
        }
      }
    }
    cursor = body.metadata?.next_cursor ?? body.metadata?.nextCursor ?? "";
    if (!cursor) break;
  }
  const byMonth = new Map();
  for (const row of rows) {
    if (!byMonth.has(row.month)) byMonth.set(row.month, []);
    byMonth.get(row.month).push(row);
  }
  const sample = [];
  for (const [month, list] of [...byMonth.entries()].sort()) {
    const seen = new Set();
    const unique = list.filter((row) => !seen.has(row.url) && seen.add(row.url));
    const step = Math.max(1, Math.floor(unique.length / PER_MONTH));
    for (let i = 0; i < unique.length && sample.filter((s) => s.month === month).length < PER_MONTH; i += step) {
      sample.push(unique[i]);
    }
  }
  return { total: rows.length, sample };
}

const registryMode = process.argv.includes("--registry");
const population = registryMode
  ? await registrySample()
  : { total: ENDPOINTS.length, sample: ENDPOINTS.map((url) => ({ url, month: "" })) };

const results = [];
for (const target of population.sample) {
  let outcome = await probe(target.url);
  if (outcome.verdict !== "ALIVE" && !registryMode) {
    // Distinguish a corpse from a forwarding address: the same server,
    // spelled in the other transport era's path. Snapshot mode only —
    // the registry's URLs are current listings, so a dead one is not
    // an old spelling of a live one.
    const sibling = siblingPath(target.url);
    if (sibling) {
      const there = await probe(sibling);
      if (there.verdict === "ALIVE") {
        outcome = {
          ...outcome,
          verdict: "MOVED",
          why: `listed path dead (${outcome.why}); ${sibling} answers (${there.why})`,
        };
      }
    }
  }
  results.push({ ...target, ...outcome });
  console.log(
    `${outcome.verdict.padEnd(10)} ${String(outcome.probe.ms).padStart(6)}ms  ${target.month ? `[${target.month}] ` : ""}${target.url}  — ${outcome.why}`,
  );
}

const by = (verdict) => results.filter((r) => r.verdict === verdict);
const dead = [...by("DEAD-LOUD"), ...by("DEAD-QUIET")];
const median = (nums) =>
  nums.length ? [...nums].sort((a, b) => a - b)[Math.floor(nums.length / 2)] : null;

console.log(`\n— THE VERDICT —`);
console.log(
  registryMode
    ? `Population: ${results.length} sampled of ${population.total} remote listings on the official registry today (${PER_MONTH}/listing-month)`
    : `Population: ${ENDPOINTS.length} remote endpoints, ${SNAPSHOT}`,
);
console.log(
  `Alive ${by("ALIVE").length} · moved ${by("MOVED").length} · dead-loud ${by("DEAD-LOUD").length} · dead-quiet ${by("DEAD-QUIET").length}`,
);
if (registryMode) {
  console.log(`\nDeath against listing age (the attrition curve):`);
  for (const month of [...new Set(results.map((r) => r.month))].sort()) {
    const cohort = results.filter((r) => r.month === month);
    const gone = cohort.filter((r) => r.verdict !== "ALIVE").length;
    console.log(`  ${month}: ${gone}/${cohort.length} dead`);
  }
}
const stale = [...dead, ...by("MOVED")];
if (stale.length) {
  console.log(
    `Median time for a stale entry to say so: ${median(stale.map((r) => r.probe.ms))}ms`,
  );
  console.log(
    `Loud fraction of the stale: ${stale.length - by("DEAD-QUIET").length}/${stale.length}`,
  );
}
console.log(
  `\nReading: if the dead fail loud and fast, the cost of picking one is a` +
    `\nretry and a log line, and MCP-ABANDONMENT closes as measured-cheap.` +
    `\nOnly a meaningful DEAD-QUIET population reopens it.`,
);

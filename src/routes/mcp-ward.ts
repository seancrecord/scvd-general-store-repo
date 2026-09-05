import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  MCP_DIRECTORIES_UNREAD,
  MCP_SOURCE_ROSTER,
  MCP_WARD_IS_NOT,
  latestMcpPass,
  readMcpRegister,
  readMcpWalk,
} from "@/services/mcp-ward";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { securityBlock } from "@/store/surface-contract";
import {
  INSTRUMENTS_OPENED,
  MCP_WARD_FOR_MONEY,
  MCP_WARD_FREE_FIRST,
  MCP_WARD_PROPOSITION,
} from "@/store/copy/instruments";
import type { HonoEnv } from "@/types";

/**
 * GET /mcp-ward and /mcp-ward.json — the second ward's public face.
 *
 * The x402 ward walks doors; this one walks the MCP registry. They
 * share an instrument design and deliberately share no totals: this
 * page states its own denominators and never quotes one from the other
 * ward, because a reader who adds them has been misled by us rather
 * than by themselves.
 *
 * THE PAGE SAYS WHAT IT DOES NOT DO, twice and early. This ward counts
 * registrations. It does not open a session, does not speak the
 * initialize handshake, and issues no verdict on any MCP server. A
 * visitor arriving from the x402 ward will expect a verdict column
 * because that ward has one, and the honest answer is that we have no
 * MCP battery to cite and will not invent one for the symmetry.
 */
export const mcpWardRoutes = new Hono<HonoEnv>();

const MCP_CSS = `
.figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin: 1.5rem 0; }
.figure { border: 1px solid var(--line); padding: 0.85rem 0.9rem; background: var(--card); }
.figure .n { display: block; font-size: 1.6rem; color: var(--neon); font-variant-numeric: tabular-nums; }
.figure .label { display: block; font-size: 0.8rem; margin-top: 0.4rem; }
.limits { border: 1px dashed var(--line); padding: 0.9rem 1rem; margin: 1.5rem 0; }
.limits h3 { margin-top: 0; }
.statuses td { padding: 0.3rem 0.8rem 0.3rem 0; border-bottom: 1px solid var(--line); }
.roster-row { border: 1px dashed var(--line); padding: 0.5rem 1rem; margin: 0.5rem 0; }
`;

function num(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * THE TWIN, built once and served at both addresses. /mcp-ward with a
 * JSON Accept used to 302 here, which is one redirect between a
 * reader and an answer for no reason — and rule 60.4 asks the room
 * itself for the five answers, not the room's forwarding address.
 */
function wardTwin(
  base: string,
  pass: Awaited<ReturnType<typeof latestMcpPass>>,
  register: Awaited<ReturnType<typeof readMcpRegister>>,
  walk: Awaited<ReturnType<typeof readMcpWalk>>,
) {
  return {
    artifact: "mcp_ward",
    /* The five answers (60.4) and the three sentences (60.2), the
     * same strings the page and the guide carry. */
    what_this_is: MCP_WARD_PROPOSITION,
    proposition: MCP_WARD_PROPOSITION,
    price: MCP_WARD_FOR_MONEY,
    free_first: MCP_WARD_FREE_FIRST,
    opened: INSTRUMENTS_OPENED,
    how_to_call: {
      this_page: `GET ${base}/mcp-ward with Accept: application/json for this twin, text/html for the page. No account, no key.`,
      the_latest_pass: "`latest_pass` is the newest COMPLETED pass; a pass in flight is under `walk_in_progress` and is not a result.",
      mortality: "Read `latest_pass.disappeared` only when `latest_pass.truncated` is false. A truncated pass records no delisting at all, by design.",
    },
    errors: {
      this_page: "None: a GET here always answers 200, as HTML or JSON by Accept.",
      no_pass_yet: "Before any pass completes, `latest_pass` is null and `hosts_on_register` is 0. That is our age, not a measurement of an empty registry.",
    },
    security: securityBlock(base, {
      does_in_your_name: "Nothing. A GET here reads a stored register; no MCP server is contacted and no session is opened, here or ever, by this ward.",
      stores: "Nothing about you. The porch counts a visit by surface, never by caller.",
    }),
    what_this_is_not: MCP_WARD_IS_NOT,
    latest_pass: pass,
    hosts_on_register: Object.keys(register.hosts).length,
    last_completed_pass: register.last_pass,
    /** Where the current pass has got to, so a reader can see it working. */
    walk_in_progress: walk?.finished_at
      ? null
      : walk
        ? {
            started_at: walk.started_at,
            pages_read: walk.pages_read,
            servers_seen: walk.servers_seen,
            hosts_so_far: walk.hosts.length,
          }
        : null,
    separate_from_x402: `This ward shares no total with the x402 ward at ${base}/sources. Its population is MCP servers; theirs is x402 doors. Adding them would produce a number that is about nothing.`,
    /* Every MCP directory the ward knows of, read or not, with the
     * reason — the x402 roster's discipline on the second ward. */
    sources_read: MCP_SOURCE_ROSTER.filter((entry) => entry.readiness.state === "read").map((entry) => entry.source),
    directories_unread: MCP_DIRECTORIES_UNREAD,
  };
}

mcpWardRoutes.get("/mcp-ward.json", async (c) => {
  const [pass, register, walk] = await Promise.all([
    latestMcpPass(c.env),
    readMcpRegister(c.env),
    readMcpWalk(c.env),
  ]);
  return c.json(wardTwin(c.env.STORE_BASE_URL, pass, register, walk));
});

mcpWardRoutes.get("/mcp-ward", async (c) => {
  const [pass, register, walk] = await Promise.all([
    latestMcpPass(c.env),
    readMcpRegister(c.env),
    readMcpWalk(c.env),
  ]);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(wardTwin(c.env.STORE_BASE_URL, pass, register, walk));
  }

  const onRegister = Object.keys(register.hosts).length;
  const progress =
    walk && !walk.finished_at
      ? `<p class="menu-meta">A pass is running now: ${num(walk.pages_read)} registry
        pages read, ${num(walk.servers_seen)} rows seen, ${num(walk.hosts.length)}
        unique hosts so far. Passes run in hourly batches on a stored cursor
        because the registry is far larger than one invocation can read.</p>`
      : "";

  const body = pass
    ? `<div class="figures">
      ${[
        [num(pass.servers_seen), "registry rows read"],
        [num(pass.servers_with_remote), "rows with a remote URL"],
        [num(pass.hosts_known), "unique hosts"],
        [num(onRegister), "hosts on the register, all time"],
      ]
        .map(
          ([n, label]) =>
            `<div class="figure"><span class="n">${escapeHtml(n!)}</span><span class="label">${escapeHtml(label!)}</span></div>`,
        )
        .join("")}
    </div>
    <p class="menu-meta">Rows and hosts are different numbers and both are
    published: a registration can be an npm or stdio server with no network
    address at all, so it is a real row and contributes no host. Reporting only
    the host count would inflate the share of the registry that is remotely
    reachable.</p>
    <section><h2>The registry's own status words</h2>
    <table class="statuses"><tbody>${Object.entries(pass.status_counts)
      .sort((a, b) => b[1] - a[1])
      .map(
        ([word, count]) =>
          `<tr><td><code>${escapeHtml(word)}</code></td><td>${escapeHtml(num(count))}</td></tr>`,
      )
      .join("")}</tbody></table>
    <p class="menu-meta">These words are the registry's, not ours. We count
    them and we do not reinterpret them.</p></section>
    <section><h2>Movement on the last completed pass</h2>
    <p class="menu-desc">${num(pass.appeared.length)} appeared,
    ${num(pass.disappeared.length)} stopped being listed,
    ${num(pass.returned.length)} were listed again after having been absent.</p>
    ${
      pass.truncated
        ? `<p class="menu-desc"><strong>This pass was truncated</strong>, so no
        disappearance is recorded from it at all. A partial read cannot tell a
        delisting from a page we never reached, and a fabricated delisting is a
        wrong claim about somebody's project in a record we do not rewrite.</p>`
        : `<p class="menu-meta">Recorded because the pass ran to the registry's
        own end of cursor. A pass that stops short records its hosts and refuses
        to record a single disappearance.</p>`
    }</section>`
    : `<p class="menu-desc">No pass has completed yet, so there is nothing to
      report. That is a fact about this ward's age, not about the registry.</p>`;

  return c.html(
    renderSimplePage({
      title: "The MCP ward",
      description:
        "A weekly enumeration of the official MCP registry, kept as its own population with its own denominators — it counts registrations and knocks on nothing.",
      path: "/mcp-ward",
      extraCss: MCP_CSS,
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(MCP_WARD_PROPOSITION)}</p>
        <p class="menu-desc">The store's other ward walks x402 doors once a
        week. This one walks the official MCP registry on the same design and
        with one deliberate difference: <strong>it counts, and it does not
        knock</strong>.</p>
        <p class="menu-desc">Enumeration is nearly free and tells us something
        probing cannot: a host that was listed and is now listed nowhere is a
        delisting we can record having never spent a request on it.</p>
        ${progress}
      </section>
      ${body}
      <section><h2>Named, not read</h2>
      <p class="menu-desc">Directories we know exist and do not read, each with
      the reason and what would dissolve it. A roster that named only what it
      reads would report a reach it does not have.</p>
      ${MCP_DIRECTORIES_UNREAD.map(
        (row) => `<div class="roster-row">
        <p class="menu-desc"><strong><code>${escapeHtml(row.source)}</code></strong> — ${escapeHtml(row.what)}</p>
        <p class="menu-desc">${escapeHtml(row.why)}</p>
        <p class="menu-meta"><strong>What would dissolve it:</strong> ${escapeHtml(row.unblock)}</p>
      </div>`,
      ).join("")}</section>
      <section class="limits">
        <h3>What this is not</h3>
        <p class="menu-desc">${escapeHtml(MCP_WARD_IS_NOT)}</p>
        <h3>What it cannot see</h3>
        <ul>${(pass?.what_this_cannot_see ?? [])
          .map((line) => `<li class="menu-desc">${escapeHtml(line)}</li>`)
          .join("")}</ul>
        <p class="menu-meta"><strong>These totals share nothing with the x402
        ward.</strong> That population is doors; this one is MCP servers. Adding
        them gives a number that is about nothing, which is why neither page
        ever quotes the other's denominator. The x402 side is at
        <a href="/sources">/sources</a> and <a href="/ledger">/ledger</a>.</p>
      </section>
      <section><h2>What this costs</h2>
      <p class="menu-desc">${escapeHtml(MCP_WARD_FOR_MONEY)}</p>
      <p class="menu-meta">${escapeHtml(MCP_WARD_FREE_FIRST)}</p></section>
      <section><p class="menu-desc">The same ward as JSON:
      <a href="/mcp-ward.json"><code>${escapeHtml(c.env.STORE_BASE_URL)}/mcp-ward.json</code></a>.</p></section>
      ${jsonLdScript({
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: "The MCP ward",
        description: MCP_WARD_PROPOSITION,
        url: `${c.env.STORE_BASE_URL}/mcp-ward`,
        creator: organizationRef(c.env.STORE_BASE_URL),
        isAccessibleForFree: true,
        conditionsOfAccess: "Free to read. No account, no key.",
        measurementTechnique:
          "Enumeration only, never a probe: the official MCP registry is walked in hourly batches on a stored cursor, and a pass completes when the registry cursor runs out. Mortality is recorded only from a completed pass.",
        variableMeasured: [
          "registry rows read, and how many carried a remote URL",
          "unique hosts across a completed pass",
          "the registrys own status words, counted and not reinterpreted",
          "hosts appeared, stopped being listed, and listed again",
        ],
        distribution: [
          {
            "@type": "DataDownload",
            encodingFormat: "application/json",
            contentUrl: `${c.env.STORE_BASE_URL}/mcp-ward.json`,
            name: "The MCP ward register and its latest completed pass",
          },
        ],
      })}`,
    }),
  );
});

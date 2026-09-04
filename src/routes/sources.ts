import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  registerFindings,
  sourceRegister,
  type SourceLiveness,
  type SourceRegister,
} from "@/services/source-liveness";
import { readHeartbeat, type Heartbeat } from "@/services/ward-heartbeat";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { securityBlock } from "@/store/surface-contract";
import {
  INSTRUMENTS_OPENED,
  MCP_WARD_PROPOSITION,
  SOURCES_FOR_MONEY,
  SOURCES_FREE_FIRST,
  SOURCES_PROPOSITION,
} from "@/store/copy/instruments";
import type { HonoEnv } from "@/types";

/**
 * GET /sources.json and GET /sources — WHERE OUR POPULATION COMES
 * FROM, and when each of those places last actually answered.
 *
 * The store has published its coverage as a class × chain × depth
 * matrix since M1, and its gaps in prose on every artifact that
 * carries a count. Neither said the plainest thing a reader can ask
 * of a measurement project: your numbers come from somewhere — is
 * that somewhere still talking to you?
 *
 * It could not say it, because until 2026-09-04 the answer lived in a
 * hand-written constant. This room is the fix's public face: every
 * row derived from stored rounds, and the LAST SUCCESSFUL PULL column
 * carrying a timestamp that no prose can fake.
 *
 * IT RATES NOBODY. A directory we cannot read is a fact about our
 * reach, not their health — the same discipline as `days_unchecked`
 * on a watch and `not_probed` on a brief, pointed at the instrument
 * instead of the subject.
 */
export const sourceRoutes = new Hono<HonoEnv>();

const SOURCES_CSS = `
table.sources td:first-child { white-space: nowrap; }
.st-live { color: var(--night-good, inherit); }
.st-stale, .st-never_answered { font-weight: 600; }
.st-unread { color: var(--night-faded); }
.finding { border: 1px dashed var(--line); padding: 0.75rem 1rem; margin: 1rem 0; }
.finding h3 { margin-top: 0; }
.roster-row { border: 1px dashed var(--line); padding: 0.5rem 1rem; margin: 0.5rem 0; }
`;

/** What each status word means, said once, on the page that uses it. */
const STATUS_MEANS: Record<SourceLiveness["status"], string> = {
  live: "Answered on the most recent round.",
  stale: "Has answered before, but not on the most recent round. Its hosts are on the register by carry-forward, not by observation.",
  never_answered:
    "A reader exists and the round calls it. No round has ever got an answer back.",
  unread:
    "No reader exists. The row below says why, and what would dissolve it.",
};

function statusCell(row: SourceLiveness): string {
  return `<td class="st-${escapeHtml(row.status)}"><code>${escapeHtml(row.status)}</code></td>`;
}

function lastReadCell(row: SourceLiveness): string {
  if (row.last_successful_read === null) {
    return `<td><span class="menu-meta">never</span></td>`;
  }
  return `<td><code>${escapeHtml(row.last_successful_read)}</code><br>
  <span class="menu-meta">${escapeHtml(row.last_successful_week ?? "")}${
    row.hosts_on_last_read === null
      ? ""
      : `, ${row.hosts_on_last_read.toLocaleString("en-US")} hosts`
  }</span></td>`;
}

function heartbeatBlock(beat: Heartbeat): string {
  const gaps = beat.weeks_missing.length
    ? `<p class="menu-desc"><strong>Weeks the record does not hold:</strong>
      ${beat.weeks_missing.map((week) => `<code>${escapeHtml(week)}</code>`).join(", ")}.
      A gap is ours, not the ecosystem's — the round did not run, or ran and
      could not be sealed.</p>`
    : `<p class="menu-meta">No week is missing between the oldest round and the
      newest. Stated as a finding rather than left out: a line that only
      appears when the news is bad teaches a reader to read silence as
      continuity.</p>`;
  return `<section class="finding">
    <h3>Is the machine still running?</h3>
    <p class="menu-desc"><code>${escapeHtml(beat.verdict)}</code> —
    ${escapeHtml(beat.detail)}</p>
    ${gaps}
    <p class="menu-meta">Checked hourly, deliberately not weekly: a watchdog on
    the same schedule as the thing it watches dies with it. It asks whether a
    round WROTE something, not merely whether one finished — a run that
    completes having done nothing is indistinguishable from a quiet week on
    every other surface here.</p>
  </section>`;
}

function renderPage(
  register: SourceRegister,
  beat: Heartbeat,
  base: string,
): string {
  const findings = registerFindings(register);

  const rows = register.sources
    .map(
      (row) => `<tr>
      <td><a href="${escapeHtml(row.home)}" rel="nofollow noopener"><code>${escapeHtml(row.source)}</code></a><br>
      <span class="menu-meta">${escapeHtml(row.what)}</span></td>
      ${statusCell(row)}
      ${lastReadCell(row)}
      <td>${row.consecutive_failures === 0 ? "—" : escapeHtml(String(row.consecutive_failures))}</td>
      <td>${escapeHtml(String(row.rounds_seen))}</td>
    </tr>`,
    )
    .join("");

  const legend = (Object.keys(STATUS_MEANS) as SourceLiveness["status"][])
    .map(
      (status) =>
        `<tr><td><code>${escapeHtml(status)}</code></td><td>${escapeHtml(STATUS_MEANS[status])}</td></tr>`,
    )
    .join("");

  const unread = register.sources
    .filter((row) => row.status === "unread")
    .map(
      (row) => `<div class="roster-row">
      <p class="menu-desc"><strong><code>${escapeHtml(row.source)}</code></strong> —
      ${escapeHtml(row.what)}</p>
      <p class="menu-desc">${escapeHtml(row.why_unread ?? "")}</p>
      <p class="menu-meta"><strong>What would dissolve it:</strong> ${escapeHtml(row.unblock ?? "")}</p>
    </div>`,
    )
    .join("");

  const findingsBlock = findings.length
    ? `<section class="finding"><h3>Open against us right now</h3>
    <ul>${findings.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
    <p class="menu-meta">These are derived, not curated. A row leaves this
    list when the history stops supporting it, not when somebody edits a
    page.</p></section>`
    : `<section class="finding"><h3>Open against us right now</h3>
    <p class="menu-desc">Nothing. Every source the roster calls readable has
    answered on the most recent round this register can see. Reported as a
    finding of "none" rather than omitted, because a section that vanishes
    when it is empty teaches a reader to see silence as good news.</p></section>`;

  const newest = register.newest_round
    ? `<code>${escapeHtml(register.newest_round.week)}</code> (${escapeHtml(register.newest_round.at)})`
    : "none — no round has been stored yet, so every row below is a roster entry with no history behind it";

  return `<section>
    <p class="menu-desc">${escapeHtml(SOURCES_PROPOSITION)}</p>
    <p class="menu-desc">Every number this store publishes about the x402
    ecosystem rests on a handful of public directories. This is the list of
    them, and — the column that matters — <strong>the last time each one
    actually answered us</strong>.</p>
    <p class="menu-desc">Nothing here is maintained by hand. Every field is
    read back out of the stored weekly rounds, where each round already
    records what each source returned and distinguishes "answered with
    nothing" from "could not be read". A written list can go quietly out of
    date; a timestamp taken off a real run cannot.</p>
    <p class="menu-meta">Newest round seen: ${newest}. Derived from
    ${escapeHtml(String(register.rounds_read))} stored round${register.rounds_read === 1 ? "" : "s"}${
      register.history_truncated
        ? ", and the history cap bound — this is a window, not all time"
        : ""
    }.</p>
  </section>
  ${heartbeatBlock(beat)}
  ${findingsBlock}
  <section><h2>The roster</h2>
  <table class="sources"><thead><tr>
    <th>source</th><th>status</th><th>last successful pull</th>
    <th>failed rounds since</th><th>rounds asked</th>
  </tr></thead>
  <tbody>${rows}</tbody></table></section>
  <section><h2>What each status means</h2>
  <table><thead><tr><th>status</th><th>meaning</th></tr></thead>
  <tbody>${legend}</tbody></table>
  <p class="menu-desc"><code>never_answered</code> is the one worth staring
  at. It means we built a reader, the round calls it every week, and it has
  never once come back with anything — a feed that looks configured and
  silently records nothing. Publishing it is cheaper than discovering it.</p>
  </section>
  <section><h2>Named, not read</h2>
  <p class="menu-desc">Directories we know exist and do not read. Naming
  them is not decoration: a roster that quietly skipped its unreadable
  entries would report a reach it does not have, and the gap has to ride
  the same page as the findings.</p>
  ${unread}</section>
  <section class="limits">
    <h3>What this is not</h3>
    <p class="menu-desc">${escapeHtml(register.what_this_is_not)}</p>
    <p class="menu-meta">${escapeHtml(register.how_to_rederive)}</p>
  </section>
  <section><h2>What this costs</h2>
  <p class="menu-desc">${escapeHtml(SOURCES_FOR_MONEY)}</p>
  <p class="menu-meta">${escapeHtml(SOURCES_FREE_FIRST)}</p></section>
  <section><p class="menu-desc">The same register as JSON, byte for byte:
  <a href="/sources.json"><code>${escapeHtml(base)}/sources.json</code></a>.
  Where our observing stops, by class and chain: <a href="/coverage">/coverage</a>.
  What we later found we had stated wrong: <a href="/corrections">/corrections</a>.
  One week of all of it, read: <a href="/ledger">/ledger</a>.</p>
  <p class="menu-desc">The other ward, kept apart on purpose:
  <a href="/mcp-ward">/mcp-ward</a> walks the MCP registry.
  ${escapeHtml(MCP_WARD_PROPOSITION)}</p></section>
  ${jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Where our numbers come from",
    description: SOURCES_PROPOSITION,
    url: `${base}/sources`,
    creator: organizationRef(base),
    isAccessibleForFree: true,
    conditionsOfAccess: "Free to read. No account, no key.",
    measurementTechnique:
      "Per-source liveness derived from the stored weekly ward rounds, where each round records what each source returned and distinguishes a source that answered with nothing from one that could not be read.",
    variableMeasured: [
      "source status: live, stale, never_answered or unread",
      "last successful pull, with the signed week it belongs to",
      "consecutive failed rounds since the last answer",
      "rounds in which the source was asked at all",
      "ward heartbeat: whether the weekly round ran and whether it wrote anything",
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${base}/sources.json`,
        name: "The source register, with the heartbeat",
      },
    ],
  })}`;
}

/**
 * THE FIVE ANSWERS (house rule 60.4) and the three sentences (60.2),
 * identical on this twin, the page and the guide. A room that sells
 * nothing owes them exactly as much as a room that takes money: the
 * rule is about a reader finding the thing and knowing what it is
 * for, and "what does money buy here" has a real answer on an
 * instrument-transparency page — nothing, on purpose.
 */
function fiveAnswers(base: string) {
  return {
    what_this_is: SOURCES_PROPOSITION,
    proposition: SOURCES_PROPOSITION,
    price: SOURCES_FOR_MONEY,
    free_first: SOURCES_FREE_FIRST,
    opened: INSTRUMENTS_OPENED,
    how_to_call: {
      this_page: `GET ${base}/sources with Accept: application/json for this twin, text/html for the page. No account, no key.`,
      one_source: "Every row is in `sources`; join a row to a signed round on `last_successful_week`.",
      the_heartbeat: "The `heartbeat` block says whether the weekly round is still running and whether the newest one wrote anything.",
      rederive: `GET ${base}/corpus.json for the signed weeks, then recount each source from each round's own per_source block.`,
    },
    errors: {
      this_page: "None: a GET here always answers 200, as HTML or JSON by Accept.",
      empty_history: "A store with no stored rounds answers 200 with every source at its roster state and no liveness behind it. That is a fact about our age, not an error.",
    },
    security: securityBlock(base, {
      does_in_your_name: "Nothing. A GET here reads stored rounds; no directory is contacted, nothing is signed, nothing is fetched from anyone on your behalf.",
      stores: "Nothing about you. The porch counts a visit by surface, never by caller.",
    }),
  };
}

sourceRoutes.get("/sources.json", async (c) => {
  const [register, heartbeat] = await Promise.all([
    sourceRegister(c.env),
    readHeartbeat(c.env),
  ]);
  return c.json({ ...fiveAnswers(c.env.STORE_BASE_URL), ...register, heartbeat });
});

sourceRoutes.get("/sources", async (c) => {
  const [register, heartbeat] = await Promise.all([
    sourceRegister(c.env),
    readHeartbeat(c.env),
  ]);
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json({ ...fiveAnswers(c.env.STORE_BASE_URL), ...register, heartbeat });
  }
  return c.html(
    renderSimplePage({
      title: "Where our numbers come from",
      description:
        "The directories this store's ecosystem counts are built from, each with the last time it actually answered — derived from stored rounds, not maintained by hand.",
      path: "/sources",
      extraCss: SOURCES_CSS,
      bodyHtml: renderPage(register, heartbeat, c.env.STORE_BASE_URL),
    }),
  );
});

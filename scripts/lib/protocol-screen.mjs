/**
 * THE PROTOCOL SCREEN — what the neighbouring standards did to us this week.
 *
 * scout.nekuda.ai watches six agentic-web standards and publishes every
 * merged pull request with a semver level, a breaking flag, the touched
 * files and a written impact line. This module turns that page into a
 * dated screen against THIS store's surfaces: which merges touch code we
 * have shipped, which touch a lane we have only planned, and which are
 * noise.
 *
 * THE INSTRUMENT'S OWN LIMITS, DECLARED UP FRONT (house rule: an
 * observatory that cannot see something says so):
 *
 *  1. Scout does not track x402. Our rail is layer 3 of the five in
 *     docs/PROTOCOL_EXPANSION_2026-08.md and scout covers layers 1, 2
 *     and 5. A quiet week here is NOT a quiet week on our own wire, and
 *     this screen must never be read as coverage of x402 or MPP.
 *  2. Scout is somebody else's reading. A merge absent from scout is
 *     unobserved, not absent. Every count below carries its denominator
 *     and the word `scout` so no derived claim can launder it.
 *  3. The data is lifted out of a Next.js flight payload, which is a
 *     private serialization that can change without notice. The
 *     extractor throws rather than returning a thin result: a screen
 *     that silently reads zero merges would tell us the industry
 *     stopped, and that is the one lie an instrument must not tell.
 *
 * Pure functions only. The fetch and the writes live in the runner,
 * scripts/protocol-screen.mjs.
 */

import { applyRulings, openProposals, renderRulings } from "./rulings.mjs";

export const SCOUT_URL = "https://scout.nekuda.ai/";

/**
 * Every protocol the screen carries, with the layer each occupies in
 * `docs/PROTOCOL_EXPANSION_2026-08.md` §1. The first six come from
 * scout; the last three are read from their own git history by
 * `git-source.mjs`, and are the layer scout cannot see.
 */
export const LAYERS = {
  AP2: "1 authorization",
  ACP: "2 commerce",
  UCP: "2 commerce",
  A2A: "3 agent transport",
  WebMCP: "4 browser runtime",
  WebBotAuth: "5 agent identity",
  x402: "3 our rail",
  MPP: "3 second wire",
  "Tempo TIPs": "4 settlement",
};

/* ------------------------------------------------------------------ *
 * Extraction
 * ------------------------------------------------------------------ */

/**
 * Pull the RSC flight payload out of the served HTML.
 *
 * Next.js streams its server payload as a sequence of
 * `self.__next_f.push([1,"<json string chunk>"])` calls. Each argument
 * is a JSON string literal; concatenating the decoded chunks in document
 * order reconstitutes one long serialized document.
 */
export function extractFlight(html) {
  const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)];
  if (chunks.length === 0) {
    throw new Error("protocol-screen: no __next_f chunks in the page — scout changed shape");
  }
  let out = "";
  for (const m of chunks) {
    try {
      out += JSON.parse(m[1]);
    } catch {
      /* a chunk that will not decode is skipped; the anchor check below
         is what decides whether enough survived to be worth reading */
    }
  }
  return out;
}

/** Walk a balanced JSON object out of a string, starting at `start`. */
function sliceObject(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (escaped) escaped = false;
    else if (c === "\\") escaped = true;
    else if (c === '"') inString = !inString;
    else if (!inString) {
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(start, i + 1);
      }
    }
  }
  throw new Error("protocol-screen: unbalanced object in the flight payload");
}

/**
 * The `protocolData` map: protocol name -> metadata + updates[].
 *
 * Anchored on the literal `"protocolData":` key rather than on any one
 * protocol name, so a seventh protocol appearing (x402, one day) does
 * not break the read.
 */
export function extractProtocols(flight) {
  const key = flight.indexOf('"protocolData":');
  if (key === -1) {
    throw new Error("protocol-screen: no protocolData in the payload — scout changed shape");
  }
  const brace = flight.indexOf("{", key + '"protocolData":'.length);
  if (brace === -1) throw new Error("protocol-screen: protocolData is not an object");
  const parsed = JSON.parse(sliceObject(flight, brace));
  const names = Object.keys(parsed);
  if (names.length === 0) throw new Error("protocol-screen: protocolData is empty");
  for (const name of names) {
    if (!Array.isArray(parsed[name]?.updates)) {
      throw new Error(`protocol-screen: ${name} carries no updates array`);
    }
  }
  return parsed;
}

/**
 * WHAT EACH SOURCE STRUCTURALLY CANNOT SHOW, declared per source and
 * assembled into every report's closing section.
 *
 * This used to be a hard-coded paragraph saying x402 was invisible.
 * Once the git source landed that sentence became false, and a stale
 * limitation is worse than none: it teaches a reader to discount a
 * screen that has since grown the coverage. Limits are now a property
 * of the sources actually read on the run.
 */
export const SOURCE_LIMITS = {
  scout: [
    "Scout is somebody else's reading. A merge absent from it is unobserved, not absent.",
    "Scout reports merges, not adoption. A specification can be quiet because it is finished, and a product can ship from infrastructure that never appears in a spec repository's log.",
  ],
  git: [
    "Git carries no `breaking` flag. None of the layer-3 repositories uses conventional-commit breaking markers, so a git-sourced row's `breaking: false` means NOT DECLARED, never NOT BREAKING. Level and consequence on these rows are derived by this script, not stated by the maintainer.",
    "Release ancestry. Tags are read, but these clones are shallow, so a row is marked released only when a tag points at its exact commit. `unknown` means no tag names it — never that it has not shipped.",
    "The window is bounded by the clone. Anything older than the run's `--since` is outside the read, not absent from history.",
  ],
};

/* ------------------------------------------------------------------ *
 * Tagging — what a merge is ABOUT
 * ------------------------------------------------------------------ */

export const TAGS = {
  payment: /\bpay(ment|ments)?\b|\bcheckout\b|\bcharge\b|\bsettle|\brefund|\bcapture\b|\bprice|\bcurrency|\bamount\b|\btax\b|\bcredential\b|\binstrument\b/i,
  mandate: /\bmandate|\bintent\b|\bconsent|\bauthoris|\bauthoriz|\bdelegat/i,
  // `key` alone is too hungry — it matched A2A's "key-concepts docs".
  // Crypto context is required, so a docs PR cannot wear a signature tag.
  signature: /\bsign(ed|ature|ing|er)s?\b|\bkeyring\b|\b(public|private|signing|verifying|test) keys?\b|key resolution|key limit|\bnonce\b|\bjwks?\b|\bed25519\b|\bcanonical|\bjcs\b|http message signature|rfc ?9421|\bcontent-digest\b|\bthumbprint\b/i,
  evidence: /\breceipt|\bproof\b|\battestation|\baudit\b|\bverif|\btest vector/i,
  idempotency: /\bidempoten|\breplay\b|\bretry\b/i,
  expiry: /\bexpir|\bttl\b|\btimeout|\bstale\b|\bcreated\b.*\btimestamp|\btimestamp\b.*\bfuture/i,
  discovery: /well-known|\bdiscovery\b|\bmanifest\b|agent card|\bregistry\b|\bdirectory\b/i,
  failClosed: /\breject\b|\bfail(s|-| )?clos|\bmust now\b|\bwill now be rejected\b|\bstricter\b|\benforce/i,
  schema: /\bschema\b|\bnamespace\b|\bdiscriminator\b|\brequired field\b|\bjson ?path\b|\bopenapi\b/i,
  governance: /\bcouncil\b|\bgovernance\b|\bsteering\b|\bworking group\b|\bdonat/i,
};

/**
 * HOUSEKEEPING, AND WHY IT IS DEMOTED BY NAME.
 *
 * A readability pass, a typo, a dependency bump or a link-checker fix is
 * a real merge and stays in the denominator — but a screen that pages a
 * human for "Improve Readability and Wording in Life-of-a-Task Docs" is
 * a screen nobody reads by week three, and an unread screen is worse
 * than none. Demotion applies ONLY to non-breaking patch merges: a
 * breaking change wearing a modest title still gets scored on its own
 * terms.
 */
export const HOUSEKEEPING =
  /\breadability\b|\bwording\b|\btypos?\b|\bspelling\b|\bgrammar\b|\bbump\b|\bupgrade [\w.-]+ to\b|dependency packages|\bdiscord\b|\blink checker\b|\blinter\b|\bformatting\b|stale (issue|example)|^(chore|ci|build|test|style|deps)(\([^)]*\))?:|\bdependabot\b|\bgithub action/i;

export function isHousekeeping(row) {
  // A commit that touched the specification is never housekeeping,
  // whatever its subject line calls itself.
  if (row.specChange) return false;
  return !row.breaking && row.level === "patch" && HOUSEKEEPING.test(`${row.title} ${row.description}`);
}

const CORE_TAGS = new Set(["payment", "mandate", "signature", "evidence", "idempotency", "expiry"]);

export function tagRow(row) {
  const hay = `${row.title} ${row.description} ${row.impact ?? ""}`;
  return Object.entries(TAGS)
    .filter(([, re]) => re.test(hay))
    .map(([name]) => name);
}

/* ------------------------------------------------------------------ *
 * Our surfaces — the half of the screen that is about us
 * ------------------------------------------------------------------ */

/**
 * Each surface names real code or a real planned lane, the protocols
 * that can move it, and what a hit means. `state` is the honest one:
 * `shipped` means a merge here can invalidate code that is live;
 * `planned` means it can only re-price a lane that is not built yet.
 *
 * Keep this table honest. A surface listed as shipped that is not
 * shipped turns this screen into the flattery it exists to refuse.
 */
export const SURFACES = [
  {
    id: "signature-verification",
    state: "shipped",
    where: "src/services/receipt-verify.ts, conformance desk, src/lib/mpp-challenge.ts",
    protocols: ["WebBotAuth", "A2A"],
    tags: ["signature", "evidence", "expiry", "failClosed"],
    why: "We verify other parties' signed offers and receipts for a living. A standard tightening what counts as a valid signature moves our batteries.",
  },
  {
    id: "defect-vocabulary",
    state: "shipped",
    where: "defects/, the named defect classes (vocabulary v15)",
    protocols: ["WebBotAuth", "UCP", "ACP", "A2A", "WebMCP", "x402", "MPP"],
    tags: ["failClosed", "expiry", "idempotency", "schema"],
    why: "A standard that makes previously-valid traffic invalid is manufacturing a silent-break class — the same shape as advertised-version-unpayable. Candidate classes arrive here first.",
  },
  {
    id: "webmcp-channel",
    state: "shipped",
    where: "webmcp/purchase.js, src/lib/mcp-tools.ts",
    protocols: ["WebMCP"],
    tags: [],
    why: "We expose quotes and buyer-signed completion in the browser. Every WebMCP merge is a change to the surface we publish into.",
  },
  {
    id: "a2a-agent-card",
    state: "shipped",
    where: "check_a2a_card, scripts/a2a-live.mjs, the A2A evidence agent",
    protocols: ["A2A"],
    tags: [],
    why: "We serve an agent card and sell a check of other people's. Card shape changes are our instrument's subject.",
  },
  {
    id: "ap2-mandate-instrument",
    state: "planned",
    where: "docs/PROTOCOL_EXPANSION_2026-08.md D5 — 'highest-value lane in this file'",
    protocols: ["AP2", "UCP"],
    tags: ["mandate", "payment"],
    why: "The planned instrument reads a presented mandate chain and returns a signed third-party record of what it establishes. Its subject is whichever repo actually versions the mandate schemas.",
  },
  {
    id: "commerce-observation",
    state: "planned",
    where: "ROADMAP L3 lane-B reader; docs/PROTOCOL_EXPANSION_2026-08.md D6 (no as a merchant, yes as a subject)",
    protocols: ["UCP", "ACP"],
    tags: ["payment", "schema"],
    why: "ACP/UCP-class doors enter the corpus as subjects the day their batteries are written. Cadence here decides which battery is worth writing first.",
  },
  {
    id: "x402-wire",
    state: "shipped",
    where: "src/routes/buy.ts, src/lib/payment-networks.ts — x402 v2 offers, accepts and settlement",
    protocols: ["x402"],
    tags: [],
    why: "This is the wire we are paid over. A change to the x402 specification is a change to the offers we serve and the payments we accept.",
  },
  {
    id: "preflight-battery",
    state: "shipped",
    where: "src/services/preflight.ts — the free instrument, and the census battery behind it",
    protocols: ["x402"],
    tags: [],
    why: "The preflight verdict is a reading of somebody else's door against the x402 spec. When the spec moves, the battery is measuring against yesterday's wire — and a stale battery issues confident wrong verdicts rather than failing loudly.",
  },
  {
    id: "mpp-battery",
    state: "shipped",
    where: "src/services/mpp-battery.ts, src/lib/mpp-challenge.ts — the Tier 0 read-only checks",
    protocols: ["MPP"],
    tags: [],
    why: "The second wire, already built read-only. Its challenge parser and check list are sourced to the draft; the draft moving is the one thing that invalidates them.",
  },
  {
    id: "settlement-rails",
    state: "shipped",
    where: "src/lib/payment-networks.ts, PAYMENT_RAILS.md — the standing intake rule",
    protocols: ["x402", "MPP"],
    tags: ["payment"],
    why: "A new scheme or chain in the spec is not a reason to accept it. The intake rule needs a named counterparty — but a rail we have not heard of cannot be asked for by name, so it gets read here and waits there.",
  },
  {
    id: "tempo-rail-watch",
    state: "planned",
    /*
     * Tempo is PLANNED on purpose, and the distinction is the whole
     * point of the band. We settle on Base, Polygon, Arbitrum, World
     * and Solana; we do not settle on Tempo, and D2 in the August read
     * puts it behind MPP as a capped rail with no demand signal. A TIP
     * moving is worth a read and is never work on shipped code — which
     * is exactly what `planned` means here. Scored as shipped, Tempo
     * alone put nine rows in ACT that nobody could act on.
     */
    where: "docs/PROTOCOL_EXPANSION_2026-08.md D2 — Tempo capped, behind MPP, no demand signal",
    protocols: ["Tempo TIPs"],
    tags: [],
    why: "Not a rail we take. Its TIPs are read so that the day a named counterparty asks for Tempo we are not starting from zero, and for the settlement mechanics MPP's charge methods cite.",
  },
  {
    id: "discovery",
    state: "shipped",
    where: ".well-known/x402.json, registry listings, KEEPER_LIST submissions",
    protocols: ["WebBotAuth", "A2A", "UCP", "WebMCP", "x402"],
    tags: ["discovery"],
    why: "Discovery registrations grow additively under the standing intake rule — this is the one lane that does not need a named counterparty.",
  },
];

export function matchSurfaces(row) {
  const tags = new Set(row.tags);
  return SURFACES.filter((s) => {
    if (!s.protocols.includes(row.protocol)) return false;
    if (s.tags.length === 0) return true;
    return s.tags.some((t) => tags.has(t));
  }).map((s) => s.id);
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/**
 * WHAT COUNTS AS CONSEQUENTIAL, and why it is not one field.
 *
 * Scout gives us a human-set `breaking` flag. Git gives us no such
 * thing (see git-source.mjs), so at layer 3 the promotion signal is
 * whether the commit touched the SPECIFICATION rather than an SDK —
 * a fact about paths, not a guess about intent. Both are the same
 * question in the end: did the wire we implement move?
 */
export function isConsequential(row) {
  return Boolean(row.breaking) || Boolean(row.specChange);
}

function consequenceReason(row) {
  if (row.breaking) return row.derived ? "breaking (derived from the subject)" : "breaking";
  return "touches the specification";
}

/**
 * Three bands, and the middle one is deliberately the widest.
 *
 *  act  — consequential, and it lands on a surface we have SHIPPED.
 *         Someone has to look at our code this week.
 *  read — consequential anywhere, or payment/signature-shaped on any
 *         surface we named. A human reads it and rules.
 *  log  — it happened; it is in the denominator; nobody is paged.
 */
export function scoreRow(row) {
  const surfaces = row.surfaces ?? [];
  if (isHousekeeping(row)) return { band: "log", reasons: ["housekeeping"] };
  const shipped = surfaces.filter((id) => SURFACES.find((s) => s.id === id)?.state === "shipped");
  const core = row.tags.filter((t) => CORE_TAGS.has(t));
  const reasons = [];
  let band = "log";
  if (isConsequential(row) && shipped.length > 0) {
    band = "act";
    reasons.push(`${consequenceReason(row)}, on shipped surface: ${shipped.join(", ")}`);
  } else if (isConsequential(row)) {
    band = "read";
    reasons.push(surfaces.length
      ? `${consequenceReason(row)}, on planned surface: ${surfaces.join(", ")}`
      : `${consequenceReason(row)}, no surface matched`);
  } else if (surfaces.length > 0 && core.length > 0) {
    band = "read";
    reasons.push(`${core.join("/")} on ${surfaces.join(", ")}`);
  } else if (surfaces.length > 0) {
    reasons.push(`touches ${surfaces.join(", ")}`);
  }
  return { band, reasons };
}

/* ------------------------------------------------------------------ *
 * Shaping a run
 * ------------------------------------------------------------------ */

const DAY = 86_400_000;

export function daysBetween(fromIso, toIso) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);
}

export function flattenUpdates(protocolData, today) {
  const rows = [];
  for (const [protocol, meta] of Object.entries(protocolData)) {
    for (const u of meta.updates ?? []) {
      const row = {
        protocol,
        layer: LAYERS[protocol] ?? "unmapped",
        id: u.id,
        date: u.date,
        age: daysBetween(u.date, today),
        pr: u.prNumber,
        url: u.prUrl,
        title: u.title,
        description: u.description ?? "",
        impact: u.impact ?? "",
        breaking: Boolean(u.breaking),
        level: u.level,
        files: u.files ?? [],
        author: u.author,
        source: meta.source ?? "scout",
        derived: Boolean(u.derived),
        specChange: Boolean(u.specChange),
        released: u.released ?? null,
        releasedIn: u.releasedIn ?? [],
      };
      row.tags = tagRow(row);
      row.surfaces = matchSurfaces(row);
      Object.assign(row, scoreRow(row));
      rows.push(row);
    }
  }
  rows.sort((a, b) => (a.date === b.date ? a.protocol.localeCompare(b.protocol) : b.date.localeCompare(a.date)));
  return rows;
}

/** No merge in this many days and we call the protocol quiet, not dead. */
export const QUIET_DAYS = 45;

export function cadence(protocolData, rows, today) {
  return Object.entries(protocolData).map(([protocol, meta]) => {
    const mine = rows.filter((r) => r.protocol === protocol);
    const last = mine[0]?.date ?? null;
    return {
      protocol,
      layer: LAYERS[protocol] ?? meta.layer ?? "unmapped",
      source: meta.source ?? "scout",
      scopeNote: meta.scopeNote ?? null,
      maintainers: meta.maintainers,
      repo: meta.repo,
      launched: meta.launchDate,
      observed: mine.length,
      last90: mine.filter((r) => r.age <= 90).length,
      last30: mine.filter((r) => r.age <= 30).length,
      breaking90: mine.filter((r) => r.age <= 90 && r.breaking).length,
      lastMerge: last,
      quietDays: last ? daysBetween(last, today) : null,
      quiet: last === null || daysBetween(last, today) > QUIET_DAYS,
      specChanges90: mine.filter((r) => r.age <= 90 && r.specChange).length,
      releasesInWindow: meta.releasesInWindow ?? null,
      latestRelease: meta.latestRelease ?? null,
      /*
       * A source whose specification kept moving after its last
       * release has unreleased spec changes, and that is readable
       * without computing ancestry on a shallow clone. It is the one
       * release claim this screen is entitled to make.
       */
      specMovedSinceRelease: meta.latestRelease && last
        ? mine.filter((r) => r.specChange && r.date > meta.latestRelease.date).length
        : null,
    };
  }).sort((a, b) => b.last90 - a.last90);
}

/**
 * The diff against last Monday. `previous` is a prior run's snapshot, or
 * null on the first run — and a first run says so rather than reporting
 * 823 merges as this week's news.
 */
export function diffSnapshots(previous, rows) {
  if (!previous) return { first: true, seen: 0, fresh: rows, goneQuiet: [], resumed: [] };
  const seen = new Set(previous.ids ?? []);
  return {
    first: false,
    seen: seen.size,
    fresh: rows.filter((r) => !seen.has(r.id)),
    goneQuiet: [],
    resumed: [],
  };
}

export function cadenceDiff(previous, cadenceRows) {
  if (!previous?.cadence) return { goneQuiet: [], resumed: [] };
  const before = new Map(previous.cadence.map((c) => [c.protocol, c]));
  const goneQuiet = [];
  const resumed = [];
  for (const c of cadenceRows) {
    const was = before.get(c.protocol);
    if (!was) continue;
    if (c.quiet && !was.quiet) goneQuiet.push(c);
    if (!c.quiet && was.quiet) resumed.push(c);
  }
  return { goneQuiet, resumed };
}

/**
 * `firstRunDays` bounds a first run. Without it the first screen reports
 * every merge scout holds as this week's news, which is the same lie in
 * the other direction: 823 rows nobody reads.
 */
export function buildReport({
  protocolData,
  today,
  previous = null,
  source = SCOUT_URL,
  firstRunDays = 7,
  failures = [],
  extraLimits = [],
  rulings = [],
}) {
  const rows = flattenUpdates(protocolData, today);
  const usedSources = new Set(Object.values(protocolData).map((m) => m.source ?? "scout"));
  const cad = cadence(protocolData, rows, today);
  const diff = diffSnapshots(previous, rows);
  Object.assign(diff, cadenceDiff(previous, cad));
  const window = diff.first ? rows.filter((r) => r.age <= firstRunDays) : diff.fresh;
  /*
   * Rulings run AFTER scoring, never instead of it. Every row is still
   * scored on its merits; a standing ruling only decides where it is
   * reported. Score-then-file keeps the bands honest and means lifting
   * a ruling returns its rows to the band they always had.
   */
  const ruled = applyRulings(window, rulings, today);
  const byBand = (band) => ruled.fresh.filter((r) => r.band === band);
  return {
    source,
    ran: today,
    firstRunDays,
    since: previous?.ran ?? null,
    denominator: rows.length,
    protocols: Object.keys(protocolData),
    cadence: cad,
    diff,
    window,
    settled: ruled.settled,
    lapsed: ruled.lapsed,
    proposals: openProposals(rulings, today),
    act: byBand("act"),
    read: byBand("read"),
    log: byBand("log"),
    rows,
    sources: [...usedSources],
    notObserved: [
      ...[...usedSources].flatMap((k) => (SOURCE_LIMITS[k] ?? []).map((line) => `**${k}** — ${line}`)),
      ...failures.map((f) => `**unread** — ${f.source} (${f.url}) could not be read this run: ${f.error}`),
      ...extraLimits,
    ],
  };
}

/** The snapshot the next run diffs against. Small on purpose. */
export function toSnapshot(report) {
  return {
    ran: report.ran,
    source: report.source,
    denominator: report.denominator,
    ids: report.rows.map((r) => r.id),
    cadence: report.cadence,
  };
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function levelCell(r) {
  if (r.breaking) return r.derived ? "**breaking**¹" : "**breaking**";
  if (r.specChange) return "**spec**";
  return r.derived ? `${r.level}¹` : r.level;
}

function refCell(r) {
  return r.pr ? `[#${r.pr}](${r.url})` : `[commit](${r.url})`;
}

function bandTable(rows) {
  if (rows.length === 0) return "_None this run._\n";
  const head = "| Protocol | Ref | Level | Surface | What it does to us |\n| --- | --- | --- | --- | --- |\n";
  const body = rows.map((r) =>
    `| ${r.protocol} | ${refCell(r)} | ${levelCell(r)} | ${r.surfaces.join(", ") || "—"} | ${r.title.replace(/\|/g, "\\|")} |`
  ).join("\n");
  const derived = rows.some((r) => r.derived);
  return `${head}${body}\n${derived ? "\n¹ derived by this script from the commit subject, not declared by the maintainer.\n" : ""}`;
}

export function renderMarkdown(report) {
  const out = [];
  out.push(`# PROTOCOL SCREEN — ${report.ran}`);
  out.push("");
  const sourceLine = report.sources.includes("git")
    ? `Sources: ${report.source} (somebody else's reading) and the layer-3 repositories' own git history (first-hand). Every row re-checkable at its link.`
    : `Source: ${report.source} (somebody else's reading, re-checkable at each PR link).`;
  out.push(sourceLine);
  out.push(report.since
    ? `Window: everything the sources showed that the ${report.since} run had not already seen.`
    : `Window: first run — the last ${report.firstRunDays} days, not the whole backlog.`);
  out.push(`Denominator: ${report.denominator} merges across ${report.protocols.length} protocols (${report.protocols.join(", ")}).`);
  if ((report.settled ?? []).length) {
    out.push(`Of this window, ${report.settled.length} row${report.settled.length === 1 ? "" : "s"} fell under a standing ruling and ${report.act.length + report.read.length + report.log.length} did not.`);
  }
  out.push("");
  out.push("## Cadence");
  out.push("");
  out.push("| Protocol | Layer | Maintainers | Source | 90d | 30d | breaking | spec | last | quiet? |");
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of report.cadence) {
    const spec = c.source === "git" ? String(c.specChanges90) : "—";
    const brk = c.source === "git" ? `${c.breaking90} (undeclared)` : String(c.breaking90);
    out.push(`| ${c.protocol}${c.scopeNote ? " ²" : ""} | ${c.layer} | ${c.maintainers} | ${c.source} | ${c.last90} | ${c.last30} | ${brk} | ${spec} | ${c.lastMerge ?? "none observed"} | ${c.quiet ? `**yes — ${c.quietDays ?? "∞"}d**` : "no"} |`);
  }
  const released = report.cadence.filter((c) => c.latestRelease);
  if (released.length) {
    out.push("");
    out.push("**Releases.** A commit is not a release; implementers adopt tagged versions.");
    out.push("");
    out.push("| Protocol | Releases in window | Latest | Spec commits since it |");
    out.push("| --- | --- | --- | --- |");
    for (const c of released) {
      const pending = c.specMovedSinceRelease;
      out.push(`| ${c.protocol} | ${c.releasesInWindow} | \`${c.latestRelease.tag}\` (${c.latestRelease.date}) | ${pending === null ? "—" : pending} |`);
    }
    out.push("");
    out.push("Ancestry is NOT computed — these clones are shallow. A row is marked released only when a tag points at it by sha (or by MPP's `spec-artifacts-<sha>` naming); everything else reads `unknown`, never `unreleased`.");
  }
  const scoped = report.cadence.filter((c) => c.scopeNote);
  if (scoped.length) {
    out.push("");
    for (const c of scoped) out.push(`² ${c.protocol}: ${c.scopeNote}.`);
  }
  out.push("");
  if (report.diff.goneQuiet.length) {
    out.push(`**Went quiet since last run:** ${report.diff.goneQuiet.map((c) => c.protocol).join(", ")}.`);
    out.push("");
  }
  if (report.diff.resumed.length) {
    out.push(`**Resumed since last run:** ${report.diff.resumed.map((c) => c.protocol).join(", ")}.`);
    out.push("");
  }
  const ruled = renderRulings({
    settled: report.settled ?? [],
    lapsed: report.lapsed ?? [],
    proposals: report.proposals ?? [],
  });
  if (ruled.trim()) {
    out.push(ruled);
  }
  out.push(`## ACT — a consequential change on a surface we have shipped (${report.act.length})`);
  out.push("");
  out.push(bandTable(report.act));
  out.push(`## READ — consequential elsewhere, or payment-shaped on a named surface (${report.read.length})`);
  out.push("");
  out.push(bandTable(report.read));
  out.push(`## LOG — in the denominator, nobody paged (${report.log.length})`);
  out.push("");
  out.push(report.log.length ? `${report.log.length} merges. Full rows in the JSON beside this file.\n` : "_None this run._\n");
  out.push("## What this screen did NOT see");
  out.push("");
  for (const line of report.notObserved) out.push(`- ${line}`);
  out.push("");
  return out.join("\n");
}

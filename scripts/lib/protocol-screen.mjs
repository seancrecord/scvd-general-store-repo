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

export const SCOUT_URL = "https://scout.nekuda.ai/";

/** Protocols scout carries, with the layer each occupies for us. */
export const LAYERS = {
  AP2: "1 authorization",
  ACP: "2 commerce",
  UCP: "2 commerce",
  A2A: "3 agent transport",
  WebMCP: "4 browser runtime",
  WebBotAuth: "5 agent identity",
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
  /\breadability\b|\bwording\b|\btypos?\b|\bspelling\b|\bgrammar\b|\bbump\b|\bupgrade [\w.-]+ to\b|dependency packages|\bdiscord\b|\blink checker\b|\blinter\b|\bformatting\b|stale (issue|example)/i;

export function isHousekeeping(row) {
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
    protocols: ["WebBotAuth", "UCP", "ACP", "A2A", "WebMCP"],
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
    id: "discovery",
    state: "shipped",
    where: ".well-known/x402.json, registry listings, KEEPER_LIST submissions",
    protocols: ["WebBotAuth", "A2A", "UCP", "WebMCP"],
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
 * Three bands, and the middle one is deliberately the widest.
 *
 *  act  — breaking, and it lands on a surface we have SHIPPED. Someone
 *         has to look at our code this week.
 *  read — breaking anywhere, or payment/signature-shaped on any surface
 *         we named. A human reads the impact line and rules.
 *  log  — it happened; it is in the denominator; nobody is paged.
 */
export function scoreRow(row) {
  const surfaces = row.surfaces ?? [];
  if (isHousekeeping(row)) return { band: "log", reasons: ["housekeeping"] };
  const shipped = surfaces.filter((id) => SURFACES.find((s) => s.id === id)?.state === "shipped");
  const core = row.tags.filter((t) => CORE_TAGS.has(t));
  const reasons = [];
  let band = "log";
  if (row.breaking && shipped.length > 0) {
    band = "act";
    reasons.push(`breaking, on shipped surface: ${shipped.join(", ")}`);
  } else if (row.breaking) {
    band = "read";
    reasons.push(surfaces.length ? `breaking, on planned surface: ${surfaces.join(", ")}` : "breaking, no surface matched");
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
      layer: LAYERS[protocol] ?? "unmapped",
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
export function buildReport({ protocolData, today, previous = null, source = SCOUT_URL, firstRunDays = 7 }) {
  const rows = flattenUpdates(protocolData, today);
  const cad = cadence(protocolData, rows, today);
  const diff = diffSnapshots(previous, rows);
  Object.assign(diff, cadenceDiff(previous, cad));
  const window = diff.first ? rows.filter((r) => r.age <= firstRunDays) : diff.fresh;
  const byBand = (band) => window.filter((r) => r.band === band);
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
    act: byBand("act"),
    read: byBand("read"),
    log: byBand("log"),
    rows,
    notObserved: [
      "x402 — our own rail. Scout does not track it; nothing here is evidence about it.",
      "MPP / Tempo — the second wire. Not tracked by scout.",
      "Anything merged and not yet ingested by scout, or merged in a repo scout does not read.",
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

function bandTable(rows) {
  if (rows.length === 0) return "_None this run._\n";
  const head = "| Protocol | PR | Level | Surface | What it does to us |\n| --- | --- | --- | --- | --- |\n";
  return head + rows.map((r) =>
    `| ${r.protocol} | [#${r.pr}](${r.url}) | ${r.breaking ? "**breaking**" : r.level} | ${r.surfaces.join(", ") || "—"} | ${r.title} |`
  ).join("\n") + "\n";
}

export function renderMarkdown(report) {
  const out = [];
  out.push(`# PROTOCOL SCREEN — ${report.ran}`);
  out.push("");
  out.push(`Source: ${report.source} (somebody else's reading, re-checkable at each PR link).`);
  out.push(report.since
    ? `Window: merges scout showed since the ${report.since} run.`
    : `Window: first run — the last ${report.firstRunDays} days, not the whole backlog.`);
  out.push(`Denominator: ${report.denominator} merges across ${report.protocols.length} protocols (${report.protocols.join(", ")}).`);
  out.push("");
  out.push("## Cadence");
  out.push("");
  out.push("| Protocol | Layer | Maintainers | 90d | 30d | breaking 90d | last merge | quiet? |");
  out.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const c of report.cadence) {
    out.push(`| ${c.protocol} | ${c.layer} | ${c.maintainers} | ${c.last90} | ${c.last30} | ${c.breaking90} | ${c.lastMerge ?? "none observed"} | ${c.quiet ? `**yes — ${c.quietDays ?? "∞"}d**` : "no"} |`);
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
  out.push(`## ACT — breaking, on a surface we have shipped (${report.act.length})`);
  out.push("");
  out.push(bandTable(report.act));
  out.push(`## READ — breaking elsewhere, or payment-shaped on a named surface (${report.read.length})`);
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

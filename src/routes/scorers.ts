import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  MISUSE_CLAUSE,
  NEVER_A_RANKING_SENTENCE,
  TWO_SEATS_DATED,
  TWO_SEATS_SENTENCE,
} from "@/store/copy/doctrine";
import CITING_SYSTEMS_FILE from "@/store/citing-systems.json";
import { CITE_HOW } from "@/services/cite";
import { RESULT_CLASS_RULE } from "@/services/reproduce";
import type { HonoEnv } from "@/types";

/**
 * FOR SCORERS AND MARKETPLACES (2026-09-03). A reader drew the
 * ecosystem as three layers — a record, an interpretation, a dispute
 * check — and put this store in the record seat only. The store
 * occupies two of the three: it is the record, and it is the
 * reproducible dispute artifact (the case file, the launch check, the
 * attestations, the conformance desk). It leaves interpretation to
 * others on purpose. This room says so once, and then says exactly
 * how a scorer or a marketplace consumes the evidence without
 * inheriting an opinion: pull, verify, cite, reproduce, re-observe.
 *
 * SEATS, NOT OCCUPANTS. The diagram named vendors. A page here names
 * only the seats; a system that consumes the corpus is listed only
 * from src/store/citing-systems.json, with a dated citation URL, and
 * scripts/citations-check.mjs fetches that URL and fails when the
 * citation disappears. Today the file is empty and the page says so.
 *
 * EVERY CLAIM WITH ITS CHECK (rule 10). Each surface named below
 * carries the check that fails when it stops being true, and
 * test/scorers.spec.ts fetches every one of them.
 */
export const scorersRoutes = new Hono<HonoEnv>();

export interface CitingSystem {
  name: string;
  cites_at: string;
  since: string;
}

function citingSystems(): CitingSystem[] {
  const raw = (CITING_SYSTEMS_FILE as { systems?: unknown }).systems;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is CitingSystem =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as CitingSystem).name === "string" &&
      typeof (entry as CitingSystem).cites_at === "string" &&
      (entry as CitingSystem).cites_at.startsWith("https://") &&
      /^\d{4}-\d{2}-\d{2}$/.test((entry as CitingSystem).since),
  );
}

/** The systems the register names today; empty is the honest state. */
export function namedIntegrations(): CitingSystem[] {
  return citingSystems();
}

export interface ScorerSurface {
  surface: string;
  url: string;
  what: string;
  check: string;
}

/** Surfaces a test can fetch as written: no placeholder in the path. */
export function fetchableSurfaces(base: string): ScorerSurface[] {
  return [...pull(base), ...verify(base), ...reproduce(base), ...reObserve(base)].filter(
    (row) => !row.url.includes("{"),
  );
}

const STANDFIRST = `This store occupies two seats: the record, which is what was observed, signed and dated; and the reproducible dispute artifact, which is a check anyone can run again. It does not score, rank, certify, or adjudicate. ${NEVER_A_RANKING_SENTENCE}`;

const pull = (base: string): ScorerSurface[] => [
  {
    surface: "The corpus index",
    url: `${base}/corpus.json`,
    what: "One snapshot per weekly round of the public x402 discovery list, frozen and signed; the index carries every snapshot and the chain check. CC BY 4.0, with a DOI.",
    check: "The chain check in the index fails if any snapshot's bytes change; the corpus is appended, never edited.",
  },
  {
    surface: "One snapshot",
    url: `${base}/corpus/{n}.json`,
    what: "The exact bytes of one round: every host listed, every host probed, every gap by reason.",
    check: "Its digest is the one the index and the next snapshot commit to.",
  },
  {
    surface: "One host, every round",
    url: `${base}/corpus/host/{host}.json`,
    what: "Every signed round that met a host: probed or gapped, the gap's reason, verdict changes, and the tier with its fraction and its rows.",
    check: "Rounds are counted out of rounds since first sighting; a gap is printed as a gap, never as a zero.",
  },
  {
    surface: "One round",
    url: `${base}/corpus/round/{week}`,
    what: "A round as a page, each host with its verdict and failed checks by name.",
    check: "Derived from the snapshot at read; nothing is stored beside the signed bytes.",
  },
  {
    surface: "What moved since a week",
    url: `${base}/corpus/diff.json?since={week}`,
    what: "Hosts that appeared, disappeared, or changed verdict against a baseline week you name.",
    check: "Always against a named baseline; without one it refuses and lists the weeks it knows.",
  },
  {
    surface: "Every host's tier, alphabetical",
    url: `${base}/corpus/tiers.json`,
    what: "A derived verdict per host by the rule typed once at /criteria, each with its fraction and its rows.",
    check: "Alphabetical by host; nothing orders one host against another, and a test holds it.",
  },
];

const verify = (base: string): ScorerSurface[] => [
  {
    surface: "Anything the store signed",
    url: `${base}/api/verify/{id}`,
    what: "The exact bytes a signature covers, so a stranger can check it offline with their own library.",
    check: "Free whether or not anyone bought the thing; a cited verify URL must resolve and validate, or the citation is wrong.",
  },
  {
    surface: "The signing key, now and before",
    url: `${base}/.well-known/did.json`,
    what: "The key in service today under verificationMethod, and every retired key with the dates it served and its handover, signed by the outgoing key.",
    check: "A retired key is never listed as authorised now; what it signed while in service still verifies against its dates.",
  },
  {
    surface: "The anchored key history",
    url: `${base}/.well-known/anchor-log.json`,
    what: "An append-only hash chain over the key state, each entry timestamped through OpenTimestamps and Bitcoin-backed once confirmed.",
    check: "Recompute the chain from the snapshots; it proves when, never who should have.",
  },
  {
    surface: "A verifier that is not ours to run",
    url: `${base}/developers`,
    what: "x402-verify on npm: zero dependencies, checks any issuer's signed offers and receipts, resolves did:web, reads an anchor log when one is published.",
    check: "Works on this store's artifacts and on its competitors' the same way; nothing about this store is privileged in it.",
  },
];

const reproduce = (base: string): ScorerSurface[] => [
  {
    surface: "Reproduce, as one call",
    url: `${base}/api/look/v1`,
    what: `POST {"url": "...", "since": "2026-W34"}: the live probe set against that week's signed row (or the last probed row without since), classed ${RESULT_CLASS_RULE.map((entry) => entry.class).join(" | ")} by the rule typed once at /criteria#result-class, both sides printed, the failed checks added and cleared named, the row cited by entry URL and digest.`,
    check: "The class is a pure function of the two probes and the battery; the spec fixes a door that moved, a battery that moved, and one that did neither.",
  },
  {
    surface: "The same probe, now",
    url: `${base}/api/preflight/v1`,
    what: "POST {\"url\": \"...\"}: the published battery the weekly round runs, every check by name, free. Compare the class of result — verdict and failed checks — with the signed row.",
    check: "The battery is versioned and every step in the checklist is published as a metric change at /corpus/battery-delta.json, so a mismatch names whether the door or the instrument moved.",
  },
  {
    surface: "The live probe beside the record",
    url: `${base}/api/look/v1`,
    what: "POST {\"url\": \"...\"}: one live probe folded with everything the chain holds about that host, including whether the door answers now the way the last signed round saw it.",
    check: "Two kinds of fact with their denominators; no threshold is drawn.",
  },
];

const reObserve = (base: string): ScorerSurface[] => [
  {
    surface: "What this store got wrong",
    url: `${base}/corrections`,
    what: "Every claim the store published and later found false, dated, with what changed. Corrections are appended; the row they correct keeps its bytes.",
    check: "A correction never overwrites; the chain check would fail if one did.",
  },
  {
    surface: "The rule the tiers come from",
    url: `${base}/criteria`,
    what: "The tier rule typed once, the battery change notes, and the doctrine with its dates.",
    check: "Every rendering of a tier prints the fraction it came from and links the rows.",
  },
];

const CITE = {
  how: `${CITE_HOW} Every row surface prints the citation for you: \`cite\` on /corpus/host/{host}.json and /corpus/{n}.json, and on the look's reproduce block. Do not restate the observation; link it. A restated row is a claim of yours, and the reader cannot check it.`,
  attribution: "CC BY 4.0: attribution is the row's URL. Nothing more is asked.",
  check: "Every verify URL and corpus URL this page names is fetched by the suite and must answer; a citation that does not resolve is a broken citation, not a broken corpus.",
};

const RE_OBSERVE = {
  how: "If a door behaves differently from a signed row, run a fresh observation and keep both. The difference is time, not error: each row is one dated moment, and the cadence between rounds is weekly.",
  ours: "When the store itself was wrong, the correction is appended at /corrections beside the row, and the row keeps its bytes.",
};

/**
 * START HERE (2026-09-04): the five steps as three commands each, for
 * a shell, for the CLI, and for an agent holding the MCP server. The
 * same doors, three grips; nothing here needs an account or a key.
 */
const START_HERE = (base: string) => ({
  shell: [
    `curl -s ${base}/corpus.json | jq '.distribution'`,
    `curl -s ${base}/corpus/host/example.com.json | jq '.cite'`,
    `curl -s -X POST ${base}/api/look/v1 -H 'content-type: application/json' -d '{"url":"https://example.com/api/thing","since":"2026-W34"}' | jq '.reproduce'`,
  ],
  cli: [
    "npx scvd corpus --since 2026-W34",
    "npx scvd cite example.com",
    "npx scvd reproduce https://example.com/api/thing --since 2026-W34",
  ],
  mcp: [
    `read_store_guide, then look_at_door {"url": "https://example.com/api/thing", "since": "2026-W34"}`,
    `the corpus is plain GET: ${base}/corpus.json, ${base}/corpus/host/{host}.json`,
    `verify anything cited: ${base}/api/verify/{id}, or npx x402-verify`,
  ],
  note: "Three grips on the same doors. No account, no key, no wallet; nothing here can spend.",
});

const ENABLES = [
  "A scorer maps observations to scores by a rule of its own, and cites the rows it read.",
  "A marketplace gates a listing on a reproducible check — the preflight, the passport tier with its fraction — rather than on a claim.",
  "An operator attaches a statement to the record — the operator's statement, the case file — without anything overwriting the observation it answers.",
];

function integrationsBlock(base: string) {
  const systems = namedIntegrations();
  return {
    seats_not_occupants: "This page names seats, not occupants.",
    as_of: new Date().toISOString().slice(0, 10),
    systems: [...systems].sort((a, b) => a.name.localeCompare(b.name)).map((entry) => ({ ...entry })),
    none_today: systems.length === 0 ? "No system is listed today." : undefined,
    how_a_system_gets_listed: `Five facts, none a judgment: a public page of theirs, reachable by a plain unauthenticated GET; citing a specific row — a verify URL (${base}/api/verify/{id}), a corpus entry or host URL (${base}/corpus/...), or the cite shape — not merely a link to the store's front door; live when the entry is written and readable by the watch; not this store, a mirror of its text, or a page it operates; entered in src/store/citing-systems.json as name, citing URL and the date first seen, nothing else. Not required: permission, reciprocity, a partnership, any view on their quality, or payment. Listing is not endorsement in either direction, and the list is alphabetical by name. Ruled 2026-09-04.`,
    check: "scripts/citations-check.mjs fetches every listed citing URL, looks for a verify or corpus URL of this store on it, and fails when the citation is gone. The page renders the same file the script reads.",
  };
}

scorersRoutes.get("/scorers", (c) => {
  const base = c.env.STORE_BASE_URL;
  const integrations = integrationsBlock(base);
  if (!wantsHtml(c.req.header("Accept"))) {
    return c.json({
      title: "For scorers and marketplaces",
      seats: { dated: TWO_SEATS_DATED, sentence: TWO_SEATS_SENTENCE },
      summary: STANDFIRST,
      start_here: START_HERE(base),
      pull: pull(base),
      verify: verify(base),
      cite: CITE,
      reproduce: reproduce(base),
      re_observe: { ...RE_OBSERVE, surfaces: reObserve(base) },
      enables: ENABLES,
      misuse: MISUSE_CLAUSE,
      named_integrations: integrations,
      license: "https://creativecommons.org/licenses/by/4.0/",
      the_record: `${base}/corpus.json`,
      the_dispute_artifacts: [`${base}/menu/the_case_file`, `${base}/menu/launch_check`, `${base}/menu/settlement_attestation`, `${base}/api/conformance/v1`],
    });
  }
  const rows = (list: ScorerSurface[]) =>
    `<ul class="menu-desc">${list
      .map(
        (row) =>
          `<li><strong>${escapeHtml(row.surface)}</strong> — <code>${escapeHtml(row.url.replace(base, ""))}</code><br>${escapeHtml(row.what)}<br><em>Check: ${escapeHtml(row.check)}</em></li>`,
      )
      .join("")}</ul>`;
  const systems = integrations.systems;
  return c.html(
    renderSimplePage({
      title: "For scorers and marketplaces",
      description:
        "Two seats: the record, and the reproducible dispute artifact. How to pull, verify, cite, reproduce and re-observe this store's evidence without inheriting an opinion. Names seats, not occupants.",
      path: "/scorers",
      bodyHtml: `<section>
        <p class="menu-desc"><strong>${escapeHtml(TWO_SEATS_SENTENCE)}</strong></p>
        <p class="menu-desc">${escapeHtml(STANDFIRST)}</p>
        <p class="menu-meta">Dated ${escapeHtml(TWO_SEATS_DATED)}. The doctrine and its dates: <a href="/criteria">/criteria</a>.</p>
      </section>
      <section>
        <h2>Start here</h2>
        <p class="menu-desc">${escapeHtml(START_HERE(base).note)}</p>
        <p class="menu-desc"><strong>A shell</strong></p>
        <pre class="menu-meta">${START_HERE(base).shell.map((line) => escapeHtml(line)).join("\n")}</pre>
        <p class="menu-desc"><strong>The command line</strong> (<a href="/developers">npm: scvd</a>)</p>
        <pre class="menu-meta">${START_HERE(base).cli.map((line) => escapeHtml(line)).join("\n")}</pre>
        <p class="menu-desc"><strong>An agent on the MCP server</strong> (<code>${escapeHtml(base)}/mcp</code>)</p>
        <pre class="menu-meta">${START_HERE(base).mcp.map((line) => escapeHtml(line)).join("\n")}</pre>
      </section>
      <section>
        <h2>Pull</h2>
        ${rows(pull(base))}
      </section>
      <section>
        <h2>Verify</h2>
        ${rows(verify(base))}
      </section>
      <section>
        <h2>Cite</h2>
        <p class="menu-desc">${escapeHtml(CITE.how)}</p>
        <p class="menu-desc">${escapeHtml(CITE.attribution)}</p>
        <p class="menu-desc"><em>Check: ${escapeHtml(CITE.check)}</em></p>
      </section>
      <section>
        <h2>Reproduce</h2>
        ${rows(reproduce(base))}
      </section>
      <section>
        <h2>Re-observe</h2>
        <p class="menu-desc">${escapeHtml(RE_OBSERVE.how)}</p>
        <p class="menu-desc">${escapeHtml(RE_OBSERVE.ours)}</p>
        ${rows(reObserve(base))}
      </section>
      <section>
        <h2>What this enables</h2>
        <ul class="menu-desc">${ENABLES.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
        <p class="menu-desc"><strong>${escapeHtml(MISUSE_CLAUSE)}</strong></p>
      </section>
      <section>
        <h2>Named integrations</h2>
        <p class="menu-desc"><strong>${escapeHtml(integrations.seats_not_occupants)}</strong> ${
          systems.length === 0
            ? `As of ${escapeHtml(integrations.as_of)}, no system is listed.`
            : `As of ${escapeHtml(integrations.as_of)}, the following systems cite this corpus:`
        }</p>
        ${
          systems.length === 0
            ? ""
            : `<ul class="menu-desc">${systems
                .map(
                  (entry) =>
                    `<li><strong>${escapeHtml(entry.name)}</strong> — <a href="${escapeHtml(entry.cites_at)}" rel="nofollow">${escapeHtml(entry.cites_at)}</a>, since ${escapeHtml(entry.since)}</li>`,
                )
                .join("")}</ul>`
        }
        <p class="menu-desc">${escapeHtml(integrations.how_a_system_gets_listed)}</p>
        <p class="menu-meta">Check: ${escapeHtml(integrations.check)}</p>
      </section>
      <section>
        <p class="menu-meta">The record: <a href="/corpus.json"><code>/corpus.json</code></a>. The dispute artifacts on the shelf: <a href="/menu/the_case_file">the case file</a>, <a href="/menu/launch_check">the launch check</a>, <a href="/menu/settlement_attestation">the settlement attestation</a>; the free desk for any issuer's signed offers and receipts at <code>/api/conformance/v1</code>. For operators: <a href="/operators">/operators</a>. JSON twin of this page at the same URL with <code>Accept: application/json</code>.</p>
      </section>`,
    }),
  );
});

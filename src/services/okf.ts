import { AGING_DAYS } from "@/services/passport";
import { buildFreshSet, type FreshSet, type FreshSetRow } from "@/services/fresh-set";
import { listCorpus } from "@/services/corpus";
import { PREFLIGHT_BATTERY_NEXT } from "@/services/preflight";
import type { Env } from "@/types";

/**
 * THE EVIDENCE LAYER AS AN OKF BUNDLE (Open Knowledge Format v0.2,
 * Google Cloud, 2026-06).
 *
 * OKF formalizes the "LLM wiki": a directory of markdown files, each
 * one concept, YAML frontmatter for the structured fields, ordinary
 * markdown links between them. Conformance is three rules — every
 * non-reserved .md parses its frontmatter, every frontmatter carries a
 * non-empty `type`, and the reserved files (index.md, log.md) keep
 * their shape. Everything past that is progressively opt-in.
 *
 * WHY THIS STORE, SPECIFICALLY. The optional trust family is the part
 * that reads like it was drafted for this shop: `generated {by, at}`,
 * `verified []`, `stale_after`, `status`, and an actor convention that
 * distinguishes `human:<id>` from `<producer>/<version>`. A consumer
 * derives three trust tiers from `verified` alone — unverified,
 * machine-confirmed, human-reviewed. The census is machine-confirmed
 * and says so; nothing here claims a human looked, because on the
 * census nobody did. That is rule 43 in somebody else's vocabulary.
 *
 * THE RULE THIS FILE IS HELD TO. Derived, never authored. The store
 * already publishes llms.txt, agents.md, skill.md, openapi.json, four
 * well-known documents and an MCP server, and the surface that went 24
 * days stale was the one a human had to remember to touch. A bundle
 * generated from the signed round cannot drift, because there is
 * nothing to forget. No file here is written by hand.
 */

export const OKF_VERSION = "0.2";

/**
 * The census instrument, in OKF's `<producer>/<version>` actor form.
 *
 * DERIVED, 2026-08-28 (the instrument audit). This was the typed
 * literal "scvd-census/preflight-v1" — stamped on every generated
 * and verified block two days after the census moved to v2, the
 * exact label defect the 2026-08-26 correction recorded for the
 * census rows themselves. A typed battery name is a claim with a
 * timer on it; this one now moves when the census's does.
 */
export const OKF_OBSERVER = `scvd-census/${PREFLIGHT_BATTERY_NEXT}`;

/** A host that could name a path. Anything else never becomes a file. */
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export function isBundleHost(host: string): boolean {
  return (
    host.length > 0 && host.length <= 253 && HOST_RE.test(host.toLowerCase())
  );
}

/**
 * YAML scalars, always double-quoted. A host or a verdict could not
 * plausibly break a bare scalar, but "could not plausibly" is how
 * every injection starts: quote everything, escape the two characters
 * that end a double-quoted YAML string, and the emitter stays correct
 * for input nobody predicted.
 */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(values: readonly string[]): string {
  return `[${values.map(yamlString).join(", ")}]`;
}

/** The date past which an agent should stop believing an observation. */
export function staleAfter(observedAt: string): string {
  return new Date(
    new Date(observedAt).getTime() + AGING_DAYS * 86_400_000,
  ).toISOString();
}

export interface OkfConcept {
  /** Bundle-relative path, always leading-slash (the recommended form). */
  path: string;
  frontmatter: string;
  body: string;
}

export function renderConcept(concept: OkfConcept): string {
  return `---\n${concept.frontmatter}\n---\n\n${concept.body}\n`;
}

/* ------------------------------------------------------------------ */
/* Concepts                                                            */
/* ------------------------------------------------------------------ */

function hostConcept(row: FreshSetRow, set: FreshSet): OkfConcept {
  const rails = row.rails ?? [];
  const tags = ["x402", "endpoint", ...rails];
  const ask =
    row.min_usdc !== undefined ? `$${row.min_usdc} USDC` : "an amount its 402 did not price in USDC";
  const frontmatter = [
    `type: ${yamlString("x402 Endpoint")}`,
    `title: ${yamlString(row.host)}`,
    `description: ${yamlString(
      `x402 door that answered a spec-conformant payment challenge in the ${set.week} census.`,
    )}`,
    `resource: ${yamlString(row.url)}`,
    `tags: ${yamlList(tags)}`,
    `status: ${yamlString("stable")}`,
    `stale_after: ${yamlString(staleAfter(set.observed_at))}`,
    /*
     * The ROW's cited battery where the row states one — a host
     * concept must name the criteria that produced ITS verdict, not
     * whatever the census runs today. "battery-unstated" rather than
     * a guess when the row predates the field (derive or refuse).
     */
    "generated:",
    `  by: ${yamlString(row.battery !== "unstated" ? `scvd-census/${row.battery}` : "scvd-census/battery-unstated")}`,
    `  at: ${yamlString(set.observed_at)}`,
    "verified:",
    `  - by: ${yamlString(row.battery !== "unstated" ? `scvd-census/${row.battery}` : "scvd-census/battery-unstated")}`,
    `    at: ${yamlString(set.observed_at)}`,
    "sources:",
    `  - id: ${yamlString("history")}`,
    `    resource: ${yamlString(row.history_url)}`,
    `  - id: ${yamlString("corpus")}`,
    `    resource: ${yamlString(set.evidence.corpus_url)}`,
  ].join("\n");

  const body = [
    `# ${row.host}`,
    "",
    `On ${set.observed_at} this store walked \`${row.url}\` and it answered a`,
    `payment challenge that parsed against the published preflight battery.`,
    rails.length
      ? `The door's own 402 offered ${rails.join(", ")}, asking ${ask}.`
      : `The door's 402 named no rail this instrument recognized.`,
    "",
    "## What this is not",
    "",
    set.what_this_is_not,
    "",
    "## Checking it yourself",
    "",
    `Every observation behind this concept is signed and free to read forever:`,
    `[dated history](${row.history_url}), and the [signed round](${set.evidence.corpus_url})`,
    `it replays from. This concept is machine-confirmed — no human reviewed it,`,
    `and \`verified\` says so rather than implying otherwise.`,
    "",
    `See also: [the criteria](/criteria.md), [the fresh set](/fresh-set.md), [the store](/store.md).`,
  ].join("\n");

  return { path: `/host/${row.host}.md`, frontmatter, body };
}

function criteriaConcept(base: string, observedAt: string | null): OkfConcept {
  const frontmatter = [
    `type: ${yamlString("Conformance Criteria")}`,
    `title: ${yamlString("The preflight battery")}`,
    `description: ${yamlString(
      "The published checks every observation in this bundle was made against.",
    )}`,
    `resource: ${yamlString(`${base}/api/preflight/v1`)}`,
    `tags: ${yamlList(["x402", "conformance", "criteria"])}`,
    `status: ${yamlString("stable")}`,
    ...(observedAt
      ? ["generated:", `  by: ${yamlString(OKF_OBSERVER)}`, `  at: ${yamlString(observedAt)}`]
      : []),
  ].join("\n");
  const body = [
    "# The preflight battery",
    "",
    "Every host concept in this bundle was judged against one published set of",
    "checks: the 402 shape, the PAYMENT-REQUIRED header, the `accepts` fields,",
    "and the structural check on any signed offers. The criteria are served as",
    `machine-readable JSON at [${base}/api/preflight/v1](${base}/api/preflight/v1)`,
    "and the same battery runs free, for anyone, against any door.",
    "",
    "The looking is free and always will be. What this store sells is the",
    "signed artifact — the version somebody else has to believe.",
  ].join("\n");
  return { path: "/criteria.md", frontmatter, body };
}

function freshSetConcept(base: string, set: FreshSet): OkfConcept {
  const frontmatter = [
    `type: ${yamlString("Dataset")}`,
    `title: ${yamlString("The fresh set")}`,
    `description: ${yamlString(
      "x402 doors that answered a conformant challenge in the latest weekly census.",
    )}`,
    `resource: ${yamlString(`${base}/fresh-set`)}`,
    `tags: ${yamlList(["x402", "dataset", "routing", "census"])}`,
    `status: ${yamlString("stable")}`,
    `stale_after: ${yamlString(staleAfter(set.observed_at))}`,
    "generated:",
    `  by: ${yamlString(OKF_OBSERVER)}`,
    `  at: ${yamlString(set.observed_at)}`,
    "verified:",
    `  - by: ${yamlString(OKF_OBSERVER)}`,
    `    at: ${yamlString(set.observed_at)}`,
  ].join("\n");
  const body = [
    "# The fresh set",
    "",
    set.what_this_is,
    "",
    "## This week's arithmetic",
    "",
    `* Listed resources walked: ${set.aggregates.listed_resources}`,
    `* Probed: ${set.aggregates.probed}`,
    `* Answered conformantly: ${set.aggregates.ready}`,
    `* Answered, but not conformantly: ${set.aggregates.not_ready}`,
    `* Unreachable: ${set.aggregates.unreachable}`,
    "",
    "Failing doors are counted here and named nowhere. A row is a fact about",
    "one dated moment; nothing accumulates into a judgment on an operator.",
    "",
    `The whole set as JSON: [${base}/fresh-set](${base}/fresh-set) (CC BY 4.0).`,
  ].join("\n");
  return { path: "/fresh-set.md", frontmatter, body };
}

function storeConcept(base: string, observedAt: string | null): OkfConcept {
  const frontmatter = [
    `type: ${yamlString("Organization")}`,
    `title: ${yamlString("Sean-Claude Van Damme's General Store")}`,
    `description: ${yamlString(
      "Free x402 conformance checking, signed settlement attestation, and a Bitcoin-anchored corpus of dated observations.",
    )}`,
    `resource: ${yamlString(base)}`,
    `tags: ${yamlList(["x402", "trust", "attestation", "agent-commerce"])}`,
    `status: ${yamlString("stable")}`,
    ...(observedAt
      ? ["generated:", `  by: ${yamlString(OKF_OBSERVER)}`, `  at: ${yamlString(observedAt)}`]
      : []),
  ].join("\n");
  const body = [
    "# Sean-Claude Van Damme's General Store",
    "",
    "An evidence observatory for agentic commerce. The store walks the public x402",
    "directory every week, checks each door against a published battery, and",
    "signs what it saw on the date it saw it — including the doors that failed",
    "and the rounds the watchman missed.",
    "",
    "## When an agent should reach for this",
    "",
    "* Before paying an unfamiliar x402 endpoint — check it answers correctly.",
    "* When choosing between doors — the fresh set carries rails and asks.",
    "* After settling — get a signed attestation of the payment.",
    "* To prove your own door works — buy the artifact somebody else believes.",
    "",
    "## What it is not",
    "",
    "Not an escrow, not a guarantor, not a dispute court, no chargebacks, no",
    "third-party audit. One operator, one live signing key. Treat artifacts as",
    "evidence to verify, never as institutional assurance.",
    "",
    `Full agent instructions: [${base}/llms.txt](${base}/llms.txt).`,
  ].join("\n");
  return { path: "/store.md", frontmatter, body };
}

/* ------------------------------------------------------------------ */
/* Reserved files                                                      */
/* ------------------------------------------------------------------ */

function indexMd(set: FreshSet | null, hosts: readonly FreshSetRow[]): string {
  const lines = [
    "---",
    `okf_version: ${yamlString(OKF_VERSION)}`,
    `type: ${yamlString("Bundle Index")}`,
    `title: ${yamlString("scvd.store evidence bundle")}`,
    `description: ${yamlString(
      set
        ? `Dated, signed observations of the public x402 economy, ${set.week}.`
        : "Dated, signed observations of the public x402 economy.",
    )}`,
    "---",
    "",
    "# scvd.store evidence bundle",
    "",
    ...(set
      ? [
          `Signed observations from the ${set.week} census, taken ${set.observed_at}.`,
          "Every concept here is machine-confirmed and carries the evidence that",
          "backs it. Nothing in this bundle is a ranking, and no figure in it lacks its denominator.",
        ]
      : [
          "No census round has been frozen yet, so this bundle carries the store",
          "and its criteria and no endpoint concepts. An empty round is published",
          "as empty rather than withheld — a bundle that disappears when there is",
          "nothing to say is indistinguishable from one that is broken.",
        ]),
    "",
    "# The store",
    "",
    "* [Sean-Claude Van Damme's General Store](store.md) - what this shop is and when an agent should reach for it.",
    "* [The preflight battery](criteria.md) - the published checks every observation was made against.",
    "* [The fresh set](fresh-set.md) - the doors that answered conformantly this week.",
    "",
    "# Endpoints observed",
    "",
  ];
  for (const row of hosts) {
    lines.push(
      `* [${row.host}](host/${row.host}.md) - answered a conformant challenge on ${(set?.observed_at ?? "").slice(0, 10)}.`,
    );
  }
  if (hosts.length === 0) {
    lines.push(
      set
        ? "* No door answered conformantly in the latest round."
        : "* None yet - the first census round has not been frozen.",
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

interface LogWeek {
  date: string;
  week: string;
  ready: number;
  probed: number;
  sequence: number;
}

function logMd(weeks: readonly LogWeek[]): string {
  const lines = [
    "---",
    `type: ${yamlString("Bundle Log")}`,
    `title: ${yamlString("Census history")}`,
    "---",
    "",
    "# Census history",
    "",
    "Every weekly round this bundle has frozen, newest first. Each entry names",
    "the signed corpus sequence it came from.",
    "",
  ];
  for (const week of weeks) {
    lines.push(`## ${week.date}`);
    lines.push(
      `* **Update**: ${week.week} census frozen at corpus sequence ${week.sequence} - ${week.ready} of ${week.probed} probed doors answered a conformant challenge.`,
    );
    lines.push("");
  }
  if (weeks.length === 0) {
    lines.push("## Pending");
    lines.push("* **Creation**: no census round has been frozen yet.");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/* ------------------------------------------------------------------ */
/* The bundle                                                          */
/* ------------------------------------------------------------------ */

export interface OkfBundle {
  /** Every file in the bundle, keyed by bundle-relative path. */
  files: Map<string, string>;
  /** Null before the first round is frozen; the bundle still serves. */
  week: string | null;
  observed_at: string | null;
}

/**
 * ALWAYS A BUNDLE, EVEN WITH NOTHING IN IT (caught 2026-08-22 by the
 * portal's own guard, which fetches every door it advertises and
 * refuses a 404). A knowledge bundle that vanishes when the data does
 * is indistinguishable from a broken one, and it would have shipped a
 * dead link on /developers on any week the census had not yet run.
 * The empty round is published as empty — the same rule the watchman's
 * missed hours ride under.
 */
export async function buildOkfBundle(env: Env): Promise<OkfBundle> {
  const set = await buildFreshSet(env).catch(() => null);
  const base = env.STORE_BASE_URL;
  const hosts = (set?.rows ?? []).filter((row) => isBundleHost(row.host));

  const files = new Map<string, string>();
  files.set("/index.md", indexMd(set, hosts));

  const corpus = await listCorpus(env).catch(() => []);
  const weeks: LogWeek[] = corpus
    .map((record) => {
      const probed = record.snapshot.round.hosts.filter(
        (host) => host.verdict !== "not_probed",
      );
      return {
        date: record.snapshot.taken_at.slice(0, 10),
        week: record.snapshot.week,
        ready: probed.filter((host) => host.verdict === "ready").length,
        probed: probed.length,
        sequence: record.snapshot.sequence,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  files.set("/log.md", logMd(weeks));

  for (const concept of [
    storeConcept(base, set?.observed_at ?? null),
    criteriaConcept(base, set?.observed_at ?? null),
    ...(set ? [freshSetConcept(base, set)] : []),
    ...(set ? hosts.map((row) => hostConcept(row, set)) : []),
  ]) {
    files.set(concept.path, renderConcept(concept));
  }

  return {
    files,
    week: set?.week ?? null,
    observed_at: set?.observed_at ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Conformance                                                         */
/* ------------------------------------------------------------------ */

/**
 * OUR OWN CHECK, BECAUSE THAT IS WHAT THIS SHOP IS.
 *
 * The store sells conformance checking against published criteria. It
 * would be a strange shop that took a third-party linter's word for
 * whether its own bundle conforms. These are the v0.2 conformance
 * criteria, read off the spec and enforced in the suite.
 */
export interface OkfViolation {
  path: string;
  problem: string;
}

const RESERVED = new Set(["index.md", "log.md"]);

export function validateOkfBundle(
  files: ReadonlyMap<string, string>,
): OkfViolation[] {
  const violations: OkfViolation[] = [];
  for (const [path, content] of files) {
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!content.startsWith("---\n")) {
      violations.push({ path, problem: "no YAML frontmatter block" });
      continue;
    }
    const end = content.indexOf("\n---", 4);
    if (end === -1) {
      violations.push({ path, problem: "frontmatter block never closes" });
      continue;
    }
    const frontmatter = content.slice(4, end);
    if (RESERVED.has(name)) {
      // Reserved files carry structure, not a concept type.
      if (name === "log.md") {
        const dated = /^## \d{4}-\d{2}-\d{2}$/m.test(content);
        const pending = /^## Pending$/m.test(content);
        if (!dated && !pending) {
          violations.push({ path, problem: "log.md has no ISO date heading" });
        }
      }
      continue;
    }
    const type = /^type:\s*(.+)$/m.exec(frontmatter);
    const value = (type?.[1] ?? "").trim().replace(/^"|"$/g, "").trim();
    if (!value) {
      violations.push({ path, problem: "frontmatter has no non-empty `type`" });
    }
  }
  return violations;
}

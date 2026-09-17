import { escapeHtml } from "@/lib/sanitize";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import type { CardContent } from "@/lib/pixel-card";
import { CHIP_LAYOUT } from "@/services/badge-svg";
import type { SubjectRound } from "@/services/subject-history";
import {
  DECISION_MEANING,
  DECISION_RULE,
  decisionOf,
  type AgentDecision,
  type EndpointPassport,
} from "@/services/passport";

/**
 * THE PASSPORT CARD — one passport, rendered, wherever it is shown.
 *
 * Extracted from /passport on 2026-09-01, and the extraction is the
 * point rather than tidiness. The 2026-08-31 read found the passport
 * landing rendering none of the summary block it had been signing;
 * the fix went in on /passport, and /profiles — the $21 STANDING page,
 * the one URL an operator hands to a counterparty — kept showing a
 * bare freshness word. The free page had become more legible than the
 * paid one.
 *
 * That is correction #114's shape a second time: two surfaces over the
 * same evidence, each deriving it separately, drifting apart the
 * moment one is improved. The answer both times is one code path, so
 * this module is the ONLY place a passport becomes HTML. A surface
 * that wants to show a passport calls `passportCard`; there is
 * nowhere else to get a worse version of it.
 */

/**
 * THE GRADE BESIDE EVERY FIGURE (2026-09-17). Read off an outside
 * observatory's page, where every number wears one of three marks —
 * observed, derived, reported — so a reader never mistakes a
 * computation for a measurement. This store already keeps the line
 * in its rules (a derived number is never quoted as a measurement)
 * and in its field names; the mark puts it where the eye lands.
 *
 * ○ is "reported" in a narrower sense than theirs: nothing on a
 * passport is copied from a directory. The door's own 402 declared
 * its rails and its ask, and the probe wrote down what it declared.
 * That is a claim the door made, captured by us, and it is graded
 * as the door's claim rather than as our finding.
 */
export type Basis = "observed" | "derived" | "reported";
export const BASIS_MARK: Record<Basis, string> = { observed: "●", derived: "◐", reported: "○" };
export const BASIS_LEGEND =
  "● observed by the probe · ◐ derived from observed rows by a published rule · ○ reported by the door in its own 402, as captured";

function basis(kind: Basis): string {
  return `<span class="basis" data-basis="${kind}" title="${kind}">${BASIS_MARK[kind]}</span>`;
}

/** Whole days between two ISO instants, floored; null when either is missing. */
function daysBetween(from: string | null | undefined, to: string): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

function ago(days: number | null): string {
  if (days === null) return "never";
  if (days === 0) return "today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function priceOf(s: EndpointPassport["payload"]["summary"]): string | null {
  if (s.min_usdc === undefined && s.max_usdc === undefined) return null;
  if (s.min_usdc !== undefined && s.min_usdc === s.max_usdc) return `${s.min_usdc} USDC`;
  return `${s.min_usdc ?? "?"}–${s.max_usdc ?? "?"} USDC`;
}

/**
 * THE BECAUSE-LINE (2026-09-17). A verdict never appears alone on the
 * outside page this was read from: "allow — because answers ●, 20
 * tools legible ●, no drift in 7 probes ●; not yet checked: truth".
 * One line, each clause wearing its grade, ending with what was not
 * checked. Every clause below is read off the signed summary, so the
 * line cannot claim what the passport does not; the same text rides
 * the JSON as `because`, outside the signature like the colophon.
 */
export interface BecauseClause {
  text: string;
  basis: Basis;
}

export function becauseClauses(passport: EndpointPassport): BecauseClause[] {
  const s = passport.payload.summary;
  const tier = passport.payload.tier;
  const clauses: BecauseClause[] = [];
  if (s.verdict === "ready") {
    clauses.push({ text: "answered 402 and every check in the battery passed", basis: "observed" });
  } else if (s.verdict) {
    clauses.push({
      text: s.failed.length === 0 ? `latest verdict ${s.verdict}` : `failed ${s.failed.join(", ")}`,
      basis: "observed",
    });
  } else {
    clauses.push({ text: "no verdict on record", basis: "observed" });
  }
  if (s.networks?.length) clauses.push({ text: `rails ${s.networks.join(", ")}`, basis: "reported" });
  const price = priceOf(s);
  if (price) clauses.push({ text: `asks ${price}`, basis: "reported" });
  if (tier) {
    clauses.push({
      /* "tier observed" rather than "observed:" — the tier vocabulary
       * reuses the basis word, and a clause that opened with it read
       * as a second observation beside the real one. */
      text: `tier ${tier.tier} — ready ${tier.fraction.ready} of ${tier.fraction.rounds} rounds, ${tier.fraction.weeks}${tier.coverage_suspect ? " (our coverage suspect in the window)" : ""}`,
      basis: "derived",
    });
  }
  clauses.push({
    text: s.observed_at
      ? `observed ${ago(daysBetween(s.observed_at, passport.payload.issued_at))}, ${s.status} until ${s.valid_until.slice(0, 10)}`
      : `never observed, ${s.status}`,
    basis: "derived",
  });
  return clauses;
}

export function becauseText(passport: EndpointPassport): string {
  const s = passport.payload.summary;
  const clauses = becauseClauses(passport)
    .map((clause) => `${clause.text} ${BASIS_MARK[clause.basis]}`)
    .join("; ");
  const gaps =
    s.not_observed.length === 0
      ? "the cited evidence declares no gaps"
      : `${s.not_observed.length} thing${s.not_observed.length === 1 ? "" : "s"} not observed`;
  return `${s.decision} — because ${clauses}. Not observed: ${gaps}; never delivery, never anything after payment.`;
}

function becauseHtml(passport: EndpointPassport): string {
  const s = passport.payload.summary;
  const clauses = becauseClauses(passport)
    .map((clause) => `<span class="clause">${escapeHtml(clause.text)}&nbsp;${basis(clause.basis)}</span>`)
    .join("<span class=\"sep\">;</span> ");
  const gaps =
    s.not_observed.length === 0
      ? "the cited evidence declares no gaps"
      : `${s.not_observed.length} thing${s.not_observed.length === 1 ? "" : "s"} not observed, listed below`;
  return `<p class="because"><strong>because</strong> ${clauses}.
    <span class="not-observed">Not observed: ${escapeHtml(gaps)}; never delivery, never anything after payment.</span></p>`;
}

/**
 * THE DECISION, BIG. One word, the because-line under it, and the
 * status it was derived from with a link to the rule rather than the
 * rule pasted — the per-host page had been re-explaining the decision
 * arithmetic on every host, and the landing already owns it.
 */
export function decisionBlock(passport: EndpointPassport): string {
  const s = passport.payload.summary;
  return `<section class="decision" data-decision="${escapeHtml(s.decision)}">
    <p class="decision-word">${escapeHtml(s.decision)}</p>
    ${becauseHtml(passport)}
    <p class="menu-meta">${escapeHtml(DECISION_MEANING[s.decision])}
    Derived from <code>status: ${escapeHtml(s.status)}</code> ${basis("derived")} ·
    <a href="/passport#decision">the rule</a> · ${escapeHtml(BASIS_LEGEND)}</p>
  </section>`;
}

/**
 * THE GLANCE (2026-09-17): the five figures a hurried reader came for,
 * above every paragraph. The outside page opens with four cells —
 * verdict, cluster, answers, tools served — before a word of prose;
 * this page opened with the observer sentence and the issue time and
 * put the decision word under them. Every cell is a summary field; a
 * cell the passport does not carry is omitted, never shown blank.
 */
function glanceStrip(passport: EndpointPassport): string {
  const p = passport.payload;
  const s = p.summary;
  const cells: { key: string; label: string; value: string; basis: Basis }[] = [
    { key: "decision", label: "decision", value: s.decision, basis: "derived" },
  ];
  if (p.tier) {
    cells.push({ key: "tier", label: "tier", value: `${p.tier.tier} · ${p.tier.fraction.ready} of ${p.tier.fraction.rounds}`, basis: "derived" });
  }
  if (s.networks?.length) {
    cells.push({ key: "rails", label: s.networks.length === 1 ? "rail" : "rails", value: s.networks.join(" · "), basis: "reported" });
  }
  const price = priceOf(s);
  if (price) cells.push({ key: "price", label: "asks", value: price, basis: "reported" });
  cells.push({
    key: "observed",
    label: "observed",
    value: ago(daysBetween(s.observed_at, p.issued_at)),
    basis: "observed",
  });
  return `<div class="glance" role="list">${cells
    .map(
      (cell) => `<div class="cell" role="listitem" data-glance="${escapeHtml(cell.key)}"${cell.key === "decision" ? ` data-decision="${escapeHtml(s.decision)}"` : ""}>
      <span class="value">${escapeHtml(cell.value)}</span>
      <span class="label">${escapeHtml(cell.label)} ${basis(cell.basis)}</span>
    </div>`,
    )
    .join("")}</div>`;
}

/**
 * THE PROBE STRIP (2026-09-17): one tick per round on the chain, oldest
 * to newest, with the missed weeks drawn as gaps rather than left out.
 * The outside page draws a strip of the probes it MADE and says under
 * it that a gap in its cadence is not evidence about the server; this
 * one can draw the gap itself, because the replay names every round
 * and the reason each unwalked one was missed. Shape carries the
 * outcome as well as colour — filled for ready, hatched for not ready,
 * hollow for unreachable, dotted for a gap — and the table under it is
 * the same rows in full, so nothing here is colour alone.
 */
export type TickOutcome = "ready" | "not_ready" | "unreachable" | "gap";

export function tickOutcome(round: SubjectRound): TickOutcome {
  if (!round.probed || !round.verdict) return "gap";
  if (round.verdict === "ready") return "ready";
  if (round.verdict === "unreachable") return "unreachable";
  return "not_ready";
}

export function probeStrip(timeline: readonly SubjectRound[], host: string): string {
  if (timeline.length === 0) return "";
  const ticks = timeline
    .map((round) => {
      const outcome = tickOutcome(round);
      const title =
        outcome === "gap"
          ? `${round.week}: not walked — ${round.gap ?? "no verdict"}`
          : `${round.week}: ${round.verdict}${round.failed?.length ? ` (${round.failed.join(", ")})` : ""}`;
      return `<a class="tick" data-outcome="${outcome}" data-week="${escapeHtml(round.week)}" href="${escapeHtml(round.entry_url)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"></a>`;
    })
    .join("");
  const probed = timeline.filter((round) => tickOutcome(round) !== "gap").length;
  const first = timeline[0]!.week;
  const last = timeline[timeline.length - 1]!.week;
  return `<section class="probe-strip" data-host="${escapeHtml(host)}">
    <div class="ticks" role="img" aria-label="${escapeHtml(`${timeline.length} rounds ${first} to ${last}, ${probed} probed`)}">${ticks}</div>
    <p class="menu-meta">Every round on the chain, ${escapeHtml(first)} → ${escapeHtml(last)}: ${probed} probed of ${timeline.length}.
    <span class="key"><span class="tick" data-outcome="ready"></span> ready</span>
    <span class="key"><span class="tick" data-outcome="not_ready"></span> not ready</span>
    <span class="key"><span class="tick" data-outcome="unreachable"></span> unreachable</span>
    <span class="key"><span class="tick" data-outcome="gap"></span> not walked — the reason is on the tick</span>.
    A gap is a fact about our cadence, not about the door.</p>
  </section>`;
}

/** A summary row, omitted entirely when the passport does not carry
 * the field. An empty cell would read as an observed zero. */
function row(label: string, value: string | null | undefined, kind?: Basis): string {
  if (value === null || value === undefined || value === "") return "";
  return `<tr${kind ? ` data-basis="${kind}"` : ""}><td>${escapeHtml(label)}</td><td>${value}</td><td class="basis-cell">${kind ? basis(kind) : ""}</td></tr>`;
}

/**
 * GAPS, COUNTED BEFORE THEY ARE LISTED. `not_checked` ids are machine
 * tokens and there are dozens of them on a self-passport — pasting
 * the raw join into the one block that exists to be read in a glance
 * would undo the block. So the count leads (a number IS the glance),
 * the full list stays one disclosure away, and neither is a summary
 * of the other: both render the same array.
 */
function gapList(gaps: readonly string[], summaryLabel: string): string {
  if (gaps.length === 0) return "<em>none declared</em>";
  return `<details><summary>${escapeHtml(summaryLabel)}</summary>
    <ul>${gaps.map((gap) => `<li><code>${escapeHtml(gap)}</code></li>`).join("")}</ul>
  </details>`;
}

function notObservedCell(gaps: readonly string[]): string {
  if (gaps.length === 0) {
    return "<em>the modules cited here declare no gaps</em>";
  }
  return `<strong>${gaps.length}</strong> thing${gaps.length === 1 ? "" : "s"}
  the evidence declined to check — a gap is not a pass.
  ${gapList(gaps, "list them")}`;
}

/**
 * THE SUMMARY SHAPE, rendered — the compact block the read asked for,
 * and it is exactly `payload.summary`, field for field. The one-glance
 * answer and the signed object are the same bytes; this table is only
 * a face on them.
 */
function summaryTable(passport: EndpointPassport): string {
  const s = passport.payload.summary;
  const tier = passport.payload.tier;
  const price = priceOf(s);
  return `<table class="summary">
    <thead><tr><th>field</th><th>value</th><th title="${escapeHtml(BASIS_LEGEND)}">basis</th></tr></thead>
    <tbody>
      ${row("status", `<code>${escapeHtml(s.status)}</code>`, "derived")}
      ${row("protocol", s.protocol ? escapeHtml(s.protocol) : null, "observed")}
      ${row(
        "tier",
        tier
          ? `<span data-tier="${escapeHtml(tier.tier)}"><code>${escapeHtml(tier.tier)}</code> — ${escapeHtml(String(tier.fraction.ready))} of ${escapeHtml(String(tier.fraction.rounds))}, ${escapeHtml(tier.fraction.weeks)}</span> ·
            <a href="${escapeHtml(s.history_url)}">the rows</a> ·
            <a href="${escapeHtml(tier.criteria_url)}">the rule</a>${tier.coverage_suspect ? " · <em>our coverage was suspect in this window</em>" : ""}`
          : null,
        "derived",
      )}
      ${row("verdict", s.verdict ? `<code>${escapeHtml(s.verdict)}</code>` : "<em>none</em>", "observed")}
      ${row("observed_at", s.observed_at ? `<code>${escapeHtml(s.observed_at)}</code>` : "<em>never</em>", "observed")}
      ${row("valid_until", `<code>${escapeHtml(s.valid_until)}</code> — refuse this passport after it`, "derived")}
      ${row(
        "evidence_age",
        s.evidence_age_days === null
          ? "<em>unknown</em>"
          : `${escapeHtml(String(s.evidence_age_days))} day${s.evidence_age_days === 1 ? "" : "s"} between the observation and this issue`,
        "derived",
      )}
      ${row("networks", s.networks?.length ? s.networks.map((n) => `<code>${escapeHtml(n)}</code>`).join(", ") : null, "reported")}
      ${row("price", price === null ? null : `${escapeHtml(price)} — the door's own declared ask, as captured`, "reported")}
      ${row(
        "failed",
        s.failed.length === 0
          ? "<em>nothing we checked failed</em>"
          : s.failed.map((f) => `<code>${escapeHtml(f)}</code>`).join(", "),
        "observed",
      )}
      ${row("not_observed", notObservedCell(s.not_observed))}
      ${row(
        "verify",
        /* The RECIPE the artifact itself carries, not a link we chose:
         * "everything this store signs verifies free" is only true if
         * the page hands over the steps rather than a button of ours. */
        `${escapeHtml(s.verify)} Offline, without asking us —
        <a href="/.well-known/scvd-signing-key">the key</a> ·
        <a href="/spec/scvd-attestation/v1">the format</a>`,
      )}
      ${row("history", `<a href="${escapeHtml(s.history_url)}">the signed per-host record</a>`)}
      ${row("corrections", `<a href="${escapeHtml(s.corrections_url)}">what this store has gotten wrong</a>`)}
    </tbody>
  </table>
  <p class="menu-meta">basis: ${Object.entries(BASIS_MARK).map(([kind, mark]) => `${mark} ${kind}`).join(" · ")} — the legend is under the decision above.</p>`;
}

/**
 * WHAT THIS DOES NOT PROVE, on the passport page rather than only in
 * llms.txt and the trust docs. The general boundary is the artifact's
 * own `not_a_guarantee`; the specific ones are each cited module's own
 * `does_not_prove`, so a module that narrows its claim narrows this
 * box on the next render without anybody editing copy.
 */
function doesNotProveBlock(passport: EndpointPassport): string {
  const specific = [
    ...new Set(
      passport.payload.modules.flatMap((module) => module.does_not_prove),
    ),
  ].sort();
  return `<section class="limits">
    <h3>What this does not prove</h3>
    <p class="menu-desc">${escapeHtml(passport.payload.not_a_guarantee)}</p>
    ${
      specific.length === 0
        ? ""
        : `<ul class="menu-desc">${specific
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("")}</ul>`
    }
  </section>`;
}

/** The modules that fed this passport, with what each one declined to
 * look at. Live from the artifact — an uncited passport says so. */
function modulesBlock(passport: EndpointPassport): string {
  const modules = passport.payload.modules;
  if (modules.length === 0) {
    return `<section><h3>What fed this passport</h3>
    <p class="menu-desc">No evidence module is cited here yet: this passport
    is a view over the weekly census's verdict and history alone. That is
    the honest state, not a rendering gap — a passport does not cite a
    module it does not have.</p></section>`;
  }
  return `<section><h3>What fed this passport</h3>
  <table><thead><tr><th>module</th><th>derived</th><th>evidence hash</th><th>did not check</th></tr></thead>
  <tbody>${modules
    .map(
      (module) => `<tr>
      <td><code>${escapeHtml(module.id)}</code></td>
      <td><strong>${escapeHtml(module.derived)}</strong></td>
      <td><code>${escapeHtml(module.evidence_hash.slice(0, 12))}…</code></td>
      <td>${gapList(module.not_checked, `${module.not_checked.length} not checked`)}</td>
    </tr>`,
    )
    .join("")}</tbody></table>
  <p class="menu-meta">The evidence hash is the canonical bytes of what was
  compared, hashed — so this table and the signed object underneath cannot
  quietly disagree.</p></section>`;
}

/** The signed object itself, beside the prose rather than instead of
 * it: every field above, in the shape an agent parses. */
function signedObjectBlock(passport: EndpointPassport): string {
  return `<details class="signed-object"><summary>The same passport as JSON — the signed object, verifiable without asking us</summary>
    <pre>${escapeHtml(JSON.stringify(passport, null, 2))}</pre>
  </details>`;
}

/**
 * ONE PASSPORT, RENDERED — the shape both doors use, so the landing's
 * example and a host's own page are the same object presented the same
 * way. Decision first, then the summary, then the gaps, then the
 * limits, then the machine copy.
 */
export function passportCard(
  passport: EndpointPassport,
  options: { timeline?: readonly SubjectRound[] } = {},
): string {
  const p = passport.payload;
  return `<section class="passport-card">
    <h2>${escapeHtml(p.host)}</h2>
    <p class="menu-meta">issued ${escapeHtml(p.issued_at.slice(0, 16))}Z ·
    observer: ${escapeHtml(p.observer)}</p>
    ${glanceStrip(passport)}
    ${decisionBlock(passport)}
    ${options.timeline ? probeStrip(options.timeline, p.host) : ""}
    ${p.protocol_tiers ? `<section><h3>Each protocol's own history</h3><ul>${Object.entries(p.protocol_tiers).map(([protocol, reading]) => `<li>${escapeHtml(protocol)}: ${escapeHtml(reading.line)} · <a href="${escapeHtml(reading.criteria_url)}">the rule</a></li>`).join("")}</ul></section>` : ""}
    ${p.protocol_rule ? `<details class="protocol-rule"><summary>The protocol rule this passport rests on</summary><p class="menu-desc">${escapeHtml(p.protocol_rule)}</p></details>` : ""}
    ${summaryTable(passport)}
    <p class="menu-meta">history: first observed ${escapeHtml(p.history.first_observed ?? "—")},
    ${p.history.rounds_probed} rounds probed, ${p.history.rounds_gapped} gapped,
    ${p.history.verdict_changes} verdict changes ·
    <a href="${escapeHtml(p.history.full_history_url)}">full signed history</a></p>
    ${modulesBlock(passport)}
    ${doesNotProveBlock(passport)}
    ${signedObjectBlock(passport)}
  </section>`;
}

/**
 * THE SHARE COLOPHON (roadmap S2, the keeper's ink 2026-09-01). What a
 * merchant may paste beside their door: it carries the date, the
 * gaps-against-the-observer clause, the stale-after date and the link
 * to the dated page — and never a verdict word, never "preflight
 * passed", never a green mark. A colophon says who looked and when; a
 * badge says what to think. This store issues only the first.
 */
export function colophonText(passport: EndpointPassport, base: string): string {
  const s = passport.payload.summary;
  const observed = s.observed_at ? s.observed_at.slice(0, 10) : "a date the record does not carry";
  return `Observed by scvd.store on ${observed}. Gaps counted against the observer. Stale after ${s.valid_until.slice(0, 10)}. Read the dated page: ${base}/passport/${passport.payload.host}`;
}

/**
 * THE SHARE CARD'S LINES (2026-09-02). What a pasted passport link
 * unfurls into: who looked, when, at which host, and when the reading
 * goes stale. No verdict word, ever — the card is a colophon drawn
 * large, and a card that said READY would be the badge rules 43 and
 * 54 forbid. The host line shrinks to fit; nothing is truncated.
 */
export function cardLines(passport: EndpointPassport): CardContent {
  const s = passport.payload.summary;
  const observed = s.observed_at ? s.observed_at.slice(0, 10) : "undated";
  const host = passport.payload.host.toLowerCase();
  return {
    eyebrow: "scvd general store · oak city",
    title: "endpoint passport",
    host,
    observed: `observed ${observed}`,
    stale: `stale after ${s.valid_until.slice(0, 10)}`,
    footer: "gaps counted against the observer",
  };
}

/**
 * THE CHIP, AS SOMETHING TO PASTE (2026-09-03, the badge loop). The
 * chip has rendered at /badges/passport/{host}.svg since 2026-08-21
 * and the passport page never offered it, so the one artifact an
 * operator would put in a README had to be found by reading the
 * guide. It re-renders on every read from the same dates the page
 * carries (edge-cached six hours), wears the tier with its fraction
 * on its face, links the dated page, and refuses to render at all
 * when the door is not on the ready side — so a pasted chip can go
 * dark but never stale-green. Two snippets, markdown and HTML, both
 * pointing the image at the chip and the link at the passport.
 */
export interface PassportEmbed {
  chip_svg: string;
  markdown: string;
  html: string;
  note: string;
}

export function passportEmbed(passport: EndpointPassport, base: string): PassportEmbed {
  return passportEmbedFor(passport.payload.host, base);
}

/**
 * The same two snippets from a host name alone (2026-09-04). The
 * welcome letter and the operators page hand the chip out the way a
 * directory hands out its badge — markdown and HTML, ready to paste —
 * and neither has a passport object in hand, only the host. There is
 * no claim step: the chip is earned by the observation, and a chip
 * pasted for a host that is not on the ready side renders nothing.
 */
export function passportEmbedFor(rawHost: string, base: string): PassportEmbed {
  const host = rawHost.toLowerCase();
  const chip = `${base}/badges/passport/${host}.svg`;
  const url = `${base}/passport/${host}`;
  /*
   * THE ALT TEXT TELLS THE TRUTH ABOUT WHO LOOKED (2026-09-06).
   * "observed ... gaps counted against the observer" is right for a
   * census host and wrong for exactly one host: our own, whose
   * passport the census structurally cannot probe and which is
   * self-read at render. The chip's own face has said SELF-OBSERVED
   * since it was redrawn; the snippet we hand out beside it still
   * described the self chip as observed, which is the one place a
   * reader could take a self-issued artifact for a census one.
   */
  const self = host === new URL(base).host.toLowerCase();
  const alt = self
    ? `scvd.store passport for ${host}: SELF-OBSERVED — the subject and the observer are the same party, dated, gaps counted against the observer`
    : `scvd.store passport for ${host}: observed, dated, gaps counted against the observer`;
  return {
    chip_svg: chip,
    markdown: `[![${alt}](${chip})](${url})`,
    html: `<a href="${url}"><img src="${chip}" alt="${alt}" width="${CHIP_LAYOUT.width}" height="${CHIP_LAYOUT.height}"></a>`,
    note:
      "The chip re-renders from the same dates this page carries, wears the tier with its fraction, and stops rendering when the door leaves the ready side — a pasted chip can go dark, never stale-green. Six-hour edge cache.",
  };
}

export function colophonBlock(passport: EndpointPassport, base: string): string {
  const text = colophonText(passport, base);
  const url = `${base}/passport/${passport.payload.host}`;
  const embed = passportEmbed(passport, base);
  return `<section>
    <h2>To paste beside your door</h2>
    <p class="menu-desc">The chip: the tier with its fraction on its face, the observation date, a link to this page. ${escapeHtml(embed.note)}</p>
    <p><a href="${escapeHtml(url)}"><img src="${escapeHtml(embed.chip_svg)}" alt="${escapeHtml(`scvd.store passport chip for ${passport.payload.host}`)}" width="${CHIP_LAYOUT.width}" height="${CHIP_LAYOUT.height}"></a></p>
    <p class="menu-meta">Markdown, for a README:</p>
    <pre class="menu-desc"><code>${escapeHtml(embed.markdown)}</code></pre>
    <p class="menu-meta">HTML, for a page:</p>
    <pre class="menu-desc"><code>${escapeHtml(embed.html)}</code></pre>
  </section>
  <section>
    <h2>To share</h2>
    <p class="menu-desc">A colophon, not a badge: it says who looked and when, and it links the dated page. Paste it beside your door as it stands — the words carry their own expiry.</p>
    <p class="menu-meta">Pasting the page's link anywhere that unfurls previews shows this card, drawn from the same dates: <a href="${escapeHtml(base)}/passport/card/${escapeHtml(passport.payload.host)}.png"><code>${escapeHtml(base)}/passport/card/${escapeHtml(passport.payload.host)}.png</code></a></p>
    <p><img src="${escapeHtml(base)}/passport/card/${escapeHtml(passport.payload.host)}.png" alt="Observed by scvd.store on ${escapeHtml(passport.payload.summary.observed_at ? passport.payload.summary.observed_at.slice(0, 10) : "an undated pass")}; ${escapeHtml(passport.payload.host)}; stale after ${escapeHtml(passport.payload.summary.valid_until.slice(0, 10))}; gaps counted against the observer" width="600" height="315" style="max-width:100%;height:auto;border:1px solid currentColor"></p>
    <pre class="menu-desc"><code>${escapeHtml(text)}</code></pre>
    <pre class="menu-desc"><code>${escapeHtml(`[${text.replace(/ Read the dated page: .*$/, "")}](${url})`)}</code></pre>
  </section>`;
}

/** Small enough to keep in one place: the decision word, set big, and
 * the two blocks that carry the compressed read. Everything else on
 * the page is ordinary paper. */
export const PASSPORT_CSS = `
.decision {
  border: 1px solid var(--line);
  border-left: 4px solid var(--teal);
  background: var(--card);
  padding: 0.9rem 1rem;
  margin: 1rem 0;
}
.decision[data-decision="NOT_READY"],
.decision[data-decision="EXPIRED"] { border-left-color: var(--neon); }
.decision[data-decision="INDETERMINATE"] { border-left-color: var(--night-faded); }
.decision-word {
  font-size: 1.5rem;
  letter-spacing: 0.08em;
  margin: 0 0 0.4rem;
  color: var(--teal);
}
.decision[data-decision="NOT_READY"] .decision-word,
.decision[data-decision="EXPIRED"] .decision-word { color: var(--neon); }
.decision[data-decision="INDETERMINATE"] .decision-word { color: var(--night-faded); }
.decision p:last-child { margin-bottom: 0; }
table.summary td:first-child { white-space: nowrap; font-family: monospace; }
table.summary .basis-cell { text-align: center; white-space: nowrap; }
.basis { color: var(--night-faded); font-family: monospace; font-size: 0.9em; }
.because { margin: 0 0 0.5rem; }
.because .sep { color: var(--night-faded); }
.because .not-observed { color: var(--night-faded); }
.glance { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 0.75rem 0 1rem; }
.glance .cell {
  flex: 1 1 8rem;
  min-width: 7rem;
  border: 1px solid var(--line);
  background: var(--card);
  padding: 0.6rem 0.75rem;
  display: flex; flex-direction: column; gap: 0.15rem;
}
.glance .value { font-size: 1.35rem; line-height: 1.2; overflow-wrap: anywhere; }
.glance [data-glance="decision"] .value { letter-spacing: 0.06em; color: var(--teal); }
.glance [data-decision="NOT_READY"] .value, .glance [data-decision="EXPIRED"] .value { color: var(--neon); }
.glance [data-decision="INDETERMINATE"] .value { color: var(--night-faded); }
.glance .label { color: var(--night-faded); font-size: 0.8rem; }
.probe-strip { margin: 0.75rem 0 1rem; }
.probe-strip .ticks { display: flex; flex-wrap: wrap; gap: 3px; padding: 2px 0; }
.probe-strip .key { white-space: nowrap; margin-left: 0.5rem; }
.tick {
  display: inline-block; width: 12px; height: 22px; border-radius: 2px;
  box-sizing: border-box; vertical-align: middle;
}
.probe-strip .ticks .tick { min-width: 12px; }
.probe-strip .ticks .tick:hover, .probe-strip .ticks .tick:focus { outline: 2px solid var(--night-text); outline-offset: 1px; }
.tick[data-outcome="ready"] { background: var(--teal); }
.tick[data-outcome="not_ready"] {
  background: repeating-linear-gradient(135deg, var(--neon) 0 3px, var(--card) 3px 5px);
  border: 1px solid var(--neon);
}
.tick[data-outcome="unreachable"] { border: 2px solid var(--neon); background: transparent; }
.tick[data-outcome="gap"] { border: 1px dotted var(--night-faded); background: transparent; }
.protocol-rule summary { cursor: pointer; color: var(--night-faded); }
.limits {
  border: 1px dashed var(--line);
  padding: 0.75rem 1rem;
  margin: 1rem 0;
}
.limits h3 { margin-top: 0; }
.limits ul { margin: 0.5rem 0 0; padding-left: 1.2rem; }
`;


/**
 * A REFUSAL, RENDERED IN THE SAME VOCABULARY. The passport door
 * refuses any host whose latest observation is not on the ready side,
 * but a commissioned profile still has a page — the term was paid for
 * and yanking it because the verdict turned would be selling the
 * grade after all. So the refusal renders as a decision rather than
 * as an absence: same box, same words, and the reason stated plainly
 * underneath instead of a bare freshness noun nobody can act on.
 */
export function refusalCard(input: {
  host: string;
  /**
   * `retracted-reading` (2026-09-05) reads INDETERMINATE, never
   * NOT_READY: the checks that verdict rested on are withdrawn, and
   * rendering a withdrawn finding as a refusal about the host would
   * be publishing the retracted claim in a smaller font.
   */
  reason: "never-observed" | "not-ready" | "retracted-reading" | "protocol-unmeasured";
  detail: string;
}): string {
  const decision = input.reason === "not-ready" ? "NOT_READY" : "INDETERMINATE";
  return `<section class="passport-card">
    ${decisionWord(decision)}
    <p class="menu-desc">${escapeHtml(input.detail)}</p>
  </section>`;
}

/** The decision box with no passport behind it — the refusal path and
 * the legend both need the word without the summary under it. */
export function decisionWord(decision: AgentDecision): string {
  return `<section class="decision" data-decision="${escapeHtml(decision)}">
    <p class="decision-word">${escapeHtml(decision)}</p>
    <p class="menu-desc">${escapeHtml(DECISION_MEANING[decision])}</p>
  </section>`;
}

/**
 * OPERATE THIS DOOR? (2026-09-17.) Read off robinsaige.com's record of
 * this store's own MCP door, which ends every server page with one
 * line to the operator: everything held is on this page, free, for
 * anyone; wrong attribution, stale probe, misclassification — dispute
 * it here. This store already had every door that line needs — the
 * free mailbox, the corrections ledger, the free self-check, the
 * notice desk — and the passport page named none of them where an
 * operator reading their own record would look. Same doors, one
 * block, on the record page itself. One code path for the page and
 * the JSON, so the two cannot name different mailboxes.
 */
export interface ContestBlock {
  what: string;
  mailbox: string;
  corrections_url: string;
  self_check: string;
  withdraw: string;
}

export function contestBlock(host: string, base: string): ContestBlock {
  return {
    what: `Everything this store holds about ${host} is on this page and in the signed history at ${base}/corpus/host/${host}.json — free, no account, for anyone. Wrong host, stale observation, or a reading you can show is wrong? The mailbox is free and a human reads it; what proves wrong is published dated at /corrections and never deleted, beside the reading it corrects. The same battery runs on your door right now at the free self-check. To have the page withdrawn, the notice desk is the door.`,
    mailbox: `${base}/api/letter`,
    corrections_url: `${base}/corrections`,
    self_check: `${base}/api/preflight`,
    withdraw: `${base}/notice`,
  };
}

export function contestHtml(host: string, base: string): string {
  const block = contestBlock(host, base);
  return `<section class="contest"><h2>Operate this door?</h2>
    <p class="menu-desc">${escapeHtml(block.what)}</p>
    <p class="menu-meta">Dispute: <code>POST ${escapeHtml(block.mailbox)}</code> ·
    the record of what we got wrong: <a href="/corrections">/corrections</a> ·
    self-check: <code>POST ${escapeHtml(block.self_check)}</code> ·
    withdraw the page: <a href="/notice">/notice</a></p>
  </section>`;
}

/**
 * THE QUESTION THE PAGE ANSWERS, AS DATA (2026-09-17). The same outside
 * record carries a QAPage node — "Should my agent depend on this
 * server?" with the verdict as the accepted answer — which is the
 * shape an answer engine lifts a verdict from. This page had a WebPage
 * node and a signed object and nothing that said, in a type a parser
 * recognises, that it answers a question.
 *
 * WHAT THE ANSWER CARRIES, BY HOUSE RULE: never the decision word
 * alone. The status it was derived from, the rule that derived it,
 * the date, the expiry, the count of things not observed, and who the
 * observer was — the derivation beside the verdict, in the node as on
 * the page. Everything is read off the signed summary, so the node
 * cannot say what the passport does not.
 */
export function passportQuestionJsonLd(passport: EndpointPassport, base: string): string {
  const p = passport.payload;
  const s = p.summary;
  const url = `${base}/passport/${p.host}`;
  const observed = s.observed_at ?? "no dated observation";
  const text = [
    `${s.decision} — as of ${observed}, derived from status "${s.status}" by the rule: ${s.decision_rule}`,
    DECISION_MEANING[s.decision],
    `Valid until ${s.valid_until}. ${s.not_observed.length} thing${s.not_observed.length === 1 ? "" : "s"} not observed, listed on the page beside the verdict; ${s.failed.length === 0 ? "no failing checks" : `failing checks: ${s.failed.join(", ")}`}.`,
    `Observer: ${p.observer}`,
    "A dated, ed25519-signed observation with its gaps counted against the observer. Not a warranty, not an endorsement, never a ranking; verify the signature yourself and refuse it after expiry.",
  ].join(" ");
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "QAPage",
    "@id": `${url}#question`,
    url,
    name: `Endpoint passport: ${p.host}`,
    mainEntity: {
      "@type": "Question",
      name: `Should an agent treat ${p.host} as payable over ${(s.protocol ?? "x402").toUpperCase()} on scvd.store's evidence?`,
      answerCount: 1,
      dateModified: p.issued_at,
      author: organizationRef(base),
      acceptedAnswer: {
        "@type": "Answer",
        text,
        url,
        dateCreated: p.issued_at,
        ...(s.observed_at ? { dateModified: s.observed_at } : {}),
        author: organizationRef(base),
      },
    },
  });
}

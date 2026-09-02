import { escapeHtml } from "@/lib/sanitize";
import { fitCell, type CardLine } from "@/lib/pixel-card";
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
 * THE DECISION, BIG. One word, its plain meaning, and the arithmetic
 * that produced it — all three from the signed summary, so a reader
 * who distrusts the word can re-derive it from the status beside it.
 */
export function decisionBlock(passport: EndpointPassport): string {
  const s = passport.payload.summary;
  return `<section class="decision" data-decision="${escapeHtml(s.decision)}">
    <p class="decision-word">${escapeHtml(s.decision)}</p>
    <p class="menu-desc">${escapeHtml(DECISION_MEANING[s.decision])}</p>
    <p class="menu-meta">Derived from <code>status: ${escapeHtml(s.status)}</code> —
    ${escapeHtml(DECISION_RULE)}</p>
  </section>`;
}

/** A summary row, omitted entirely when the passport does not carry
 * the field. An empty cell would read as an observed zero. */
function row(label: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return `<tr><td>${escapeHtml(label)}</td><td>${value}</td></tr>`;
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
  the cited modules declined to check — a gap is not a pass.
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
  const price =
    s.min_usdc === undefined && s.max_usdc === undefined
      ? null
      : `${s.min_usdc ?? "?"}–${s.max_usdc ?? "?"} USDC (the door's own declared ask, as captured)`;
  return `<table class="summary">
    <tbody>
      ${row("status", `<code>${escapeHtml(s.status)}</code>`)}
      ${row(
        "tier",
        tier
          ? `<span data-tier="${escapeHtml(tier.tier)}"><code>${escapeHtml(tier.tier)}</code> — ${escapeHtml(String(tier.fraction.ready))} of ${escapeHtml(String(tier.fraction.rounds))}, ${escapeHtml(tier.fraction.weeks)}</span> ·
            <a href="${escapeHtml(s.history_url)}">the rows</a> ·
            <a href="${escapeHtml(tier.criteria_url)}">the rule</a>${tier.coverage_suspect ? " · <em>our coverage was suspect in this window</em>" : ""}`
          : null,
      )}
      ${row("verdict", s.verdict ? `<code>${escapeHtml(s.verdict)}</code>` : "<em>none</em>")}
      ${row("observed_at", s.observed_at ? `<code>${escapeHtml(s.observed_at)}</code>` : "<em>never</em>")}
      ${row("valid_until", `<code>${escapeHtml(s.valid_until)}</code> — refuse this passport after it`)}
      ${row(
        "evidence_age",
        s.evidence_age_days === null
          ? "<em>unknown</em>"
          : `${escapeHtml(String(s.evidence_age_days))} day${s.evidence_age_days === 1 ? "" : "s"} between the observation and this issue`,
      )}
      ${row("networks", s.networks?.length ? s.networks.map((n) => `<code>${escapeHtml(n)}</code>`).join(", ") : null)}
      ${row("price", price === null ? null : escapeHtml(price))}
      ${row(
        "failed",
        s.failed.length === 0
          ? "<em>nothing we checked failed</em>"
          : s.failed.map((f) => `<code>${escapeHtml(f)}</code>`).join(", "),
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
  </table>`;
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
export function passportCard(passport: EndpointPassport): string {
  const p = passport.payload;
  return `<section class="passport-card">
    <h2>${escapeHtml(p.host)}</h2>
    <p class="menu-meta">issued ${escapeHtml(p.issued_at.slice(0, 16))}Z ·
    observer: ${escapeHtml(p.observer)}</p>
    ${decisionBlock(passport)}
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
export function cardLines(passport: EndpointPassport): CardLine[] {
  const s = passport.payload.summary;
  const observed = s.observed_at ? s.observed_at.slice(0, 10) : "undated";
  const host = passport.payload.host.toLowerCase();
  return [
    { text: "observed by scvd.store", cell: 8 },
    { text: `on ${observed}`, cell: 6 },
    { text: host, cell: fitCell(host, 9) },
    { text: `stale after ${s.valid_until.slice(0, 10)}`, cell: 6 },
    { text: "gaps counted against the observer", cell: 4 },
  ];
}

export function colophonBlock(passport: EndpointPassport, base: string): string {
  const text = colophonText(passport, base);
  const url = `${base}/passport/${passport.payload.host}`;
  return `<section>
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
  reason: "never-observed" | "not-ready";
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

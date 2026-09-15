/**
 * THE RULINGS LEDGER — what the screen has already been told.
 *
 * Without this the Monday run has no memory. The snapshot stops a row
 * being reported twice, but nothing carries the DECISION: that Tempo's
 * TIPs are read and not acted on because we do not settle there, that
 * P1 is open and three weeks old, that a whole area was ruled on in
 * September and the reason still holds. Every week re-derives the same
 * questions and a human re-answers them, which is how a weekly report
 * stops being read by week four.
 *
 * A ruling is a decision with a reason and a date, and it covers
 * either one row or a described area of one. Rows an existing ruling
 * covers are reported under it rather than in ACT — not hidden, moved,
 * with the reason travelling beside them.
 *
 * THE GUARD THAT MAKES THIS SAFE. A ruling that silences an area
 * forever is worse than no ruling: it is the mechanism by which a
 * screen stops seeing. So a scope ruling MUST carry `covers_until`.
 * Past that date it stops applying, its rows return to ordinary
 * scoring, and the report says the ruling lapsed and wants renewing.
 * A decision you would not re-make in three months is not a decision,
 * it is fatigue.
 *
 * Row-id rulings need no expiry: a merged commit cannot change, so a
 * judgement about it cannot go stale.
 */

export const RULING_STATES = ["noted", "proposed", "done", "wont"];

/** How long a scope ruling may silence an area before it must be renewed. */
export const MAX_SCOPE_DAYS = 120;

const DAY = 86_400_000;
const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export function validateRuling(r) {
  const problems = [];
  if (!r.id) problems.push("no id");
  if (!RULING_STATES.includes(r.state)) problems.push(`state must be one of ${RULING_STATES.join(", ")}`);
  if (!r.reason) problems.push("no reason — a ruling without one cannot be re-examined, only obeyed");
  if (!r.ruled_on) problems.push("no ruled_on date");
  const hasRows = Array.isArray(r.rows) && r.rows.length > 0;
  const hasScope = r.scope && (r.scope.protocol || r.scope.pathPrefix || r.scope.surface);
  /*
   * TWO KINDS OF RULING, and conflating them was this validator's own
   * first bug. A FILING ruling (rows or scope) decides where matching
   * rows are reported. A RECORD (neither) is a decision the ledger
   * carries so the report can nag about it — an open proposal, a
   * shipped fix, a finding withdrawn. A record covers nothing and that
   * is correct.
   *
   * `noted` is the one state that cannot be a record: noted WHAT? A
   * ruling that says a thing was seen and answered must name the
   * thing, or it is a sentiment.
   */
  if (r.state === "noted" && !hasRows && !hasScope) {
    problems.push("a `noted` ruling must name what it covers — give it rows or a scope, or record it as proposed/done/wont");
  }
  if (hasScope && !r.covers_until) {
    problems.push("a scope ruling must carry covers_until — an area silenced with no end date is how a screen stops seeing");
  }
  if (hasScope && r.covers_until && r.ruled_on && days(r.ruled_on, r.covers_until) > MAX_SCOPE_DAYS) {
    problems.push(`covers_until is more than ${MAX_SCOPE_DAYS} days out`);
  }
  return problems;
}

export function loadRulings(raw) {
  const parsed = raw ? JSON.parse(raw) : { rulings: [] };
  const list = parsed.rulings ?? [];
  const bad = list.flatMap((r) => validateRuling(r).map((p) => `${r.id ?? "(no id)"}: ${p}`));
  if (bad.length) throw new Error(`rulings: ${bad.join("; ")}`);
  return list;
}

/** Live = not lapsed as of `today`. Row rulings never lapse. */
export function isLive(ruling, today) {
  if (!ruling.covers_until) return true;
  return days(today, ruling.covers_until) >= 0;
}

/**
 * Does a ruling cover this row? Explicit row ids win; otherwise every
 * facet the scope names must match, so a scope is a conjunction and
 * never accidentally broad.
 */
export function coversRow(ruling, row) {
  if (Array.isArray(ruling.rows) && ruling.rows.includes(row.id)) return true;
  const scope = ruling.scope;
  if (!scope) return false;
  if (scope.protocol && scope.protocol !== row.protocol) return false;
  if (scope.surface && !(row.surfaces ?? []).includes(scope.surface)) return false;
  if (scope.pathPrefix) {
    const files = row.files ?? [];
    if (!files.some((f) => f.startsWith(scope.pathPrefix))) return false;
  }
  // A scope of protocol-only is legal but must say so deliberately.
  return Boolean(scope.protocol || scope.surface || scope.pathPrefix);
}

/**
 * Split the window into rows nobody has ruled on and rows an existing
 * ruling already answers. Lapsed rulings do not cover anything — their
 * rows come back, which is the point of the expiry.
 */
export function applyRulings(rows, rulings, today) {
  const live = rulings.filter((r) => isLive(r, today));
  const lapsed = rulings.filter((r) => !isLive(r, today));
  const settled = [];
  const fresh = [];
  for (const row of rows) {
    const ruling = live.find((r) => coversRow(r, row));
    if (ruling) settled.push({ ...row, ruling: ruling.id, rulingReason: ruling.reason, rulingState: ruling.state });
    else fresh.push(row);
  }
  return { fresh, settled, lapsed };
}

/** Proposals that are still open, oldest first, with their age. */
export function openProposals(rulings, today) {
  return rulings
    .filter((r) => r.state === "proposed")
    .map((r) => ({ ...r, ageDays: days(r.ruled_on, today) }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

export function renderRulings({ settled, lapsed, proposals }) {
  const out = [];
  if (proposals.length) {
    out.push(`## Still open (${proposals.length})`);
    out.push("");
    out.push("| Ruling | Age | What was proposed |");
    out.push("| --- | --- | --- |");
    for (const p of proposals) {
      out.push(`| ${p.id} | ${p.ageDays}d | ${p.reason} |`);
    }
    out.push("");
  }
  if (settled.length) {
    const byRuling = new Map();
    for (const row of settled) {
      if (!byRuling.has(row.ruling)) byRuling.set(row.ruling, []);
      byRuling.get(row.ruling).push(row);
    }
    out.push(`## Already ruled on (${settled.length})`);
    out.push("");
    out.push("Not hidden — answered. Each was scored, then matched a standing ruling.");
    out.push("");
    for (const [id, rows] of byRuling) {
      out.push(`**${id}** (${rows.length}) — ${rows[0].rulingReason}`);
      out.push("");
      for (const r of rows.slice(0, 8)) out.push(`- ${r.protocol} ${r.pr ? `#${r.pr}` : ""} ${r.title}`);
      if (rows.length > 8) out.push(`- …and ${rows.length - 8} more`);
      out.push("");
    }
  }
  if (lapsed.length) {
    out.push(`## Lapsed rulings (${lapsed.length}) — renew or let their rows come back`);
    out.push("");
    for (const r of lapsed) {
      out.push(`- **${r.id}** expired ${r.covers_until}: ${r.reason}`);
    }
    out.push("");
    out.push("A ruling stops covering its area on its own date, on purpose. A decision you would not re-make is not a decision.");
    out.push("");
  }
  return out.join("\n");
}

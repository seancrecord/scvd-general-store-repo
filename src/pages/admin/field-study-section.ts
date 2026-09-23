import { escapeHtml } from "@/lib/sanitize";
import type { MetricEvent, StudyLedger } from "@/lib/metrics";
import type {
  StudyRecord,
  fieldStudyBoard,
  scenarioShelf,
} from "@/services/field-study";
import { scenarioTargetSentence } from "@/services/field-study";
import type { StudyFindings } from "@/services/study-findings";

/**
 * THE FIELD STUDY, FROM THE KEEPER'S SIDE (FIELD_STUDY.md).
 *
 * It lands on the bounty board's page rather than getting a room of
 * its own because the keeper asked for it there, and because the two
 * instruments share the one question this page exists to answer:
 * money is leaving, is it buying anything. Sharing the page also
 * means the two weekly budgets sit one section apart, which is the
 * only place anybody would notice if one started eating the other.
 *
 * WHAT THE KEEPER SEES HERE THAT THE ROOM DOES NOT, and why the line
 * is drawn where it is: the roster, in full, with the operator string
 * and the payout wallet. The public room publishes the shape of the
 * answers and never a row you could read one researcher out of —
 * that is a promise the debrief door makes at the moment of payment.
 * This desk is the other side of the same promise: somebody has to be
 * able to follow up on a finding, and it is him.
 *
 * THE ROW THAT MATTERS MOST IS THE EMPTY ONE. An enrolment that never
 * debriefed is an agent that walked in, said in its own words what it
 * came here to do, and then gave up before buying anything. That is
 * the most expensive fact this instrument collects and it leaves no
 * other trace anywhere in the store — so it gets its own section, at
 * the top, above the studies that worked.
 */

export interface FieldStudyDeskData {
  board: Awaited<ReturnType<typeof fieldStudyBoard>> | null;
  studies: StudyRecord[] | null;
  findings: StudyFindings | null;
  ledger: StudyLedger | null;
  attempts: MetricEvent[];
  /** Every scenario that exists, with whether it is live. Null when unread. */
  scenarios?: Awaited<ReturnType<typeof scenarioShelf>> | null;
  /** What the last button press did, echoed back off the redirect. */
  notice?: string | null;
  now: string;
}

function budgetHtml(board: FieldStudyDeskData["board"]): string {
  if (!board) {
    return "<p>The field study did not load; the budget is unknown here, not spent.</p>";
  }
  return `<p><strong>Week ${escapeHtml(board.week)}:</strong>
    $${board.spent_this_week_usd.toFixed(2)} of $${board.weekly_budget_usd.toFixed(2)} spent,
    $${board.remaining_this_week_usd.toFixed(2)} left ·
    <strong>${board.studies_enrolled_now}</strong> enrolment${board.studies_enrolled_now === 1 ? "" : "s"} standing ·
    <strong>${board.studies_debriefed_all_time}</strong> debriefed all time for $${board.paid_all_time_usd.toFixed(2)} ·
    payouts ${board.payouts_enabled ? "enabled" : "<strong>disabled</strong> (no field wallet key)"}.
    <small>This cap is kept apart from the bounty board's above on purpose: a busy week of studies must not be able to quietly eat the money set aside for door walks. If one of these two is ever near its ceiling while the other sits untouched, that is the dial to move — not this page.</small></p>
    <p><small>The public room is <a href="/field-study">/field-study</a>. Nothing on this desk is published there: the room gets the shape of the answers and the researchers' own words, never the operator strings or the wallets below.</small></p>`;
}

/**
 * THE ONES THAT GOT AWAY. Enrolled, window lapsed, never debriefed —
 * and the task they typed on the way in is still sitting there, which
 * is why this is worth reading rather than counting. An abandonment
 * with its stated intent attached is a usability report nobody wrote.
 */
function lapsedHtml(studies: StudyRecord[] | null, now: string): string {
  if (!studies) return "<p>The studies did not load.</p>";
  const lapsed = studies.filter(
    (study) =>
      study.status !== "debriefed" &&
      new Date(study.expires_at).getTime() <= new Date(now).getTime(),
  );
  const standing = studies.filter(
    (study) =>
      study.status !== "debriefed" &&
      new Date(study.expires_at).getTime() > new Date(now).getTime(),
  );
  if (lapsed.length === 0 && standing.length === 0) {
    return "<p>Nobody has enrolled and walked away. Nobody has enrolled at all yet, either — check the enrolment count above before reading this as good news.</p>";
  }
  const row = (study: StudyRecord, state: string): string => `<tr>
    <td><code>${escapeHtml(study.study_id)}</code></td>
    <td>${escapeHtml(state)}</td>
    <td>${escapeHtml(study.roster.model)}<br><small>${escapeHtml(study.roster.harness_other ?? study.roster.harness)} · ${escapeHtml(study.roster.autonomy)}</small></td>
    <td>${escapeHtml(study.roster.operator)}</td>
    <td><small>${escapeHtml(study.roster.task)}</small></td>
    <td><small>${escapeHtml(study.roster.found_via)}</small></td>
    <td>${study.payout_to ? "yes" : "<strong>no</strong>"}</td>
    <td>${escapeHtml(study.enrolled_at.slice(0, 16))}</td>
  </tr>`;
  return `<table>
    <tr><th>study</th><th>state</th><th>who</th><th>operator</th><th>the task they typed</th><th>found us via</th><th>payout given?</th><th>enrolled</th></tr>
    ${standing.map((study) => row(study, "still open")).join("\n")}
    ${lapsed.map((study) => row(study, "lapsed, never debriefed")).join("\n")}
  </table>
  <p><small><strong>${lapsed.length}</strong> lapsed without debriefing. Read the task column before concluding anything: an agent that enrolled, wrote down what it came for, and then never bought a thing is either a door that failed it or a reward that was not worth the walk — and the two look identical from here. The only way to tell them apart is to walk the task yourself.</small></p>`;
}

function findingsHtml(findings: StudyFindings | null): string {
  if (!findings) return "<p>The findings did not load.</p>";
  if (findings.studies === 0) {
    return `<p>${escapeHtml(findings.caveat)}</p>`;
  }
  const surfaceRows = findings.surfaces
    .map(
      (surface) =>
        `<tr><td><code>${escapeHtml(surface.observed)}</code></td><td>${surface.studies}</td><td>${surface.legs}</td><td>${surface.settled}</td></tr>`,
    )
    .join("\n");
  const railRows = findings.rails
    .map(
      (rail) =>
        `<tr><td><code>${escapeHtml(rail.network)}</code></td><td>${rail.studies}</td><td>${rail.legs}</td><td>${rail.settled}</td></tr>`,
    )
    .join("\n");
  return `<p>${escapeHtml(findings.caveat)}</p>
  <p><strong>${findings.studies}</strong> studies · <strong>${findings.distinct_models}</strong> distinct models · <strong>${findings.distinct_harnesses}</strong> distinct harnesses · <strong>${findings.legs}</strong> legs, ${findings.settled_legs} settled.<br>
  Would return: ${findings.would_return.yes} yes / ${findings.would_return.no} no / ${findings.would_return.unclear} unclear ·
  abandoned something: ${findings.abandoned_something.studies} of ${findings.abandoned_something.of_studies} ·
  first x402 door ever: ${findings.prior_x402.no} of ${findings.prior_x402.yes + findings.prior_x402.no}.<br>
  Defects noted: ${findings.defects.total} (${findings.defects.blocking} blocking, ${findings.defects.annoying} annoying, ${findings.defects.cosmetic} cosmetic, ${findings.defects.unrated} unrated) — <small>their severity call, not ours, and not priced.</small></p>
  <h3>Surfaces, as our own books recorded them</h3>
  <table><tr><th>door + protocol</th><th>studies</th><th>legs</th><th>settled</th></tr>${surfaceRows}</table>
  <h3>Rails, as our own books recorded them</h3>
  <table><tr><th>network</th><th>studies</th><th>legs</th><th>settled</th></tr>${railRows}</table>
  <p><strong>Surface confusion:</strong> ${findings.surface_confusion.legs} of ${findings.surface_confusion.of_legs} legs declared a surface our books recorded differently.
  ${findings.surface_confusion.examples.length > 0 ? `<small>${escapeHtml(findings.surface_confusion.examples.join("; "))}</small>` : ""}
  <br><small>Four of the six declarable surfaces land on <code>door: "http"</code> in our books, so a mismatch is at least as likely to be our blindness as their error. It costs the researcher nothing. Read it as a question about our own vocabulary.</small></p>`;
}

/** The studies that paid, with everything the researcher wrote. */
function studiesHtml(studies: StudyRecord[] | null): string {
  if (!studies) return "<p>The studies did not load.</p>";
  const done = studies.filter((study) => study.debrief);
  if (done.length === 0) {
    return "<p>No study has been debriefed yet. Nothing here is zero because a door broke; nothing has happened.</p>";
  }
  return done
    .map((study) => {
      const debrief = study.debrief!;
      const legs = debrief.legs
        .map(
          (leg) => `<tr>
          <td><code>${escapeHtml(leg.purchase_id.slice(0, 16))}…</code></td>
          <td>${escapeHtml(leg.declared.surface)}</td>
          <td><code>${escapeHtml(leg.observed.door)}</code> / ${escapeHtml(leg.observed.protocol)} / ${escapeHtml(leg.observed.network)}</td>
          <td>${escapeHtml(leg.observed.path)}${leg.observed.item ? `<br><small>${escapeHtml(leg.observed.item)}</small>` : ""}</td>
          <td>${leg.observed.settled ? "settled" : "<strong>not settled</strong>"}</td>
          <td>${leg.mismatch ? `<small>${escapeHtml(leg.mismatch)}</small>` : "—"}</td>
        </tr>`,
        )
        .join("\n");
      const answers = Object.entries(debrief.answers)
        .map(
          ([field, value]) =>
            `<p><em>${escapeHtml(field)}:</em> ${escapeHtml(String(value))}</p>`,
        )
        .join("\n");
      const defects = (debrief.defects ?? [])
        .map(
          (defect) =>
            `<li><code>${escapeHtml(defect.where)}</code> — ${escapeHtml(defect.what)} <small>(${escapeHtml(defect.severity ?? "unrated")}, their call)</small></li>`,
        )
        .join("\n");
      const reward = debrief.reward_breakdown;
      return `<details>
      <summary><code>${escapeHtml(study.study_id)}</code> — ${escapeHtml(study.roster.model)} on ${escapeHtml(study.roster.harness_other ?? study.roster.harness)}, $${debrief.reward_usd.toFixed(2)}, ${escapeHtml(debrief.at.slice(0, 16))}</summary>
      <p><strong>Roster, as declared at enrolment:</strong>
        operator <em>${escapeHtml(study.roster.operator)}</em> ·
        ${escapeHtml(study.roster.autonomy)} ·
        ${escapeHtml(study.roster.funding)} ·
        ${study.roster.prior_x402 ? "had paid an x402 door before" : "<strong>first x402 door ever</strong>"} ·
        found us via ${escapeHtml(study.roster.found_via)}<br>
        <em>task:</em> ${escapeHtml(study.roster.task)}<br>
        <em>purpose:</em> ${escapeHtml(study.roster.purpose)}<br>
        <small>payout <code>${escapeHtml(study.payout_to ?? "(none recorded)")}</code>, authorization valid until unix ${escapeHtml(debrief.authorization_valid_before)}</small></p>
      <p><strong>The legs, ours beside theirs:</strong></p>
      <table><tr><th>purchase</th><th>they declared</th><th>our books recorded</th><th>what</th><th>state</th><th>disagreement</th></tr>${legs}</table>
      <p><strong>The reward, derived:</strong> $${reward.base_usd.toFixed(2)} base + $${reward.legs_usd.toFixed(2)} for ${reward.legs_counted} legs + $${reward.surfaces_usd.toFixed(2)} for ${reward.surfaces.length} surfaces + $${reward.rails_usd.toFixed(2)} for ${reward.rails.length} rails = $${reward.subtotal_usd.toFixed(2)}${reward.capped ? `, capped to $${reward.total_usd.toFixed(2)}` : ""}.
      <small>Every input read off our own books. Nothing they wrote touched this number.</small></p>
      <p><strong>What they said</strong> <small>— theirs, verbatim, never graded</small></p>
      ${answers}
      ${defects ? `<p><strong>Defects they noted</strong> <small>— not priced, and worth more than the ones we would have found</small></p><ul>${defects}</ul>` : ""}
    </details>`;
    })
    .join("\n");
}

function ledgerHtml(ledger: StudyLedger | null): string {
  if (!ledger) return "<p>The month's counters did not load.</p>";
  const cell = (organic: number, house: number): string =>
    `${organic}${house ? ` <small>(+${house}h)</small>` : ""}`;
  return `<p><strong>${escapeHtml(ledger.month)}:</strong>
    ${cell(ledger.enrolled, ledger.enrolledHouse)} enrolled ·
    ${cell(ledger.paid, ledger.paidHouse)} paid ·
    ${cell(ledger.refused, ledger.refusedHouse)} refused ·
    ${cell(ledger.errors, ledger.errorsHouse)} errored ·
    ${cell(ledger.empty, ledger.emptyHouse)} empty knocks.
    <small>Organic first, house in brackets. Enrolled far above paid is the number to watch — it means agents are willing and something between the enrolment and the till is stopping them.
    Empty knocks sent none of the fields the door reads — scanners walking every POST with <code>{}</code> — and are refused like any other but kept out of "refused", which counts only callers that tried.</small></p>`;
}

function attemptsHtml(attempts: MetricEvent[]): string {
  if (attempts.length === 0) {
    return "<p>Nothing has been presented at either study door since this ledger opened.</p>";
  }
  const rows = attempts
    .map((event) => {
      const [outcome, ...rest] = (event.note ?? "").split(": ");
      const colour =
        outcome === "paid"
          ? "#2f6b2f"
          : outcome === "error"
            ? "#8c2f1b"
            : outcome === "enrolled"
              ? "#2f4f6b"
              : outcome === "empty"
                ? "#777"
                : "inherit";
      return `<tr>
        <td>${escapeHtml(event.at)}</td>
        <td><code>${escapeHtml(event.item.replace(/^study:/, ""))}</code></td>
        <td><strong style="color:${colour}">${escapeHtml(outcome ?? "")}</strong></td>
        <td>${escapeHtml(rest.join(": "))}</td>
        <td>${event.house ? "house" : event.channel === "infrastructure" ? "infrastructure" : "organic"} / ${escapeHtml(event.channel)}</td>
        <td>${event.user_agent ? escapeHtml(event.user_agent) : "—"}</td>
      </tr>`;
    })
    .join("\n");
  return `<table>
    <tr><th>when</th><th>study</th><th>outcome</th><th>reason</th><th>bucket / channel</th><th>user agent</th></tr>
    ${rows}
  </table>`;
}

/**
 * THE SHELF, WITH ITS BUTTONS.
 *
 * One form per scenario and one for the whole set, because the keeper
 * asked to put these live by pressing one thing and a scenario has
 * nothing to fill in: it is already written, already priced, and
 * already states what our books can and cannot confirm about it.
 *
 * The bonus column is the one worth reading before pressing anything.
 * A scenario with a target pays on what OUR books show. A scenario
 * without one pays nothing extra and says why — those are not lesser
 * scenarios (cold arrival is the most valuable thing on this shelf),
 * they are the ones where a bonus would be paying for the claim rather
 * than the walk.
 */
function shelfHtml(data: FieldStudyDeskData): string {
  if (!data.scenarios) return "<p>The scenario shelf did not load.</p>";
  const live = data.scenarios.filter((row) => row.live).length;
  const rows = data.scenarios
    .map(
      ({ scenario, live: isLive, expires_at }) => `<tr>
      <td>${isLive ? '<strong style="color:#2f6b2f">live</strong>' : "<small>off</small>"}${
        isLive && expires_at
          ? `<br><small>until ${escapeHtml(expires_at.slice(0, 10))}</small>`
          : ""
      }</td>
      <td><strong>${escapeHtml(scenario.title)}</strong><br><small><code>${escapeHtml(scenario.id)}</code></small></td>
      <td><small>${escapeHtml(scenario.question)}</small></td>
      <td>${
        scenario.target
          ? `$${scenario.bonus_usd.toFixed(2)}<br><small>when our books show ${escapeHtml(scenarioTargetSentence(scenario.target))}</small>`
          : "<small>no bonus — nothing here for our books to confirm</small>"
      }</td>
      <td><form method="post" action="/admin/field-study/scenarios">
        <input type="hidden" name="scenario_id" value="${escapeHtml(scenario.id)}">
        <input type="hidden" name="action" value="${isLive ? "close" : "open"}">
        <button type="submit">${isLive ? "take down" : "put live"}</button>
      </form></td>
    </tr>`,
    )
    .join("\n");
  return `${
    data.notice
      ? `<p><strong>${escapeHtml(data.notice)}</strong></p>`
      : ""
  }
  <p><strong>${live}</strong> of ${data.scenarios.length} scenarios live.
  <small>A scenario never picks the product — walkers buy whatever they like — it names a condition of the walk, because the condition is what is being measured. Putting one live is safe to press twice: it extends rather than refuses.</small></p>
  <form method="post" action="/admin/field-study/scenarios" style="display:inline">
    <input type="hidden" name="action" value="open_all">
    <button type="submit">Put the whole shelf live</button>
  </form>
  <form method="post" action="/admin/field-study/scenarios" style="display:inline">
    <input type="hidden" name="action" value="close_all">
    <button type="submit">Take the whole shelf down</button>
  </form>
  <p><small>With a fresh shelf the honest first move is the whole thing: which scenarios anybody actually takes is the question, and choosing for them before a single walk has come in would be guessing at exactly what this instrument exists to stop you guessing at. Taking one down stops new enrolments and never cancels a walk in flight — somebody is out there spending their own money on the strength of a listing we published.</small></p>
  <table>
    <tr><th>state</th><th>scenario</th><th>the question it answers</th><th>bonus</th><th></th></tr>
    ${rows}
  </table>`;
}

export function fieldStudySection(data: FieldStudyDeskData): string {
  return `
  <section>
    <h2>The field study — the week's budget</h2>
    ${budgetHtml(data.board)}
  </section>

  <section>
    <h2>The field study — the scenario shelf</h2>
    ${shelfHtml(data)}
  </section>

  <section>
    <h2>The field study — who enrolled and never came back</h2>
    <p>An enrolment that never debriefed is an agent that walked in,
    wrote down in its own words what it came here to do, and gave up
    before buying anything. It is the most expensive fact this
    instrument collects and it leaves no other trace anywhere in the
    store.</p>
    ${lapsedHtml(data.studies, data.now)}
  </section>

  <section>
    <h2>The field study — what the studies show</h2>
    ${findingsHtml(data.findings)}
  </section>

  <section>
    <h2>The field study — enrolments and debriefs presented</h2>
    ${ledgerHtml(data.ledger)}
    ${attemptsHtml(data.attempts)}
  </section>

  <section>
    <h2>The field study — every debriefed study, in full</h2>
    <p><small>Two tiers on every row and never blended: what our own
    books recorded, and what the researcher wrote. The roster and the
    payout wallet are on this desk and are never republished in the
    public room — that is the promise the debrief door makes at the
    moment of payment.</small></p>
    ${studiesHtml(data.studies)}
  </section>`;
}

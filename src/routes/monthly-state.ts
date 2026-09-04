import { Hono, type Context } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { citeBlock, citeHtml } from "@/lib/cite";
import { listCorpus } from "@/services/corpus";
import { deriveMonthlyState, type MonthReading, type MonthState } from "@/services/monthly-state";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import type { HonoEnv } from "@/types";

/**
 * GET /corpus/month — the state of x402 for the latest calendar month
 * on the chain; ?month=YYYY-MM names an earlier one. GET
 * /corpus/month/{YYYY-MM} is the same state at an address that never
 * changes, for a citation. JSON at the same URLs by Accept. See
 * services/monthly-state.ts for what it is and is not.
 */
export const monthlyStateRoutes = new Hono<HonoEnv>();

function readingRow(label: string, r: MonthReading): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${r.listed}</td><td>${r.probed}</td><td>${r.payable}</td><td>${r.not_payable}</td><td>${r.unreachable}</td><td>${r.offers_seen}</td></tr>`;
}

function stateHtml(state: MonthState): string {
  const defects =
    state.defects.length === 0
      ? `<p class="menu-desc">No failed checks recorded on the probed doors this month.</p>`
      : `<table border="1" cellpadding="6"><tr><th>defect, by its registered name</th><th>door-weeks</th></tr>${state.defects
          .map(
            (row) =>
              `<tr><td><a href="/defects#${escapeHtml(row.id)}">${escapeHtml(row.title)}</a> <code>${escapeHtml(row.id)}</code></td><td>${row.door_weeks}</td></tr>`,
          )
          .join("")}</table>`;
  const networks = Object.entries(state.networks)
    .sort((a, b) => b[1] - a[1])
    .map(([network, count]) => `<code>${escapeHtml(network)}</code> ${count}`)
    .join(" · ");
  const last = state.against_the_last;
  return `<section>
    <p class="menu-desc"><strong>${escapeHtml(state.month)}</strong>, read from ${state.weeks.length} signed week${state.weeks.length === 1 ? "" : "s"} (${state.weeks
      .map((week) => `<a href="/corpus/round/${escapeHtml(week.week)}">${escapeHtml(week.week)}</a>`)
      .join(", ")})${state.batteries.length ? `, verdicts under ${state.batteries.map((battery) => `<code>${escapeHtml(battery)}</code>`).join(" and ")}` : ""}.</p>
    <p class="menu-desc">At month end (week ${escapeHtml(state.closing.week)}): <strong>${state.closing.listed} doors named</strong> by the discovery feeds, <strong>${state.closing.probed} knocked on</strong>, <strong>${state.closing.payable} answered with a challenge a buyer could pay</strong>, ${state.closing.not_payable} answered with one a buyer could not pay as served, ${state.closing.unreachable} did not answer.</p>
    ${networks ? `<p class="menu-meta">Doors per chain at month end, from the offers' own declarations: ${networks}.</p>` : ""}
  </section>
  <section>
    <h2>The month in two readings</h2>
    <table border="1" cellpadding="6">
      <tr><th></th><th>named</th><th>probed</th><th>payable</th><th>not payable</th><th>unreachable</th><th>offers seen</th></tr>
      ${readingRow(`closing week ${state.closing.week}`, state.closing)}
      ${readingRow(`door-weeks over ${state.door_weeks.rounds} round${state.door_weeks.rounds === 1 ? "" : "s"}`, state.door_weeks)}
      ${last ? readingRow(`the month before, ${last.month}, closing week ${last.closing.week}`, last.closing) : ""}
    </table>
    <p class="menu-meta">Two kinds of number, kept apart: the closing week is the state at month end; door-weeks are every round's counts summed, so a door probed in four rounds counts four. Nothing here is divided into a share.${last ? " The month before is beside this one as a reading, and the direction is yours to read." : " This is the first month on the chain; there is nothing before it to set beside."}</p>
  </section>
  <section>
    <h2>Defects, by name</h2>
    ${defects}
    <p class="menu-meta">Names are the store's <a href="/defects">defect vocabulary</a>; a defect is a fact about one challenge at one moment, never about an operator. Counted in door-weeks across the month's rounds.</p>
  </section>
  <section>
    <h2>The gaps, counted against us</h2>
    <p class="menu-desc">${state.our_gaps.not_probed_door_weeks} door-weeks a feed named that a round never reached. ${state.our_gaps.observer_degraded_ticks} ticks where our own vantage was blind, which are nobody's outage. ${state.our_gaps.coverage_suspect_weeks} of ${state.weeks.length} weeks where a feed page arrived with no recognisable cursor, so the named count is a floor.</p>
  </section>
  <section>
    <h2>What this is not</h2>
    <p class="menu-desc">${escapeHtml(state.what_this_is_not)}</p>
    <p class="menu-meta">${escapeHtml(state.how_to_rederive)} The weeks themselves: <a href="/corpus/brief">/corpus/brief</a>. Every door, alphabetical: <a href="/doors">/doors</a>. ${escapeHtml(CORRECTIONS_POINTER)}</p>
  </section>`;
}

async function serveMonth(c: Context<HonoEnv>, month: string | undefined, stable: boolean) {
  const base = c.env.STORE_BASE_URL;
  const html = wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"));
  const { state, known_months } = deriveMonthlyState(await listCorpus(c.env), base, month);
  if (!state) {
    const status = month ? 404 : 200;
    const note = month
      ? `The chain holds no signed week in ${month}.`
      : "The chain holds no signed week yet; the first Sunday round writes the first month.";
    const body = {
      artifact: "monthly_state" as const,
      name: "The state of x402" as const,
      month: null,
      ...(month ? { error: note } : { note }),
      known_months,
      corrections: CORRECTIONS_POINTER,
    };
    return html
      ? c.html(
          renderSimplePage({
            title: "The state of x402, by month",
            description: "The x402 corpus by calendar month: doors named, probed, payable and not, defects by name, the month against the last. Not a ranking.",
            path: "/corpus/month",
            bodyHtml: `<section><p class="menu-desc">${escapeHtml(note)}${known_months.length ? ` Months held: ${known_months.map((m) => `<a href="/corpus/month/${escapeHtml(m)}">${escapeHtml(m)}</a>`).join(", ")}.` : ""}</p></section>`,
          }),
          status,
        )
      : c.json(body, status);
  }
  const monthCite = { base, what: "state of x402, month", which: state.month, observed_at: state.closing.week, url: `${base}/corpus/month/${state.month}` };
  if (!html) {
    return c.json({ ...state, months_held: known_months, corrections: CORRECTIONS_POINTER, ...citeBlock(monthCite) });
  }
  const path = stable ? `/corpus/month/${state.month}` : "/corpus/month";
  return c.html(
    renderSimplePage({
      title: `The state of x402, by month — ${state.month}: ${state.closing.payable} of ${state.closing.probed} probed doors payable at month end`,
      description: `The x402 corpus for ${state.month}: ${state.closing.listed} doors named, ${state.closing.probed} probed, ${state.closing.payable} payable and ${state.closing.not_payable} not at month end, over ${state.weeks.length} signed week${state.weeks.length === 1 ? "" : "s"}; defects by name; the month before beside it. Not a ranking.`,
      path,
      bodyHtml: `${stateHtml(state)}
      ${citeHtml(monthCite, escapeHtml)}
      <section>
        <p class="menu-meta">Months held: ${known_months.map((m) => (m === state.month ? `<strong>${escapeHtml(m)}</strong>` : `<a href="/corpus/month/${escapeHtml(m)}">${escapeHtml(m)}</a>`)).join(", ")}. This month at an address that never changes: <a href="/corpus/month/${escapeHtml(state.month)}">/corpus/month/${escapeHtml(state.month)}</a>. JSON at the same URL with <code>Accept: application/json</code>.</p>
      </section>`,
    }),
  );
}

monthlyStateRoutes.get("/corpus/month", (c) => serveMonth(c, c.req.query("month") ?? undefined, false));
monthlyStateRoutes.get("/corpus/month/:month{[0-9]{4}-[0-9]{2}}", (c) => serveMonth(c, c.req.param("month"), true));

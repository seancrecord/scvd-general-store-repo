import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { GrowthLedger, GrowthMonth, SurfaceDelta } from "@/services/growth";

/**
 * THE GROWTH PAGE (2026-09-11; docs/GROWTH_LEDGER_2026-09.md). Months
 * as columns, newest first, one table per block. The free instruments
 * come first because they are the top of the funnel and the question
 * the keeper asked; the market comes last because it is the weather.
 */

function n(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(value < 10 ? 2 : 1);
}

function record(entries: Record<string, number>): string {
  const rows = Object.entries(entries);
  if (rows.length === 0) return "none";
  return rows.map(([key, value]) => `${escapeHtml(key)} ${value}`).join(", ");
}

function monthHead(months: GrowthMonth[]): string {
  return `<tr><th></th>${months
    .map((m) => `<th>${escapeHtml(m.month)}${m.days_elapsed < 28 ? `<br><small>${m.days_elapsed}d</small>` : ""}</th>`)
    .join("")}</tr>`;
}

function row(label: string, months: GrowthMonth[], cell: (m: GrowthMonth) => string): string {
  return `<tr><td>${label}</td>${months.map((m) => `<td>${cell(m)}</td>`).join("")}</tr>`;
}

function storeHtml(months: GrowthMonth[]): string {
  return `<section>
    <h2>The store, by month</h2>
    <table border="1" cellpadding="4">
      ${monthHead(months)}
      ${row("organic visits", months, (m) => n(m.store.organic_visits))}
      ${row("<small>&nbsp;&nbsp;storefront / instrument / door / evidence / room</small>", months, (m) => {
        const k = m.store.visits_by_kind;
        return `<small>${k.storefront} / ${k.instrument} / ${k.door} / ${k.evidence} / ${k.room}</small>`;
      })}
      ${row("organic 402s", months, (m) => n(m.store.organic_402s))}
      ${row("organic settles", months, (m) => `<strong>${n(m.store.organic_settles)}</strong>`)}
      ${row("settles per 100 asks", months, (m) => n(m.store.settles_per_hundred_402s))}
      ${row("revenue USDC (organic)", months, (m) => n(m.store.revenue_usdc))}
      ${row("settles by rail", months, (m) => `<small>${m.store.settles_by_rail ? record(m.store.settles_by_rail) : "none"}</small>`)}
      ${row("payments refused", months, (m) => n(m.store.organic_declines))}
      ${row("artifacts re-checked", months, (m) => n(m.store.organic_rechecks))}
      ${row("bell rings", months, (m) => n(m.store.bell_rings))}
      ${row("guestbook signatures", months, (m) => n(m.store.guestbook_writes))}
      ${row("bounty claims paid", months, (m) => n(m.store.bounty_claims_paid))}
    </table>
    <p><small>Organic means house and known crawlers kept out at the door. The bell's monthly line began 2026-09-11; earlier months read 0 there because the counter did not exist, not because nobody rang.</small></p>
  </section>`;
}

function loggedHtml(months: GrowthMonth[]): string {
  const logged = months.filter((m) => m.logged);
  if (logged.length === 0) {
    return `<p><small>No month has been logged at close yet; the hourly press writes the first one after this month ends.</small></p>`;
  }
  const rows = logged
    .map((m) => {
      const l = m.logged!;
      const moved = (label: string, then: number, now: number) =>
        then === now ? `${label} ${now}` : `${label} <strong>${then} → ${now}</strong>`;
      return `<li><code>${escapeHtml(m.month)}</code> logged ${escapeHtml(l.at.slice(0, 10))}: ${moved("visits", l.organic_visits, m.store.organic_visits)} · ${moved("402s", l.organic_402s, m.store.organic_402s)} · ${moved("settles", l.organic_settles, m.store.organic_settles)} · ${moved("free uses", l.free_uses, m.free_instruments.total)}</li>`;
    })
    .join("");
  return `<p><small><strong>What the books said at close</strong>, beside what they say now. A figure that moved was moved on purpose — the reclassification walk, a late reconciliation — and both are kept.</small></p><ul>${rows}</ul>`;
}

function instrumentsHtml(months: GrowthMonth[]): string {
  const surfaces = new Map<string, { kind: string; since: string }>();
  for (const m of months) {
    for (const r of m.free_instruments.by_instrument) {
      if (!surfaces.has(r.surface)) surfaces.set(r.surface, { kind: r.kind, since: r.logged_since });
    }
  }
  const ordered = [...surfaces.keys()].sort((a, b) => {
    const newest = months[0];
    const av = newest?.free_instruments.by_instrument.find((r) => r.surface === a)?.organic ?? 0;
    const bv = newest?.free_instruments.by_instrument.find((r) => r.surface === b)?.organic ?? 0;
    return bv - av || a.localeCompare(b);
  });
  const cell = (m: GrowthMonth, surface: string): string => {
    const r = m.free_instruments.by_instrument.find((entry) => entry.surface === surface);
    if (!r) return "<small>—</small>";
    const delta = r.delta === null ? "" : ` <small>(${r.delta > 0 ? "+" : ""}${r.delta})</small>`;
    return `${r.organic}${r.per_day !== null ? ` <small>· ${r.per_day}/d</small>` : ""}${delta}`;
  };
  const lines = ordered
    .map((surface) => {
      const meta = surfaces.get(surface)!;
      return `<tr><td><code>${escapeHtml(surface)}</code> <small>${meta.kind === "argument" ? "<strong>argument</strong>" : "read"} · since ${escapeHtml(meta.since)}</small></td>${months
        .map((m) => `<td>${cell(m, surface)}</td>`)
        .join("")}</tr>`;
    })
    .join("");
  return `<section>
    <h2>The free instruments, and the funnel under them</h2>
    <table border="1" cellpadding="4">
      ${monthHead(months)}
      ${row("free uses, organic", months, (m) => `<strong>${n(m.free_instruments.total)}</strong>`)}
      ${row("<small>&nbsp;&nbsp;argument-carrying / reads</small>", months, (m) => `<small>${m.free_instruments.argument_uses} / ${m.free_instruments.read_uses}</small>`)}
      ${row("<small>&nbsp;&nbsp;by channel</small>", months, (m) => `<small>${record(m.free_instruments.by_channel)}</small>`)}
      ${row("organic 402s", months, (m) => n(m.free_instruments.funnel.organic_402s))}
      ${row("organic settles", months, (m) => n(m.free_instruments.funnel.organic_settles))}
      ${row("asks per 100 argument-carrying checks", months, (m) => n(m.free_instruments.funnel.asks_per_hundred_checks))}
      ${row("settles per 100 argument-carrying checks", months, (m) => n(m.free_instruments.funnel.settles_per_hundred_checks))}
    </table>
    <p><small>Three counts in a row, not a journey: nothing here ties one caller's check to that caller's purchase. <a href="/admin/instruments">The instruments desk</a> does the nearest thing by user-agent inside a window. A dash means the line did not exist that month; the roster's logged-since date is beside each name. Per-day divides by the days the line existed in that month.</small></p>
    <table border="1" cellpadding="4">
      ${monthHead(months)}
      ${lines || `<tr><td colspan="${months.length + 1}">no free instrument has been used yet</td></tr>`}
    </table>
  </section>`;
}

function agentsHtml(months: GrowthMonth[]): string {
  const clients = (m: GrowthMonth): string =>
    m.agents.mcp_clients.map((c) => `${escapeHtml(c.name)} ${c.handshakes}`).join(", ") || "none named";
  const hosts = (m: GrowthMonth): string =>
    m.agents.referrer_hosts.map((h) => `${escapeHtml(h.host)} ${h.visits}`).join(", ") || "none";
  return `<section>
    <h2>Interest from agents</h2>
    <table border="1" cellpadding="4">
      ${monthHead(months)}
      ${row("MCP sessions opened", months, (m) => n(m.agents.mcp_handshakes))}
      ${row("MCP catalogues read", months, (m) => n(m.agents.tools_listed))}
      ${row("MCP tool calls", months, (m) => n(m.agents.tool_calls))}
      ${row("distinct MCP clients (software, not people)", months, (m) => n(m.agents.distinct_mcp_clients))}
      ${row("<small>&nbsp;&nbsp;most seen</small>", months, (m) => `<small>${clients(m)}</small>`)}
      ${row("organic visits by channel", months, (m) => `<small>${record(m.agents.visits_by_channel)}</small>`)}
      ${row("organic 402s by channel", months, (m) => `<small>${record(m.agents.asks_by_channel)}</small>`)}
      ${row("asks moved to known machinery", months, (m) => n(m.agents.known_machinery))}
      ${row("re-checks by artifact age", months, (m) => `<small>${record(m.agents.rechecks_by_age)}</small>`)}
      ${row("referred visits", months, (m) => n(m.agents.referred_visits))}
      ${row("<small>&nbsp;&nbsp;referring hosts</small>", months, (m) => `<small>${hosts(m)}</small>`)}
    </table>
    <p><small>The client census began 2026-08-29 and the referring-host census 2026-09-11; a month before either is unmeasured on that line. Re-checks over a week old are artifacts travelling: somebody whose session did not mint the thing is reading it. The referring hosts are the store's word of mouth with history; <a href="/admin/referrals">the word-of-mouth desk</a> has the last ninety days row by row.</small></p>
  </section>`;
}

function deltaList(rows: SurfaceDelta[]): string {
  if (rows.length === 0) return "none";
  return rows
    .map((r) => `<code>${escapeHtml(r.surface)}</code> ${r.previous} → ${r.organic} <small>(${r.delta > 0 ? "+" : ""}${r.delta})</small>`)
    .join(", ");
}

function demandHtml(months: GrowthMonth[]): string {
  const blocks = months
    .map((m) => {
      const fresh = m.demand.new_surfaces.map((s) => `<code>${escapeHtml(s.surface)}</code> ${s.organic} <small>(${s.kind})</small>`).join(", ") || "none";
      const items = m.demand.items_asked_for.map((i) => `<code>${escapeHtml(i.item)}</code> ${i.organic_402s} asked / ${i.organic_settles} settled`).join(", ") || "none";
      return `<h3>${escapeHtml(m.month)}</h3>
      <p><strong>New this month</strong> — organic use, and none in any earlier month: ${fresh}.</p>
      <p><strong>Rose most</strong> against the month before: ${deltaList(m.demand.risers)}.</p>
      <p><strong>Fell most</strong>: ${deltaList(m.demand.fallers)}.</p>
      <p><strong>Items asked for</strong>: ${items}.</p>`;
    })
    .join("");
  return `<section>
    <h2>Demand: what is new, what moved</h2>
    ${blocks}
    <p><small>A surface is new when the porch first counted organic use of it this month. A surface that got its porch line this month reads as new whether or not anyone used it before the line existed; the roster's dated comments in porch-surface.ts say which lines those are. The first month read has no "new" and no deltas, by construction.</small></p>
  </section>`;
}

function x402Html(months: GrowthMonth[]): string {
  const reading = (m: GrowthMonth, pick: (c: GrowthMonth["x402_economy"]) => string): string =>
    m.x402_economy ? pick(m.x402_economy) : "<small>no signed week</small>";
  const defects = (m: GrowthMonth): string =>
    m.x402_economy?.defects.map((d) => `${escapeHtml(d.id)} ${d.door_weeks}`).join(", ") || "none";
  return `<section>
    <h2>The x402 economy, as the corpus saw it</h2>
    <table border="1" cellpadding="4">
      ${monthHead(months)}
      ${row("signed rounds in the month", months, (m) => reading(m, (x) => String(x!.rounds)))}
      ${row("doors listed (closing week)", months, (m) => reading(m, (x) => String(x!.closing.listed)))}
      ${row("doors probed", months, (m) => reading(m, (x) => String(x!.closing.probed)))}
      ${row("payable", months, (m) => reading(m, (x) => `<strong>${x!.closing.payable}</strong>`))}
      ${row("not payable", months, (m) => reading(m, (x) => String(x!.closing.not_payable)))}
      ${row("unreachable", months, (m) => reading(m, (x) => String(x!.closing.unreachable)))}
      ${row("offers seen", months, (m) => reading(m, (x) => String(x!.closing.offers_seen)))}
      ${row("<small>&nbsp;&nbsp;defects, door-weeks</small>", months, (m) => `<small>${defects(m)}</small>`)}
    </table>
    <p><small>The closing week's reading, off the same signed chain <a href="/corpus/month">/corpus/month</a> serves. Never a ranking; no host is named. A month with no signed week is not measured, which is not the same as zero.</small></p>
  </section>`;
}

export function renderGrowthPage(ledger: GrowthLedger): string {
  const months = ledger.months;
  const floors = months.filter((m) => m.floors.ledger_truncated || m.floors.porch_truncated).map((m) => m.month);
  const body = `<section>
    <h2>Growth</h2>
    <p class="menu-desc">${escapeHtml(ledger.what_this_is)}</p>
    <p><small>${escapeHtml(ledger.what_this_is_not)}</small></p>
    <p><small>Floors: the porch writes at most ${ledger.floors.porch_writes_per_minute} visits a minute per isolate; each month's scan stops at ${ledger.floors.ledger_key_cap} keys${floors.length > 0 ? ` — hit in ${floors.map(escapeHtml).join(", ")}, so those months undercount` : ""}. Porch counting began ${escapeHtml(ledger.porch_counting_since)}; the interactive doors and rooms got their lines ${escapeHtml(ledger.doors_logged_since)}. The same figures as JSON: <a href="/admin/growth.json">/admin/growth.json</a>.</small></p>
    ${loggedHtml(months)}
  </section>
  ${instrumentsHtml(months)}
  ${storeHtml(months)}
  ${agentsHtml(months)}
  ${demandHtml(months)}
  ${x402Html(months)}`;
  return renderAdminShell("growth", body);
}

import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import {
  OUTREACH_STATUSES,
  WIRE_PAUSED_SINCE,
  contactEmail,
  draftNote,
  draftWelcome,
  type OutreachLedger,
  type Prospect,
  type Welcome,
} from "@/services/outreach";
import type { WardRound } from "@/services/ward-round";
import type { CitationWatchReport, CitationWatchRow } from "@/services/citation-watch";

/**
 * THE OUTREACH PAGE — the keeper's private work queue, and nothing
 * else's. Every row here is licensed by the ward's own standing line
 * ("private readings for outreach"); every draft is a dated
 * observation the recipient can verify without trusting us.
 *
 * SINCE 2026-08-20 the page HAS a send button (rule 30 as amended:
 * the keeper's press IS the approval queue; his words — "if im
 * looking at it just give me a button that fires it"). The button
 * fires the WIRE: a live re-probe first, so what goes out is a
 * verified fact seconds old, never the week's stored reading; a door
 * found healed sends nothing and says so. Hand stamps remain for
 * contacts the wire can't reach (no published email).
 */

function prospectCard(
  prospect: Prospect,
  ledger: OutreachLedger,
  base: string,
): string {
  const entry = ledger.hosts[prospect.host];
  const contacts = entry?.contacts?.length
    ? entry.contacts.map((c) => `<code>${escapeHtml(c)}</code>`).join(" · ")
    : entry?.scout_note
      ? `<em>${escapeHtml(entry.scout_note)} (scouted ${escapeHtml(
          (entry.scouted_at ?? "").slice(0, 10),
        )})</em>`
      : "<em>not scouted yet</em>";
  const status = entry?.status
    ? `<strong>${escapeHtml(entry.status)}</strong> ${escapeHtml(
        (entry.status_at ?? "").slice(0, 10),
      )}`
    : "fresh";
  /**
   * "mark sent", never "sent" (2026-08-19): the bare word was read as
   * a send button and pressed down the whole queue. These are stamps
   * for work the keeper's own hand already did somewhere else.
   */
  const stampLabel: Record<string, string> = {
    sent: "mark sent — I delivered it myself",
    replied: "mark replied",
    fixed: "mark fixed",
    skip: "skip",
  };
  const buttons = OUTREACH_STATUSES.map(
    (option) => `<form method="post" action="/admin/outreach/status" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(prospect.host)}">
      <input type="hidden" name="status" value="${option}">
      <button type="submit">${stampLabel[option] ?? option}</button>
    </form>`,
  ).join(" ");
  const undo =
    entry?.status && !entry.wired
      ? ` <form method="post" action="/admin/outreach/status" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(prospect.host)}">
      <input type="hidden" name="status" value="fresh">
      <button type="submit">undo — back to fresh</button>
    </form>`
      : "";
  const email = contactEmail(entry);
  // THE WIRE (rule 30 as amended 2026-08-20). Only rendered where an
  // email contact exists and no note has ever gone out; the route
  // re-checks both, the button is just the honest surface of it.
  const wire =
    email && entry?.status !== "sent" && entry?.status !== "replied"
      ? `<form method="post" action="/admin/outreach/send" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(prospect.host)}">
      <button type="submit"><strong>verify live &amp; send</strong> to ${escapeHtml(email)}</button>
    </form>
    <span class="menu-meta"> — re-probes the door first; sends only if the defect reproduces right now, once per host ever</span>`
      : entry?.wired
        ? `<span class="menu-meta">wired to ${escapeHtml(entry.sent_to ?? "")} ${escapeHtml((entry.status_at ?? "").slice(0, 16))} (live-verified first)</span>`
        : "";
  // Anchored so the unsent summary at the top can send you straight
  // to this card's draft.
  return `<section id="card-${escapeHtml(prospect.host)}">
    <h3>${escapeHtml(prospect.host)}${prospect.newly_failing ? " <em>· newly failing</em>" : ""}</h3>
    <p class="menu-desc">${escapeHtml(prospect.reason)}</p>
    <p class="menu-meta">contact: ${contacts} · status: ${status}</p>
    <details><summary>the draft (what the wire sends, redrafted from the live probe at press time)</summary>
    <pre>${escapeHtml(draftNote(prospect, base))}</pre></details>
    ${wire ? `<p class="menu-meta">${wire}</p>` : ""}
    <p class="menu-meta"><strong>Stamps, not sends</strong> — these record hand-delivery for contacts the wire can't reach: ${buttons}${undo}</p>
  </section>`;
}

/**
 * The page renders the TOP of each queue, not the whole of it. Built
 * ten days before W35's first full walk (~6,000 doors probed, ~2,000
 * broken at the measured rot rate): a page carrying two thousand
 * inline drafts is megabytes of HTML nobody can work. The ranking is
 * the point — the keeper works the top; the count says what's below.
 * The JSON twin still serves every row (data, not drafts).
 */
function welcomeCard(welcome: Welcome, ledger: OutreachLedger, base: string): string {
  const entry = ledger.hosts[welcome.host];
  const status = entry?.status
    ? `<strong>${escapeHtml(entry.status)}</strong> ${escapeHtml((entry.status_at ?? "").slice(0, 10))}`
    : "fresh";
  const buttons = OUTREACH_STATUSES.map(
    (option) => `<form method="post" action="/admin/outreach/status" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(welcome.host)}">
      <input type="hidden" name="status" value="${option}">
      <button type="submit">${option === "sent" ? "mark sent — I delivered it myself" : option === "skip" ? "skip" : `mark ${option}`}</button>
    </form>`,
  ).join(" ");
  return `<section>
    <h3>${escapeHtml(welcome.host)}${welcome.newly_listed ? " <em>· newly listed</em>" : ""}</h3>
    <p class="menu-desc">${escapeHtml(welcome.reason)} · <a href="/passport/${escapeHtml(welcome.host)}">their passport page</a></p>
    <p class="menu-meta">status: ${status}</p>
    <details><summary>the welcome (hand-delivered; the wire does not carry these)</summary>
    <pre>${escapeHtml(draftWelcome(welcome, base))}</pre></details>
    <p class="menu-meta"><strong>Stamps, not sends:</strong> ${buttons}</p>
  </section>`;
}

/**
 * THE CITATION WATCH on the desk (2026-09-04): the Sunday report on
 * who carries a row — the systems /scorers lists, and the pages the
 * scorers note went to. The button is the same function the cron
 * runs. Nothing here edits a list: a prospect that starts citing is
 * moved to the register by hand, against the five listing facts.
 */
function citationRow(row: CitationWatchRow): string {
  const word: Record<CitationWatchRow["verdict"], string> = {
    cited: "<strong>cited</strong>",
    gone: "<strong>gone</strong> — /scorers names it and its page no longer cites; fix the register",
    silent: "silent — no row on the page yet; expected",
    unreadable: `unreadable${row.reason ? ` (${escapeHtml(row.reason)})` : ""} — not a finding`,
  };
  const cites = row.citations.length
    ? `<br><span class="menu-meta">carries: ${row.citations.slice(0, 3).map((c) => `<code>${escapeHtml(c)}</code>`).join(", ")}${row.citations.length > 3 ? ` +${row.citations.length - 3}` : ""}</span>`
    : "";
  return `<li>${row.kind === "listed" ? "listed" : "prospect"} · <a href="${escapeHtml(row.url)}">${escapeHtml(row.name)}</a> (${escapeHtml(row.dated)}) — ${word[row.verdict]}${cites}</li>`;
}

function citationBlock(report: CitationWatchReport | null): string {
  const button = `<form method="post" action="/admin/citations/run" style="display:inline">
    <button type="submit">Check citations now</button>
  </form>`;
  if (!report) {
    return `<section><h2>Citations — who carries a row</h2>
    <p class="menu-desc">No report yet. The watch reads every page the register (<code>src/store/citing-systems.json</code>) and the prospects file (<code>src/store/citation-prospects.json</code>) name, each Sunday with the ward round, and pages you when a prospect starts carrying a verify or corpus URL. ${button}</p></section>`;
  }
  const news = report.newly_cited.length || report.newly_gone.length
    ? `<p class="menu-desc"><strong>News since the report before:</strong> ${[
        ...report.newly_cited.map((u) => `newly cited: <code>${escapeHtml(u)}</code>`),
        ...report.newly_gone.map((u) => `gone: <code>${escapeHtml(u)}</code>`),
      ].join(" · ")}</p>`
    : `<p class="menu-desc">Nothing moved since the report before.</p>`;
  return `<section><h2>Citations — who carries a row</h2>
  <p class="menu-desc">Read ${escapeHtml(report.checked_at.slice(0, 16).replace("T", " "))} UTC, ${report.rows.length} page${report.rows.length === 1 ? "" : "s"}; runs each Sunday with the ward round, and pages you on a change. A prospect that starts citing goes into the register by your hand, against the five listing facts on <a href="/scorers">/scorers</a>. ${button}</p>
  ${news}
  <ul>${report.rows.map(citationRow).join("\n") || "<li>Both lists are empty; nothing to watch.</li>"}</ul>
  </section>`;
}

/**
 * THE UNSENT LIST (2026-09-04, the keeper's ask: "i can't see the
 * names that have emails that i havent sent to... i just really need
 * a summary of anyone scouted that i havent sent to that i can pull
 * from or send to at the top").
 *
 * Eligibility is exactly what the wire itself enforces and the batch
 * button counts — an email the operator published, and no note ever
 * sent to that host — so the list you read at the top IS the list one
 * press would reach, in the same four-tier order. Nothing here is a
 * new fact: it is the same ledger the cards below carry, named where
 * a scan can find it. The addresses are repeated comma-joined for a
 * hand delivery, because "pull from" and "send to" are the same list.
 */
const SUMMARY_CAP = 50;

function unsentSummary(
  prospects: Prospect[],
  ledger: OutreachLedger,
  renderedHosts: Set<string>,
): string {
  const rows = prospects
    .map((prospect) => ({ prospect, entry: ledger.hosts[prospect.host] }))
    .filter(({ entry }) => {
      // A wired or hand-stamped send is the one-note-per-host promise
      // spent; everything else with an address is still reachable.
      if (entry?.status === "sent" || entry?.status === "replied") return false;
      return contactEmail(entry) !== null;
    })
    .map(({ prospect, entry }) => ({
      prospect,
      entry,
      email: contactEmail(entry) as string,
    }));
  const scoutedNoEmail = prospects.filter((p) => {
    const entry = ledger.hosts[p.host];
    return Boolean(entry?.scouted_at) && contactEmail(entry) === null;
  }).length;
  const unscouted = prospects.filter(
    (p) => !ledger.hosts[p.host]?.scouted_at,
  ).length;
  // One line, not wrapped: the counts are read at a glance, and a
  // phrase broken across source lines is a phrase nothing can find.
  const tail = `<p class="menu-meta">Also on the round: ${scoutedNoEmail} scouted door${scoutedNoEmail === 1 ? "" : "s"} that published no email (hand delivery only — copy the draft from the card), and ${unscouted} not scouted yet (press <em>Scout contacts</em> and they land here if they publish one).</p>`;
  if (!rows.length) {
    return `<section id="unsent">
    <h2>Scouted, with an email, not yet sent (0)</h2>
    <p class="menu-desc">Nobody is waiting: every scouted door with a published
    address has had its one note, or published no address at all.</p>
    ${tail}</section>`;
  }
  // The pause is a fact of the wire, read from the wire itself, so
  // this line cannot outlive it: while it stands, the send buttons
  // below decline and this list is a hand-delivery list.
  const paused = WIRE_PAUSED_SINCE
    ? `<p class="menu-meta"><strong>The wire is paused since ${escapeHtml(WIRE_PAUSED_SINCE)}</strong> — every send button on this page declines while it stands (the domain sits in a spam category and outbound notes deepen it). Until it lifts, these are addresses to deliver by hand, then stamp.</p>`
    : "";
  const shown = rows.slice(0, SUMMARY_CAP);
  const addresses = [...new Set(shown.map((r) => r.email))];
  const paste = addresses.join(", ");
  const items = shown
    .map(({ prospect, entry, email }) => {
      const stamp = entry?.status
        ? ` · <em>stamped ${escapeHtml(entry.status)} ${escapeHtml(
            (entry.status_at ?? "").slice(0, 10),
          )} — no note has gone out</em>`
        : "";
      const draft = renderedHosts.has(prospect.host)
        ? ` · <a href="#card-${escapeHtml(prospect.host)}">the draft</a>`
        : ` · <span class="menu-meta">draft below the render cap — JSON twin carries it</span>`;
      const send = `<form method="post" action="/admin/outreach/send" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(prospect.host)}">
      <button type="submit">verify live &amp; send</button>
    </form>`;
      return `<li><strong>${escapeHtml(prospect.host)}</strong> — <a href="mailto:${escapeHtml(email)}"><code>${escapeHtml(email)}</code></a> · ${escapeHtml(prospect.reason)}${stamp}${draft} ${send}</li>`;
    })
    .join("\n");
  return `<section id="unsent">
  <h2>Scouted, with an email, not yet sent (${rows.length}${rows.length > shown.length ? `, top ${shown.length} named` : ""})</h2>
  <p class="menu-desc">Every host here published an address and has never had a
  note from this desk — the same eligibility the wire enforces, in the same
  four-tier order as the queue below. This is exactly who <em>Verify &amp; send
  to all scouted</em> reaches, ten per press.</p>
  ${paused}
  <p class="menu-meta">The ${addresses.length} address${addresses.length === 1 ? "" : "es"}, comma-joined, to pull into a hand delivery:</p>
  <p><code>${escapeHtml(paste)}</code></p>
  <ol>${items}</ol>
  ${
    rows.length > shown.length
      ? `<p class="menu-meta">…and ${rows.length - shown.length} more with addresses, in the same ranking; they rise as those above are sent or stamped.</p>`
      : ""
  }
  ${tail}</section>`;
}

const WELCOME_RENDER_CAP = 25;
const FRESH_RENDER_CAP = 50;
const WORKED_RENDER_CAP = 100;

export function renderOutreachPage(
  round: WardRound,
  prospects: Prospect[],
  healed: string[],
  ledger: OutreachLedger,
  base: string,
  notice?: string,
  welcomes: Welcome[] = [],
  citations: CitationWatchReport | null = null,
): string {
  const noticeBlock = notice
    ? `<section><p><strong>${escapeHtml(notice)}</strong></p></section>`
    : "";
  const fresh = prospects.filter((p) => !ledger.hosts[p.host]?.status);
  const worked = prospects.filter((p) => ledger.hosts[p.host]?.status);
  const freshShown = fresh.slice(0, FRESH_RENDER_CAP);
  const workedShown = worked.slice(0, WORKED_RENDER_CAP);
  const healedBlock = healed.length
    ? `<section><h2>Came back after outreach</h2>
       <p class="menu-desc">${healed.map((h) => `<code>${escapeHtml(h)}</code>`).join(" · ")}
       — marked sent or replied in this ledger, answering ready this round. Your case-study list.</p></section>`
    : "";
  const unscouted = prospects.filter(
    (p) => !ledger.hosts[p.host]?.scouted_at,
  ).length;
  // The batch wire's own eligibility, counted here so the button
  // says what one press will actually reach.
  const wireEligible = prospects.filter((p) => {
    const entry = ledger.hosts[p.host];
    if (entry?.status === "sent" || entry?.status === "replied") return false;
    return contactEmail(entry) !== null;
  }).length;
  const renderedHosts = new Set([
    ...freshShown.map((p) => p.host),
    ...workedShown.map((p) => p.host),
  ]);
  const body = `
  <h1>Outreach — the queue, drafted; the send, one press</h1>
  ${noticeBlock}
  ${unsentSummary(prospects, ledger, renderedHosts)}
  <p class="menu-desc">Derived from round <strong>${escapeHtml(round.week)}</strong>:
  ${prospects.length} broken doors ranked by four named tiers (newly failing with a
  revenue claim, any claim by size, newly failing, the rest). Rows here are the
  ward's private readings put to their licensed use — telling an operator about
  their own door. The contact scout reads only what operators published to be
  contacted on (security.txt).</p>

  <p class="menu-desc"><strong>The wire sends only verified facts</strong>
  (rule 30 as amended 2026-08-20: your press is the approval; the wire is
  machinery). "Verify live &amp; send" re-probes the door at that moment and
  sends only if the defect reproduces — a healed door sends nothing and gets
  marked fixed instead. One note per host, ever; wired cards never re-arm, and
  Clear-ALL leaves them alone. Cards without a published email keep the old
  flow: copy the draft, deliver by hand, stamp it.</p>

  <form method="post" action="/admin/outreach/scout" style="display:inline">
    <button type="submit">Scout contacts (${unscouted} unscouted, 25 per press)</button>
  </form>
  <form method="post" action="/admin/outreach/send-all" style="display:inline">
    <button type="submit"><strong>Verify &amp; send to all scouted</strong> (${wireEligible} with emails, ${wireEligible > 10 ? "10 per press" : "one press"})</button>
  </form>
  <form method="post" action="/admin/outreach/clear-statuses" style="display:inline">
    <button type="submit">Clear ALL stamps (keeps contacts) — the mispress recovery</button>
  </form>
  <p class="menu-meta">The batch button walks the same wire as each card's own
  button: every host re-probed live at this press, healed doors skipped and
  marked fixed, one note per host ever. Ten per press so what you approve is a
  list you can see; press again for the next ten.</p>

  ${healedBlock}

  ${citationBlock(citations)}

  <h2>Fresh (${fresh.length}${fresh.length > freshShown.length ? `, top ${freshShown.length} shown` : ""})</h2>
  ${freshShown.map((p) => prospectCard(p, ledger, base)).join("\n") || "<p class='empty'>Nothing fresh — every broken door already has a status.</p>"}
  ${
    fresh.length > freshShown.length
      ? `<p class="menu-meta">…and ${fresh.length - freshShown.length} more below these, in the same four-tier ranking. Work the top and stamp as you go — stamped cards leave this queue and the next ${FRESH_RENDER_CAP} rise. Every row (data, not drafts) is in the JSON twin: <code>Accept: application/json</code> on this URL.</p>`
      : ""
  }

  ${(() => {
    const freshWelcomes = welcomes.filter((w) => !ledger.hosts[w.host]?.status);
    const shown = freshWelcomes.slice(0, WELCOME_RENDER_CAP);
    return `<h2>Ready doors — a page to hand them (${freshWelcomes.length}${freshWelcomes.length > shown.length ? `, top ${shown.length} shown` : ""})</h2>
  <p class="menu-desc">The other half of the seller loop: doors that answered READY this round, newly listed first. Nothing here is a finding against anyone, so the note is a welcome — their passport page, the colophon to paste, the free self-check, the standing-note offer, and one priced line. Hand-delivered and stamped; the wire never carries these.</p>
  ${shown.map((w) => welcomeCard(w, ledger, base)).join("\n") || "<p class='empty'>No fresh ready doors — every one already has a stamp, or the round found none.</p>"}`;
  })()}

  ${
    worked.length
      ? `<h2>Worked (${worked.length}${worked.length > workedShown.length ? `, latest ranking's top ${workedShown.length} shown` : ""})</h2>
  ${workedShown.map((p) => prospectCard(p, ledger, base)).join("\n")}`
      : ""
  }`;
  return renderAdminShell("outreach", body);
}

import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import {
  gmailComposeFor,
  splitDraft,
  AUDIT_BATCH_CAP,
  LIVE_READING_FRESH_HOURS,
  OUTREACH_STATUSES,
  VERIFY_BATCH_CAP,
  WIRE_PAUSED_SINCE,
  auditedNotes,
  contactEmail,
  draftWelcome,
  handDraftFor,
  liveReadingFor,
  mailtoFor,
  type OutreachEntry,
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

/** What the scout found, or why it found nothing — one line, both queues. */
function contactsLine(entry: OutreachEntry | undefined): string {
  return entry?.contacts?.length
    ? entry.contacts.map((c) => `<code>${escapeHtml(c)}</code>`).join(" · ")
    : entry?.scout_note
      ? `<em>${escapeHtml(entry.scout_note)} (scouted ${escapeHtml(
          (entry.scouted_at ?? "").slice(0, 10),
        )})</em>`
      : "<em>not scouted yet</em>";
}

/**
 * HAND DELIVERY, ONE PRESS (2026-09-04): the mail client opens with
 * the address, the subject and the whole note already in it. The
 * link sends nothing itself — his client does, and then he stamps.
 */
function handDeliverLink(email: string, draft: string, what: string): string {
  return `<a href="${escapeHtml(gmailComposeFor(email, draft))}" target="_blank" rel="noopener"><strong>open in Gmail — ${what} already written</strong></a> · <a href="${escapeHtml(mailtoFor(email, draft))}">mail app</a> to ${escapeHtml(email)}<span class="menu-meta"> — your client sends it; stamp it afterwards</span>`;
}

/**
 * THE KNOCK BEFORE THE NOTE (2026-09-05). Where the hand road used to
 * show a Gmail link straight off the week's row, it shows this until
 * a live reading exists: one press, one probe by the instrument as
 * deployed now, and the note is written from what that probe saw. A
 * door that answers ready is stamped fixed and gets no note at all.
 * A reading older than a sitting is said to be, and the button is
 * back.
 */
function verifyButton(host: string, entry: OutreachEntry | undefined): string {
  const stale = entry?.live
    ? ` <span class="menu-meta">(the last live reading, ${escapeHtml(entry.live.at.slice(0, 16).replace("T", " "))} UTC, is older than ${LIVE_READING_FRESH_HOURS} hours and no longer arms a note)</span>`
    : "";
  return `<form method="post" action="/admin/outreach/verify" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(host)}">
      <button type="submit"><strong>verify live</strong> — probe the door now, then write the note from that</button>
    </form>${stale}`;
}

function prospectCard(
  prospect: Prospect,
  ledger: OutreachLedger,
  base: string,
): string {
  const entry = ledger.hosts[prospect.host];
  const contacts = contactsLine(entry);
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
  const unsent = entry?.status !== "sent" && entry?.status !== "replied";
  /*
   * THE HAND ROAD DRAFTS FROM THE LIVE READING OR NOT AT ALL
   * (2026-09-05). The Gmail link used to carry the week's stored row;
   * a note went out on a reading the corrected instrument no longer
   * made. Now the link exists only while a fresh live reading does,
   * and the button that takes its place makes that reading.
   */
  const live = liveReadingFor(entry);
  const handDraft = handDraftFor(prospect, entry, base);
  const hand =
    email && unsent && handDraft && live
      ? `<span class="menu-meta">re-probed live ${escapeHtml(live.at.slice(0, 16).replace("T", " "))} UTC — ${escapeHtml(live.verdict === "unreachable" ? "no usable answer" : `failed: ${live.failed.join(", ") || "challenge did not parse"}`)}; the note below is drafted from that reading.</span><br>${handDeliverLink(email, handDraft, "the note")}`
      : email && unsent
        ? verifyButton(prospect.host, entry)
        : "";
  // THE WIRE (rule 30 as amended 2026-08-20). Only rendered where an
  // email contact exists and no note has ever gone out; the route
  // re-checks both, the button is just the honest surface of it.
  const wire =
    email && unsent && WIRE_PAUSED_SINCE
      ? // The wire is paused: its button would only decline, so the
        // card shows the road that works and says why (2026-09-05).
        `<span class="menu-meta">the wire is paused since ${escapeHtml(WIRE_PAUSED_SINCE)} — hand delivery only:</span><br>${hand}`
      : email && unsent
      ? `<form method="post" action="/admin/outreach/send" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(prospect.host)}">
      <button type="submit"><strong>verify live &amp; send</strong> to ${escapeHtml(email)}</button>
    </form>
    <span class="menu-meta"> — re-probes the door first; sends only if the defect reproduces right now, once per host ever</span>
    <br>${hand}`
      : entry?.wired
        ? `<span class="menu-meta">wired to ${escapeHtml(entry.sent_to ?? "")} ${escapeHtml((entry.status_at ?? "").slice(0, 16))} (live-verified first)</span>`
        : "";
  const draftBlock = handDraft
    ? `<details><summary>the note (drafted from the live reading, never the week's row)</summary>
    <pre>${escapeHtml(handDraft)}</pre></details>`
    : `<p class="menu-meta">No note yet: nothing is drafted from the week's row. Press <em>verify live</em> and the note is written from that probe.</p>`;
  // Anchored so the unsent summary at the top can send you straight
  // to this card's draft.
  return `<section id="card-${escapeHtml(prospect.host)}">
    <h3>${escapeHtml(prospect.host)}${prospect.newly_failing ? " <em>· newly failing</em>" : ""}</h3>
    <p class="menu-desc">${escapeHtml(prospect.reason)}</p>
    <p class="menu-meta">contact: ${contacts} · status: ${status}</p>
    ${draftBlock}
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
  const email = contactEmail(entry);
  const draft = draftWelcome(welcome, base);
  const deliver =
    email && entry?.status !== "sent" && entry?.status !== "replied"
      ? `<p class="menu-meta">${handDeliverLink(email, draft, "the welcome")}</p>`
      : "";
  return `<section id="card-${escapeHtml(welcome.host)}">
    <h3>${escapeHtml(welcome.host)}${welcome.newly_listed ? " <em>· newly listed</em>" : ""}</h3>
    <p class="menu-desc">${escapeHtml(welcome.reason)} · <a href="/passport/${escapeHtml(welcome.host)}">their passport page</a></p>
    <p class="menu-meta">contact: ${contactsLine(entry)} · status: ${status}</p>
    <details><summary>the welcome (hand-delivered; the wire does not carry these)</summary>
    <pre>${escapeHtml(draft)}</pre></details>
    ${deliver}
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
 * from or send to at the top"), and since the same evening, BOTH
 * QUEUES ("how do i find contacts for both").
 *
 * Eligibility is exactly what the wire itself enforces and the batch
 * button counts — an email the operator published, and no note ever
 * sent to that host — so the list you read at the top IS the list one
 * press would reach, in each queue's own order. Nothing here is a
 * new fact: it is the same ledger the cards below carry, named where
 * a scan can find it. The addresses are repeated comma-joined for a
 * hand delivery, because "pull from" and "send to" are the same list,
 * and every row opens the mail client with its note already written.
 */
const SUMMARY_CAP = 50;

interface Reachable {
  host: string;
  email: string;
  reason: string;
  entry: OutreachEntry | undefined;
  /** Null on the broken side until a live reading exists to draft from. */
  draft: string | null;
}

function reachable<T extends { host: string; reason: string }>(
  rows: T[],
  ledger: OutreachLedger,
  draft: (row: T) => string | null,
): Reachable[] {
  const out: Reachable[] = [];
  for (const row of rows) {
    const entry = ledger.hosts[row.host];
    // A wired or hand-stamped send is the one-note-per-host promise
    // spent; everything else with an address is still reachable.
    if (entry?.status === "sent" || entry?.status === "replied") continue;
    const email = contactEmail(entry);
    if (!email) continue;
    out.push({ host: row.host, email, reason: row.reason, entry, draft: draft(row) });
  }
  return out;
}

function reachList(
  title: string,
  rows: Reachable[],
  renderedHosts: Set<string>,
  opts: { wire: boolean; what: string; empty: string },
): string {
  if (!rows.length) {
    return `<h3>${title} (0)</h3><p class="menu-desc">${opts.empty}</p>`;
  }
  const shown = rows.slice(0, SUMMARY_CAP);
  const addresses = [...new Set(shown.map((r) => r.email))];
  const items = shown
    .map(({ host, email, reason, entry, draft }) => {
      const stamp = entry?.status
        ? ` · <em>stamped ${escapeHtml(entry.status)} ${escapeHtml(
            (entry.status_at ?? "").slice(0, 10),
          )} — no note has gone out</em>`
        : "";
      const card = renderedHosts.has(host)
        ? ` · <a href="#card-${escapeHtml(host)}">the card</a>`
        : "";
      // While the wire is paused the button only declines, so it is
      // not rendered here: a button that cannot do its job is noise on
      // the one list the keeper works from.
      const send = opts.wire && !WIRE_PAUSED_SINCE
        ? ` <form method="post" action="/admin/outreach/send" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(host)}">
      <button type="submit">verify live &amp; send</button>
    </form>`
        : "";
      /*
       * THE NOTE, READABLE HERE (2026-09-05). The keeper reads mail in
       * a browser: a mailto: opened a desktop client he has never set
       * up, and the note was invisible. So the row carries a Gmail
       * compose link, the mail-app link for anyone else, and the note
       * itself in a box he can read and copy without leaving the page.
       */
      /*
       * NO READING, NO NOTE (2026-09-05). A broken-side row with no
       * fresh live reading carries the verify button where the Gmail
       * link would be, and no tick: there is nothing to have sent.
       */
      if (draft === null) {
        return `<li><strong>${escapeHtml(host)}</strong> — <code>${escapeHtml(email)}</code> · ${escapeHtml(reason)}${stamp}${card} · ${verifyButton(host, entry)}</li>`;
      }
      const { subject, body } = splitDraft(draft);
      const deliver = ` · <a href="${escapeHtml(gmailComposeFor(email, draft))}" target="_blank" rel="noopener"><strong>open in Gmail — ${opts.what} written</strong></a> · <a href="${escapeHtml(mailtoFor(email, draft))}">mail app</a>`;
      const live = liveReadingFor(entry);
      const reading = live
        ? ` · <em>re-probed live ${escapeHtml(live.at.slice(0, 16).replace("T", " "))} UTC: ${escapeHtml(live.verdict === "unreachable" ? "no usable answer" : `failed ${live.failed.join(", ") || "(challenge did not parse)"}`)}</em>`
        : "";
      const note = `<details><summary>read the note</summary>
      <p class="menu-meta">To: <code>${escapeHtml(email)}</code> · Subject: ${escapeHtml(subject)}</p>
      <textarea readonly rows="12" style="width:100%;max-width:60em">${escapeHtml(body)}</textarea></details>`;
      /*
       * THE STAMP IS A CHECKBOX (2026-09-05). The keeper: "what if I
       * do like 25+, then I have to one by one select them?" Each row
       * ticks into the one stamp form at the head of this section; the
       * `form` attribute keeps the row free of a nested form.
       */
      const tick = `<input type="checkbox" name="host" value="${escapeHtml(host)}" form="stamp-many" id="tick-${escapeHtml(host)}"> <label for="tick-${escapeHtml(host)}">sent</label> `;
      return `<li>${tick}<strong>${escapeHtml(host)}</strong> — <code>${escapeHtml(email)}</code> · ${escapeHtml(reason)}${stamp}${reading}${deliver}${card}${send}${note}</li>`;
    })
    .join("\n");
  return `<h3>${title} (${rows.length}${rows.length > shown.length ? `, top ${shown.length} named` : ""})</h3>
  <details><summary>The ${addresses.length} address${addresses.length === 1 ? "" : "es"}, comma-joined</summary>
  <p><code>${escapeHtml(addresses.join(", "))}</code></p>
  <p class="menu-meta">For a roundup you write yourself. Every draft below names ONE door, so never paste one draft to this whole list.</p></details>
  <ol>${items}</ol>
  ${
    rows.length > shown.length
      ? `<p class="menu-meta">…and ${rows.length - shown.length} more with addresses, in the same ranking; they rise as those above are sent or stamped.</p>`
      : ""
  }`;
}

function unsentSummary(
  prospects: Prospect[],
  welcomes: Welcome[],
  ledger: OutreachLedger,
  renderedHosts: Set<string>,
  base: string,
): string {
  const broken = reachable(prospects, ledger, (p) =>
    handDraftFor(p, ledger.hosts[p.host], base),
  );
  const ready = reachable(welcomes, ledger, (w) => draftWelcome(w, base));
  // The rows one press of the batch verify would knock on: reachable,
  // unstamped, and without a reading fresh enough to arm a note.
  const unverified = broken.filter(
    (row) => row.draft === null && !row.entry?.status,
  ).length;
  const verifyMany = unverified
    ? `<form method="post" action="/admin/outreach/verify-many" style="display:inline">
    <button type="submit"><strong>Verify live the next ${Math.min(unverified, VERIFY_BATCH_CAP)}</strong> (${unverified} broken door${unverified === 1 ? "" : "s"} with an address and no live reading)</button>
  </form>
  <span class="menu-meta"> — one probe each by the instrument as it is now; a door that answers ready is stamped fixed and gets no note, the rest get their note written from that probe. Sends nothing.</span>`
    : "";
  const everyone = [...prospects, ...welcomes];
  const scoutedNoEmail = everyone.filter((row) => {
    const entry = ledger.hosts[row.host];
    return Boolean(entry?.scouted_at) && contactEmail(entry) === null;
  }).length;
  const unscouted = everyone.filter(
    (row) => !ledger.hosts[row.host]?.scouted_at,
  ).length;
  // The pause is a fact of the wire, read from the wire itself, so
  // this line cannot outlive it: while it stands, the send buttons
  // below decline and the open-in-mail links are the road that works.
  const paused = WIRE_PAUSED_SINCE
    ? `<p class="menu-meta"><strong>The wire is paused since ${escapeHtml(WIRE_PAUSED_SINCE)}</strong> — every "verify live &amp; send" button on this page declines while it stands (the domain sits in a spam category and outbound notes deepen it). Until it lifts, <strong>verify live, then open in mail</strong> is the road: the probe writes the note, your own client sends it, then you stamp.</p>`
    : "";
  /*
   * THE LAW ON THIS ROAD, SAID WHERE THE ROAD STARTS (2026-09-05). A
   * note on the broken side is drafted from a live reading no older
   * than a sitting, or it does not exist; the week's row never
   * reaches a mail client from here again.
   */
  const law = `<p class="menu-meta"><strong>No live reading, no note.</strong> A broken-door row carries its Gmail link only while a live probe under ${LIVE_READING_FRESH_HOURS} hours old says the defect is still there, and the note is written from that probe — never from the week's row. On 2026-09-05 a note went out from a stored row the corrected instrument no longer agreed with; this is what changed. ${verifyMany}</p>`;
  // One line, not wrapped: the counts are read at a glance, and a
  // phrase broken across source lines is a phrase nothing can find.
  const tail = `<p class="menu-meta">Also on the round: ${scoutedNoEmail} scouted door${scoutedNoEmail === 1 ? "" : "s"} that published no email (hand delivery only — copy the draft from the card), and ${unscouted} not scouted yet (press <em>Scout contacts</em> and they land here if they publish one).</p>`;
  const stampForm = `<form id="stamp-many" method="post" action="/admin/outreach/stamp-many" style="display:inline">
    <input type="hidden" name="status" value="sent">
    <button type="submit"><strong>mark the ticked rows sent — I delivered them myself</strong></button>
  </form>`;
  return `<section id="unsent">
  <h2>Scouted, with an email, not yet sent (${broken.length + ready.length})</h2>
  <p class="menu-desc">Every host here published an address and has never had a
  note from this desk — the same eligibility the wire enforces, in each
  queue's own order. Work a row: <em>open in Gmail</em> puts the note in a
  compose window (or <em>read the note</em> to copy it by hand), you send it,
  you tick the row. Then one press below stamps every ticked row sent and
  they leave this queue.</p>
  ${paused}
  ${law}
  ${stampForm}
  ${reachList("Broken doors — the finding", broken, renderedHosts, {
    wire: true,
    what: "the note",
    empty: "Nobody is waiting on the broken side: every scouted door with a published address has had its one note, or published no address at all.",
  })}
  ${reachList("Ready doors — the welcome", ready, renderedHosts, {
    wire: false,
    what: "the welcome",
    empty: "Nobody is waiting on the ready side: press Scout contacts if the ready doors have not been scouted yet.",
  })}
  ${broken.length + ready.length > 0 ? `<p><button type="submit" form="stamp-many"><strong>mark the ticked rows sent — I delivered them myself</strong></button></p>` : ""}
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
  /*
   * THE DOORS WE WROTE TO, RE-READ (2026-09-05). Two operators wrote
   * back in one afternoon with a fact of ours that did not hold. This
   * is the desk finding the next one first: every door a note went
   * to is knocked on again by the instrument as it is now, and where
   * it disagrees with the row the note came from, the host is named
   * at the top — healed since, or ours to correct; the keeper looks.
   */
  const written = Object.values(ledger.hosts).filter(
    (entry) => entry.status === "sent" || entry.status === "replied",
  ).length;
  const audits = auditedNotes(round, ledger);
  const disagreeing = audits.filter((row) => row.disagrees);
  const auditRow = (row: (typeof audits)[number]): string => {
    const said = row.row
      ? `${row.row.verdict}${row.row.failed.length ? ` (${row.row.failed.join(", ")})` : ""}`
      : "no row this round";
    const live = `${row.audit.verdict}${row.audit.failed.length ? ` (${row.audit.failed.join(", ")})` : ""}`;
    return `<li><strong>${escapeHtml(row.host)}</strong> — ${escapeHtml(row.status)} ${escapeHtml((row.status_at ?? "").slice(0, 10))} · the row says <code>${escapeHtml(said)}</code> · re-read ${escapeHtml(row.audit.at.slice(0, 16).replace("T", " "))} UTC says <code>${escapeHtml(live)}</code>${row.disagrees ? " · <strong>disagree — healed since, or ours: look, and write if it is ours</strong>" : " · agree"}</li>`;
  };
  const auditBlock = written
    ? `<section id="audit"><h2>Doors we wrote to, re-read (${audits.length} of ${written})</h2>
    <p class="menu-desc">A note is a claim with a date on it, and the reply that corrects it arrives on the operator's schedule. This press knocks again, ten doors at a time, oldest re-read first, by the instrument as it is now, and lays the answer beside the row the note came from. Sends nothing.
    <form method="post" action="/admin/outreach/audit-sent" style="display:inline"><button type="submit"><strong>Re-read the next ${Math.min(AUDIT_BATCH_CAP, written)}</strong></button></form></p>
    ${disagreeing.length ? `<p class="menu-desc"><strong>${disagreeing.length} disagree${disagreeing.length === 1 ? "s" : ""}</strong> with the row the note came from — the list a correction may be owed on:</p>` : audits.length ? `<p class="menu-meta">Every door re-read so far agrees with its row.</p>` : ""}
    <ul>${audits.map(auditRow).join("\n")}</ul></section>`
    : "";
  const unscouted = [...prospects, ...welcomes].filter(
    (row) => !ledger.hosts[row.host]?.scouted_at,
  ).length;
  // The batch wire's own eligibility, counted here so the button
  // says what one press will actually reach.
  const wireEligible = prospects.filter((p) => {
    const entry = ledger.hosts[p.host];
    if (entry?.status === "sent" || entry?.status === "replied") return false;
    return contactEmail(entry) !== null;
  }).length;
  const freshWelcomes = welcomes.filter((w) => !ledger.hosts[w.host]?.status);
  const welcomesShown = freshWelcomes.slice(0, WELCOME_RENDER_CAP);
  const renderedHosts = new Set([
    ...freshShown.map((p) => p.host),
    ...workedShown.map((p) => p.host),
    ...welcomesShown.map((w) => w.host),
  ]);
  /*
   * THE BENCH IS AT THE TOP (2026-09-05). The keeper: the scout is
   * the most important loading piece and should be easy to find. So
   * the first thing under the title is the one button that fills the
   * queue, then the queue itself; the prose about the wire and the
   * ranking comes after the work, not before it.
   */
  const body = `
  <h1>Outreach — the queue, drafted; the send, one press</h1>
  ${noticeBlock}
  <section id="bench">
  <form method="post" action="/admin/outreach/scout" style="display:inline">
    <button type="submit"><strong>Scout contacts (${unscouted} unscouted, 25 per press)</strong></button>
  </form>
  <span class="menu-meta"> — reads each door's security.txt for a published address; a found address puts the door on the queue below.</span>
  </section>
  ${unsentSummary(prospects, welcomes, ledger, renderedHosts, base)}
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

  ${
    WIRE_PAUSED_SINCE
      ? `<p class="menu-meta">The batch wire ("verify &amp; send to all scouted") is not drawn while the wire is paused; it would decline every press. ${wireEligible} scouted door${wireEligible === 1 ? "" : "s"} with an email are on the queue above for hand delivery.</p>`
      : `<form method="post" action="/admin/outreach/send-all" style="display:inline">
    <button type="submit"><strong>Verify &amp; send to all scouted</strong> (${wireEligible} with emails, ${wireEligible > 10 ? "10 per press" : "one press"})</button>
  </form>
  <p class="menu-meta">The batch button walks the same wire as each card's own
  button: every host re-probed live at this press, healed doors skipped and
  marked fixed, one note per host ever. Ten per press so what you approve is a
  list you can see; press again for the next ten.</p>`
  }
  <form method="post" action="/admin/outreach/clear-statuses" style="display:inline">
    <button type="submit">Clear ALL stamps (keeps contacts) — the mispress recovery</button>
  </form>

  ${healedBlock}

  ${auditBlock}

  ${citationBlock(citations)}

  <h2>Fresh (${fresh.length}${fresh.length > freshShown.length ? `, top ${freshShown.length} shown` : ""})</h2>
  ${freshShown.map((p) => prospectCard(p, ledger, base)).join("\n") || "<p class='empty'>Nothing fresh — every broken door already has a status.</p>"}
  ${
    fresh.length > freshShown.length
      ? `<p class="menu-meta">…and ${fresh.length - freshShown.length} more below these, in the same four-tier ranking. Work the top and stamp as you go — stamped cards leave this queue and the next ${FRESH_RENDER_CAP} rise. Every row (data, not drafts) is in the JSON twin: <code>Accept: application/json</code> on this URL.</p>`
      : ""
  }

  <h2>Ready doors — a page to hand them (${freshWelcomes.length}${freshWelcomes.length > welcomesShown.length ? `, top ${welcomesShown.length} shown` : ""})</h2>
  <p class="menu-desc">The other half of the seller loop: doors that answered READY this round, newly listed first. Nothing here is a finding against anyone, so the note is a welcome — their passport page, the colophon to paste, the free self-check, the standing-note offer, and one priced line. Hand-delivered and stamped; the wire never carries these. Scout contacts reads their security.txt the same as the broken doors', and a found address puts an open-in-mail link on the card.</p>
  ${welcomesShown.map((w) => welcomeCard(w, ledger, base)).join("\n") || "<p class='empty'>No fresh ready doors — every one already has a stamp, or the round found none.</p>"}

  ${
    worked.length
      ? `<h2>Worked (${worked.length}${worked.length > workedShown.length ? `, latest ranking's top ${workedShown.length} shown` : ""})</h2>
  ${workedShown.map((p) => prospectCard(p, ledger, base)).join("\n")}`
      : ""
  }`;
  return renderAdminShell("outreach", body);
}

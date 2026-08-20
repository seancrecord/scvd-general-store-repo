import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import {
  OUTREACH_STATUSES,
  draftNote,
  type OutreachLedger,
  type Prospect,
} from "@/services/outreach";
import type { WardRound } from "@/services/ward-round";

/**
 * THE OUTREACH PAGE — the keeper's private work queue, and nothing
 * else's. Every row here is licensed by the ward's own standing line
 * ("private readings for outreach"); every draft is a dated
 * observation the recipient can verify without trusting us; and the
 * page has no send button because rule 30 says the hand fires
 * outward actions, so the page's whole job is to make the hand fast:
 * copy the draft, use the published contact, flip the status.
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
  const undo = entry?.status
    ? ` <form method="post" action="/admin/outreach/status" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(prospect.host)}">
      <input type="hidden" name="status" value="fresh">
      <button type="submit">undo — back to fresh</button>
    </form>`
    : "";
  return `<section>
    <h3>${escapeHtml(prospect.host)}${prospect.newly_failing ? " <em>· newly failing</em>" : ""}</h3>
    <p class="menu-desc">${escapeHtml(prospect.reason)}</p>
    <p class="menu-meta">contact: ${contacts} · status: ${status}</p>
    <details><summary>the draft (copy it, send it yourself, then stamp the card)</summary>
    <pre>${escapeHtml(draftNote(prospect, base))}</pre></details>
    <p class="menu-meta"><strong>Stamps, not sends</strong> — pressing these transmits nothing; they record what your hand already did: ${buttons}${undo}</p>
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
const FRESH_RENDER_CAP = 50;
const WORKED_RENDER_CAP = 100;

export function renderOutreachPage(
  round: WardRound,
  prospects: Prospect[],
  healed: string[],
  ledger: OutreachLedger,
  base: string,
): string {
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
  const body = `
  <h1>Outreach — the queue, drafted; the send, yours</h1>
  <p class="menu-desc">Derived from round <strong>${escapeHtml(round.week)}</strong>:
  ${prospects.length} broken doors ranked by four named tiers (newly failing with a
  revenue claim, any claim by size, newly failing, the rest). Rows here are the
  ward's private readings put to their licensed use — telling an operator about
  their own door. Nothing on this page sends anything; drafts are dated
  observations, and the contact scout reads only what operators published to be
  contacted on (security.txt).</p>

  <p class="menu-desc"><strong>Nothing on this page sends anything, ever.</strong>
  The flow per card: press Scout once so the cards carry contacts, copy the
  draft, deliver it yourself (your email for a mailto:, their form for a URL),
  then stamp the card "mark sent" so next week's round can credit the fix to
  the note. The stamps are bookkeeping; the send is your hand (rule 30).</p>

  <form method="post" action="/admin/outreach/scout" style="display:inline">
    <button type="submit">Scout contacts (${unscouted} unscouted, 25 per press)</button>
  </form>
  <form method="post" action="/admin/outreach/clear-statuses" style="display:inline">
    <button type="submit">Clear ALL stamps (keeps contacts) — the mispress recovery</button>
  </form>

  ${healedBlock}

  <h2>Fresh (${fresh.length}${fresh.length > freshShown.length ? `, top ${freshShown.length} shown` : ""})</h2>
  ${freshShown.map((p) => prospectCard(p, ledger, base)).join("\n") || "<p class='empty'>Nothing fresh — every broken door already has a status.</p>"}
  ${
    fresh.length > freshShown.length
      ? `<p class="menu-meta">…and ${fresh.length - freshShown.length} more below these, in the same four-tier ranking. Work the top and stamp as you go — stamped cards leave this queue and the next ${FRESH_RENDER_CAP} rise. Every row (data, not drafts) is in the JSON twin: <code>Accept: application/json</code> on this URL.</p>`
      : ""
  }

  ${
    worked.length
      ? `<h2>Worked (${worked.length}${worked.length > workedShown.length ? `, latest ranking's top ${workedShown.length} shown` : ""})</h2>
  ${workedShown.map((p) => prospectCard(p, ledger, base)).join("\n")}`
      : ""
  }`;
  return renderAdminShell("outreach", body);
}

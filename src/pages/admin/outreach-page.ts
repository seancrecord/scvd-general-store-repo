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
  const buttons = OUTREACH_STATUSES.map(
    (option) => `<form method="post" action="/admin/outreach/status" style="display:inline">
      <input type="hidden" name="host" value="${escapeHtml(prospect.host)}">
      <input type="hidden" name="status" value="${option}">
      <button type="submit">${option}</button>
    </form>`,
  ).join(" ");
  return `<section>
    <h3>${escapeHtml(prospect.host)}${prospect.newly_failing ? " <em>· newly failing</em>" : ""}</h3>
    <p class="menu-desc">${escapeHtml(prospect.reason)}</p>
    <p class="menu-meta">contact: ${contacts} · status: ${status}</p>
    <p class="menu-meta">${buttons}</p>
    <details><summary>the draft (edit before sending — your pen, rule 7)</summary>
    <pre>${escapeHtml(draftNote(prospect, base))}</pre></details>
  </section>`;
}

export function renderOutreachPage(
  round: WardRound,
  prospects: Prospect[],
  healed: string[],
  ledger: OutreachLedger,
  base: string,
): string {
  const fresh = prospects.filter((p) => !ledger.hosts[p.host]?.status);
  const worked = prospects.filter((p) => ledger.hosts[p.host]?.status);
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

  <form method="post" action="/admin/outreach/scout">
    <button type="submit">Scout contacts (${unscouted} unscouted, 25 per press)</button>
  </form>

  ${healedBlock}

  <h2>Fresh (${fresh.length})</h2>
  ${fresh.map((p) => prospectCard(p, ledger, base)).join("\n") || "<p class='empty'>Nothing fresh — every broken door already has a status.</p>"}

  ${
    worked.length
      ? `<h2>Worked (${worked.length})</h2>
  ${worked.map((p) => prospectCard(p, ledger, base)).join("\n")}`
      : ""
  }`;
  return renderAdminShell("outreach", body);
}

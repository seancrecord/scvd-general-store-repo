import type { ClientTrace } from "@/lib/declines";
import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { reachHtml } from "@/pages/admin/declines-page";

/**
 * ONE CLIENT'S WHOLE TRAIL, for a client the keeper names.
 *
 * Built 2026-09-08, and the gap it closes is worth stating because it
 * was invisible from every page. `traceClient` existed and was good.
 * It had exactly one caller: the decline desk, on `busiest` — the one
 * client with the most refusals, picked by the code. There was no way
 * to trace a client you could name. So the questions the office is
 * actually asked ("is the client that priced and walked the same one
 * that got refused?", "did this user-agent ever settle anything?")
 * could not be answered at all, with any password, because the lookup
 * had no door.
 *
 * Worse, the one trace the store did run was spent on whoever declined
 * most — which, when the noise floor outnumbers the buyers, is a peer
 * observatory. The store was tracing its competitors by default and
 * had no way to trace a customer on purpose.
 *
 * THE HANDOFF NAMES ITS CLIENTS FOR THIS PAGE. /admin/instruments
 * prints checker_clients and priced_clients as links here, so
 * "3 priced, 0 settled" stops being a number to believe and becomes
 * three trails to read.
 */
export function renderTracePage(trace: ClientTrace | null): string {
  if (!trace) {
    const body = `
  <section>
    <h2>Trace a client</h2>
    <p>Name a client and get everything it did, in order, oldest first:
    <code>/admin/trace?ua=&lt;user-agent&gt;</code>. The key is the walker key the
    rest of the office uses — the user-agent verbatim, or the literal string
    <code>(no user-agent)</code> for the clients that send none, which are a real
    client and counted like one.</p>
    <p><small>A user-agent is a floor on identity, not an identity: one SDK string
    is many agents, and two agents on one string read as one here exactly as they
    do everywhere else. This page cannot tell them apart and does not pretend to.
    The links on <a href="/admin/instruments">the free instruments page</a> and
    <a href="/admin/declines">the decline desk</a> fill this in for you.</small></p>
  </section>`;
    return renderAdminShell("trace", body, []);
  }

  const rows =
    trace.events.length === 0
      ? '<tr><td colspan="6">Nothing for this client in the rows scanned.</td></tr>'
      : trace.events
          .map((event) => {
            const bucket = event.house
              ? "house"
              : event.channel === "infrastructure"
                ? "infra"
                : "organic";
            const kind =
              event.kind === "settle"
                ? '<strong style="color:#1b6b2f">settled</strong>'
                : event.kind === "decline"
                  ? '<strong style="color:#8c2f1b">declined</strong>'
                  : escapeHtml(event.kind);
            return `<tr><td>${escapeHtml(event.at.slice(0, 19).replace("T", " "))}</td>
              <td>${kind}</td>
              <td>${escapeHtml(event.item)}</td>
              <td>${escapeHtml(event.channel)} <small>(${bucket})</small></td>
              <td><small>${escapeHtml(event.declared_source ?? "none")}</small></td>
              <td><small>${escapeHtml(event.note ?? "")}</small></td></tr>`;
          })
          .join("\n");

  const settles = trace.events.filter((e) => e.kind === "settle").length;
  const declines = trace.events.filter((e) => e.kind === "decline").length;
  const challenges = trace.events.filter((e) => e.kind === "challenge").length;
  const infra = trace.events.some((e) => e.channel === "infrastructure");

  /**
   * The one-line read, and it never says "buyer". Priced-then-refused
   * and priced-then-left are different stories with different fixes,
   * and a client the channel table already calls the noise floor is
   * neither, however many times it signed.
   */
  const shape = infra
    ? `<p style="color:#8c2f1b"><strong>At least one row here is classified
       <code>infrastructure</code>.</strong> This client is on the store's own
       noise-floor list. Whatever it did below, it is not a customer, and any
       count that includes it is not a conversion rate.</p>`
    : settles > 0
      ? `<p>Settled <strong>${settles}</strong> time(s). This client bought.</p>`
      : declines > 0
        ? `<p>Signed and was refused <strong>${declines}</strong> time(s), never settled.
           The reasons are on <a href="/admin/declines">the decline desk</a>; the
           question this trail answers is whether the reason CHANGED between
           attempts, which is the difference between a short wallet and a door
           that cannot be paid.</p>`
        : challenges > 0
          ? `<p>Read <strong>${challenges}</strong> price(s), never signed. Nothing was
             refused, so nothing here is the till's fault: this client looked and left.</p>`
          : `<p>No priced events at all in the rows scanned — free doors only.</p>`;

  const body = `
  <section>
    <h2>${escapeHtml(trace.user_agent)}</h2>
    <p>Everything this client did, in order, oldest first. The sequence is the
    evidence: which items it tried, how many prices it read first, and whether a
    refusal reason changed between attempts.</p>
    ${shape}
    <table border="1" cellpadding="4">
      <tr><th>when (UTC)</th><th>what</th><th>item</th><th>channel</th><th>?src=</th><th>note</th></tr>
      ${rows}
    </table>
    ${reachHtml(trace)}
    <p><small>Keyed by user-agent, which is a floor on identity: one SDK string is
    many agents, and two agents on one string inside the window read as one. Every
    other client-keyed number in this office has the same floor and says so.</small></p>
  </section>`;
  return renderAdminShell("trace", body, []);
}

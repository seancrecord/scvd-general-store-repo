import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import type { McpPass, McpRegister, McpWalkState } from "@/services/mcp-ward";

/**
 * /admin/mcp-ward — the second ward's own crank, at the keeper's ask
 * (2026-09-04: "i also need a way to run the mcp ward separate from
 * the other in admin").
 *
 * IT IS A SEPARATE ROOM FOR THE SAME REASON THE PUBLIC PAGE IS. The
 * two wards share no denominator, so a single console with one Walk
 * button and two sets of numbers on it is the exact affordance that
 * would eventually get their totals added together by somebody in a
 * hurry — most likely by us. Two rooms, two cranks, and neither page
 * quotes the other's figures.
 *
 * WHY THE BUTTON ADVANCES ONE BATCH RATHER THAN RUNNING THE WHOLE
 * PASS. The registry is 909 pages (90,845 rows on 2026-09-04); a
 * pass is many hundreds of page fetches and cannot fit
 * in one request without blowing the invocation budget the audit
 * script exists to police. So the crank does exactly what an hourly
 * firing does — one bounded batch on the stored cursor — and the page
 * says how far along the pass is, so pressing it repeatedly is a
 * legible way to finish one by hand rather than a mystery.
 *
 * THE RESET IS DELIBERATELY BLUNT AND DELIBERATELY SAFE. Starting a
 * fresh pass throws away an in-flight walk's accumulated hosts and
 * nothing else: the register, which holds first_seen and last_seen
 * for every host across all passes, is untouched. A discarded partial
 * pass could never have recorded a delisting anyway.
 */
export function renderMcpWardPage(
  walk: McpWalkState | null,
  register: McpRegister,
  pass: McpPass | null,
): string {
  const onRegister = Object.keys(register.hosts).length;
  const unconfirmed = Object.values(register.hosts).filter(
    (record) => record.unconfirmed,
  ).length;

  const cranks = `<form method="post" action="/admin/mcp-ward/run" style="margin:0.5em 0">
    <button type="submit">Advance the MCP walk one batch</button>
    <span style="opacity:0.7"> — one bounded run of registry pages on the stored cursor, exactly what an hourly firing does. Press it again to keep going; the pass folds into the register the moment the registry's own cursor runs out.</span>
  </form>
  <form method="post" action="/admin/mcp-ward/reset" style="margin:0.5em 0">
    <button type="submit">Start a fresh pass</button>
    <span style="opacity:0.7"> — discards the in-flight walk's cursor and its accumulated hosts. The register (first_seen, last_seen, every host across all passes) is untouched, and a discarded partial pass could not have recorded a delisting anyway.</span>
  </form>`;

  const separate = `<p style="opacity:0.75"><strong>This ward shares no total
  with the x402 ward.</strong> Its population is MCP servers; that one's is
  x402 doors. Nothing on this page may be added to anything on
  <a href="/admin/ward">The ward</a> — the sum would be about nothing, and the
  separate rooms exist so that stays hard to do by accident.</p>`;

  const inFlight =
    walk && !walk.finished_at
      ? `<section>
        <h3>A pass is in flight</h3>
        <ul>
          <li>Started ${escapeHtml(walk.started_at.slice(0, 16))}Z, week ${escapeHtml(walk.week)}.</li>
          <li><strong>${walk.pages_read} registry pages read</strong>, ${walk.servers_seen.toLocaleString("en-US")} rows seen, ${walk.hosts.length.toLocaleString("en-US")} unique hosts so far.</li>
          <li>Cursor: ${walk.cursor ? `<code>${escapeHtml(walk.cursor.slice(0, 60))}</code>` : "at the start"}.</li>
          ${walk.truncated ? `<li><strong>Truncated</strong> — it hit its page ceiling. This pass will record NO delisting when it folds.</li>` : ""}
        </ul>
      </section>`
      : walk?.finished_at
        ? `<section><h3>No pass in flight</h3><p>The last one finished
          ${escapeHtml(walk.finished_at.slice(0, 16))}Z. The next hourly
          firing, or the crank above, starts a fresh one.</p></section>`
        : `<section><h3>No pass in flight</h3><p>Nothing has walked yet.
          The hourly press starts one on its own, or use the crank.</p></section>`;

  const latest = pass
    ? `<section>
      <h3>Last completed pass — ${escapeHtml(pass.week)}</h3>
      <ul>
        <li>${pass.servers_seen.toLocaleString("en-US")} registry rows read; ${pass.servers_with_remote.toLocaleString("en-US")} carried a remote URL; ${pass.hosts_known.toLocaleString("en-US")} unique hosts.</li>
        <li>Rows and hosts differ because a registration can be an npm or stdio server with no network address. Both are published; only quoting hosts would inflate the reachable share.</li>
        <li>Movement: <strong>${pass.appeared.length} appeared</strong>, ${pass.disappeared.length} stopped being listed, ${pass.returned.length} listed again.</li>
        ${
          pass.truncated
            ? `<li><strong>This pass was truncated, so no delisting was recorded from it at all.</strong> A partial read cannot tell a delisting from a page we never reached, and a fabricated one is a wrong claim about somebody's project in a record we do not rewrite.</li>`
            : `<li>It ran to the registry's own end of cursor, so its mortality figures stand.</li>`
        }
        <li>The registry's own status words: ${
          Object.entries(pass.status_counts)
            .sort((a, b) => b[1] - a[1])
            .map(([word, count]) => `<code>${escapeHtml(word)}</code> ${count.toLocaleString("en-US")}`)
            .join(" · ") || "none recorded"
        }. Counted, never reinterpreted.</li>
      </ul>
    </section>`
    : `<section><h3>No completed pass yet</h3><p>Nothing has folded into the
      register. That is this ward's age, not a measurement of an empty
      registry — and the public page says the same rather than showing a
      zero that reads as a finding.</p></section>`;

  return renderAdminShell(
    "mcp-ward",
    `<section>
      <h2>The MCP ward</h2>
      <p>The second ward: it walks the official MCP registry, counts
      registrations, and records when a host stops being listed. <strong>It
      does not knock.</strong> There is no MCP battery in this store to cite,
      and inventing a verdict to match the x402 ward's shape would be worse
      than the gap.</p>
      ${separate}
      ${cranks}
    </section>
    ${inFlight}
    ${latest}
    <section>
      <h3>The register, all passes</h3>
      <ul>
        <li><strong>${onRegister.toLocaleString("en-US")} hosts</strong> have been listed at least once.</li>
        <li>${unconfirmed.toLocaleString("en-US")} are currently written off — absent from the last completed pass. They return to standing the moment a pass lists them again, keeping their original first_seen.</li>
        <li>Last completed pass folded in: ${register.last_pass ? `<code>${escapeHtml(register.last_pass)}</code>` : "none"}.</li>
      </ul>
      <p style="opacity:0.75">The public face of all of this is
      <a href="/mcp-ward">/mcp-ward</a>, JSON at <a href="/mcp-ward.json">/mcp-ward.json</a>.
      Nothing here is private: the ward observes a public registry and issues
      no verdict on anybody, so there is no per-operator finding to hold back
      the way the x402 ward holds its per-host rows.</p>
    </section>`,
  );
}

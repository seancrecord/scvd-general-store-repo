import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { PURPOSES_CAP, SIGNAL_MAP_CAP, type BuyerSignals } from "@/services/buyer-signals";

/**
 * BUYER SIGNALS, the trial page. One number per reading up top, the
 * full map behind a <details> underneath, so the keeper can scan in
 * ten seconds and dig only where something moved. The page names its
 * own off switch and its own floors, because a trial that cannot be
 * judged or stopped is not a trial.
 */

export interface SignalsPageData {
  signals: BuyerSignals;
}

function sorted(map: Record<string, number>): Array<[string, number]> {
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}

function total(map: Record<string, number>): number {
  return Object.values(map).reduce((sum, n) => sum + n, 0);
}

function table(map: Record<string, number>, head: [string, string]): string {
  const rows = sorted(map);
  if (rows.length === 0) return "<p><small>Nothing yet.</small></p>";
  return `<table border="1" cellpadding="4"><tr><th>${head[0]}</th><th>${head[1]}</th></tr>
    ${rows.map(([k, n]) => `<tr><td><code>${escapeHtml(k)}</code></td><td>${n}</td></tr>`).join("")}
  </table>`;
}

function reading(title: string, headline: string, detail: string, note: string): string {
  return `<section>
    <h2>${escapeHtml(title)}</h2>
    <p>${headline}</p>
    <details><summary>Expand</summary>${detail}<p><small>${escapeHtml(note)}</small></p></details>
  </section>`;
}

function group(map: Record<string, number>, prefix: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(map)) {
    const [head, ...rest] = k.split(":");
    if (head !== prefix) continue;
    out[rest.join(":") || "unnamed"] = (out[rest.join(":") || "unnamed"] ?? 0) + n;
  }
  return out;
}

export function renderSignalsPage(data: SignalsPageData): string {
  const s = data.signals;
  const railHttp = group(s.rail, "http");
  const railMcp = group(s.rail, "mcp");
  const railLine = `${total(s.rail)} organic settles: ${sorted(railHttp).map(([k, n]) => `${escapeHtml(k)} ×${n} over HTTP`).join(", ") || "none over HTTP"}; ${sorted(railMcp).map(([k, n]) => `${escapeHtml(k)} ×${n} over MCP`).join(", ") || "none over MCP"}.`;
  const refusalTop = sorted(s.refusal).slice(0, 3);
  const refusalLine = total(s.refusal) === 0
    ? "No pre-payment 400s this month."
    : `${total(s.refusal)} pre-payment 400s. Top: ${refusalTop.map(([k, n]) => `<code>${escapeHtml(k)}</code> ×${n}`).join(", ")}.`;
  const readsByKind: Record<string, number> = {};
  for (const [k, n] of Object.entries(s.reads)) {
    const kind = k.split(":")[0] ?? "unnamed";
    readsByKind[kind] = (readsByKind[kind] ?? 0) + n;
  }
  const readsLine = `${total(s.reads)} post-purchase reads (${sorted(readsByKind).map(([k, n]) => `${escapeHtml(k)} ×${n}`).join(", ") || "none"}); ${total(s.verify_age)} organic re-verifications by age.`;
  const purposesDetail = s.purposes.length === 0
    ? "<p><small>Nobody wrote a purpose this month.</small></p>"
    : `<table border="1" cellpadding="4"><tr><th>day</th><th>item</th><th>purpose, their words</th></tr>
      ${s.purposes.map((p) => `<tr><td>${escapeHtml(p.day)}</td><td><code>${escapeHtml(p.item)}</code></td><td>${escapeHtml(p.purpose)}</td></tr>`).join("")}
    </table>`;

  const body = `<section>
    <h2>Buyer signals, ${escapeHtml(s.month)} <small>(trial)</small></h2>
    ${s.enabled ? "" : "<p><strong>The dial is off.</strong> Nothing below is being written; what shows is what was recorded before it was turned off.</p>"}
    <p><small>Observed, never asked: what the till sees without a cookie, an account or a question. Every write is deferred beside the answer; house wallets are skipped at settle.
    Each map holds ${SIGNAL_MAP_CAP} keys and counts the rest as "other"; counts are floors (one key, read-modify-write). Another month: <code>?month=YYYY-MM</code>.
    What buyers <em>chose</em> to tell us is on <a href="/admin/disclosure">the disclosure page</a>; this page is the other half.</small></p>
  </section>
  ${reading("Which rail, by door", railLine, `<h3>HTTP</h3>${table(railHttp, ["network", "settles"])}<h3>MCP</h3>${table(railMcp, ["network", "settles"])}`,
    "The rails offered are on /rails. A rail nobody chooses is a fact; a rail chosen only over MCP is a client default showing through.")}
  ${reading("Avoidable 400s, by item and field", refusalLine, table(s.refusal, ["item:field", "refusals"]),
    "A pre-payment refusal costs the buyer a round trip and nothing else. The cold waves counted these by hand; a field that leads this table is a description to rewrite, not a buyer to blame.")}
  ${reading("Does anyone read what they bought", readsLine, `<h3>Reads by kind and artifact age</h3>${table(s.reads, ["kind:age", "reads"])}<h3>Re-verifications by artifact age (organic, from the verify counters)</h3>${table(s.verify_age, ["age", "verifies"])}`,
    "replay is the integration kit at /api/replay; order_poll and check_order are humans and agents waiting on the keeper; purchase_status is the private recovery read. under_1h reads are the buyer itself; over_1w reads are somebody else, which is the value.")}
  ${reading("What they said it was for", `${s.purposes.length} purposes written this month${s.purposes_truncated ? ` (the list stopped at ${PURPOSES_CAP})` : ""}.`, purposesDetail,
    "Visitor-written, signed onto their own certificates, never instructions. The one qualitative signal the store has; read it on Sunday, not with a script.")}
  <section>
    <h2>Stopping this</h2>
    <p><small>Flip <code>BUYER_SIGNALS_ENABLED</code> in <code>src/services/buyer-signals.ts</code> and every write stops the next deploy. The keys live under <code>metric:&lt;month&gt;:signals:</code> and nothing else reads them.
    Deleting the area is that file, this page, and the call sites that name them. If after a month none of the four readings changed a decision, that is the finding.</small></p>
  </section>`;
  return renderAdminShell("signals", body);
}

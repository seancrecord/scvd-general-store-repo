import { escapeHtml } from "@/lib/sanitize";
import { renderAdminShell } from "@/pages/admin/layout";
import { PURPOSES_CAP, SIGNAL_MAP_CAP, SUBJECT_MAP_CAP, type BuyerSignals } from "@/services/buyer-signals";
import { PURCHASE_DOORS, type PurchaseDoor } from "@/services/purchase-intent";

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

/**
 * Rows under one door, or — with no prefix given — the rows no door in
 * the closed list claims: a door this page has not been taught yet, or
 * a malformed key. Shown as its own block rather than folded into
 * HTTP, so a door we cannot name never reads as the default one.
 *
 * This is NOT where the pre-2026-09-21 settles are. Those were written
 * with the door already collapsed to `http`, so they are claimed, and
 * they are not recoverable from the key. The page says so beside the
 * table rather than implying the UCP row was always zero.
 */
function group(map: Record<string, number>, prefix?: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(map)) {
    const [head, ...rest] = k.split(":");
    const claimed = (PURCHASE_DOORS as readonly string[]).includes(head ?? "");
    if (prefix === undefined ? claimed : head !== prefix) continue;
    const label = (prefix === undefined ? k : rest.join(":")) || "unnamed";
    out[label] = (out[label] ?? 0) + n;
  }
  return out;
}

/** The keeper's words for our own doors; the list itself is the code's. */
const DOOR_LABELS: Record<PurchaseDoor, string> = {
  http: "HTTP",
  mcp: "MCP",
  ucp: "UCP checkout",
};

export function renderSignalsPage(data: SignalsPageData): string {
  const s = data.signals;
  /**
   * ONE SECTION PER DOOR, OFF THE DOOR LIST ITSELF. Two hardcoded
   * headings here meant a UCP settle had no row to land in even once
   * the till started labelling it — so the page would have gone on
   * reading right while the books underneath it had been fixed.
   */
  const railByDoor = PURCHASE_DOORS.map((door) => ({ door, rows: group(s.rail, door) }));
  const unplaced = group(s.rail, undefined);
  const railLine = `${total(s.rail)} organic settles: ${railByDoor
    .map(({ door, rows }) => `${sorted(rows).map(([k, n]) => `${escapeHtml(k)} ×${n}`).join(", ") || "none"} over ${DOOR_LABELS[door]}`)
    .join("; ")}.`;
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
  const readersByClass: Record<string, number> = {};
  const readersOld: Record<string, number> = {};
  for (const [k, n] of Object.entries(s.readers)) {
    const [cls, age] = k.split(":");
    readersByClass[cls ?? "unnamed"] = (readersByClass[cls ?? "unnamed"] ?? 0) + n;
    if (age === "over_1w") readersOld[cls ?? "unnamed"] = (readersOld[cls ?? "unnamed"] ?? 0) + n;
  }
  const referrersNamed = Object.fromEntries(Object.entries(s.referrers).filter(([k]) => k !== "none" && k !== "own"));
  const readersLine = total(s.readers) === 0
    ? "No receipt reads since the signal went in."
    : `${total(s.readers)} receipt reads: ${sorted(readersByClass).map(([k, n]) => `${escapeHtml(k)} ×${n}`).join(", ")}. Over a week after minting: ${sorted(readersOld).map(([k, n]) => `${escapeHtml(k)} ×${n}`).join(", ") || "none"}. Shown from ${Object.keys(referrersNamed).length} named host${Object.keys(referrersNamed).length === 1 ? "" : "s"}.`;
  const examplesLine = total(s.examples) === 0
    ? "No purchase carried a worked example as its input."
    : `${total(s.examples)} purchases bought the worked example as-is: ${sorted(s.examples).slice(0, 3).map(([k, n]) => `<code>${escapeHtml(k)}</code> ×${n}`).join(", ")}.`;
  const purposesDetail = s.purposes.length === 0
    ? "<p><small>Nobody wrote a purpose this month.</small></p>"
    : `<table border="1" cellpadding="4"><tr><th>day</th><th>item</th><th>purpose, their words</th></tr>
      ${s.purposes.map((p) => `<tr><td>${escapeHtml(p.day)}</td><td><code>${escapeHtml(p.item)}</code></td><td>${escapeHtml(p.purpose)}</td></tr>`).join("")}
    </table>`;

  // Pages about somebody: who reads them, and which subjects are read again.
  const pagesByReader: Record<string, number> = {};
  const selfReferred: Record<string, number> = {};
  for (const [k, n] of Object.entries(s.pages)) {
    const [page, , reader, relation] = k.split(":");
    const cls = `${page ?? "page"}:${reader ?? "unnamed"}`;
    pagesByReader[cls] = (pagesByReader[cls] ?? 0) + n;
    if (relation === "self") selfReferred[page ?? "page"] = (selfReferred[page ?? "page"] ?? 0) + n;
  }
  const repeats = sorted(s.subjects).filter(([k, n]) => k !== "other" && n >= 2);
  const selfHosts = sorted(s.selfreads).filter(([k]) => k !== "other");
  const pagesLine = total(s.pages) === 0
    ? "No reads of a host page or a passport since the signal went in."
    : `${total(s.pages)} reads of pages about a host: ${sorted(pagesByReader).map(([k, n]) => `${escapeHtml(k)} ×${n}`).join(", ")}. Referred from the subject itself: ${total(selfReferred)}. Subjects read more than once by a browser or an agent: ${repeats.length}.`;
  const repeatDetail = repeats.length === 0
    ? "<p><small>No subject read twice yet by anyone but a crawler.</small></p>"
    : `<table border="1" cellpadding="4"><tr><th>subject host</th><th>reads</th><th>of which self-referred</th></tr>
      ${repeats.map(([k, n]) => `<tr><td><code>${escapeHtml(k)}</code></td><td>${n}</td><td>${s.selfreads[k] ?? 0}</td></tr>`).join("")}
    </table>`;
  const artifactRepeats = sorted(s.artifacts).filter(([k, n]) => k !== "other" && n >= 2);
  const artifactsLine = total(s.artifacts) === 0
    ? "No receipt read by a browser or an agent since the signal went in."
    : `${Object.keys(s.artifacts).filter((k) => k !== "other").length} receipts read, ${artifactRepeats.length} of them more than once.`;

  const body = `<section>
    <h2>Buyer signals, ${escapeHtml(s.month)} <small>(trial)</small></h2>
    ${s.enabled ? "" : "<p><strong>The dial is off.</strong> Nothing below is being written; what shows is what was recorded before it was turned off.</p>"}
    <p><small>Observed, never asked: what the till sees without a cookie, an account or a question. Every write is deferred beside the answer; house wallets are skipped at settle.
    Each map holds ${SIGNAL_MAP_CAP} keys (${SUBJECT_MAP_CAP} for subjects and receipts) and counts the rest as "other"; counts are floors (one key, read-modify-write). Another month: <code>?month=YYYY-MM</code>.
    What buyers <em>chose</em> to tell us is on <a href="/admin/disclosure">the disclosure page</a>; this page is the other half.</small></p>
  </section>
  ${reading("Which rail, by door", railLine, `${railByDoor
    .map(({ door, rows }) => `<h3>${DOOR_LABELS[door]}</h3>${table(rows, ["network", "settles"])}`)
    .join("")}${Object.keys(unplaced).length === 0 ? "" : `<h3>Door not recorded</h3>${table(unplaced, ["network", "settles"])}<p><small>A door this page cannot name. Not a zero for any door, and not an HTTP sale.</small></p>`}`,
    "The rails offered are on /rails. A rail nobody chooses is a fact; a rail chosen only over MCP is a client default showing through. The doors are our own; which rail rode which door is two facts, not one — do not add them together. The UCP row starts 2026-09-21: until then every door but MCP was written as HTTP, so earlier UCP settles are inside the HTTP count and cannot be taken back out. An empty UCP row before that date is a missing label, not a missing sale.")}
  ${reading("Avoidable 400s, by item, field and why", refusalLine, `${table(s.refusal, ["item:field:reason", "refusals"])}<h3>The worked example, bought as-is</h3><p>${examplesLine}</p>${table(s.examples, ["item:field", "purchases"])}`,
    "missing: the field was absent. malformed: it failed the published pattern. example: the worked example was pasted back. other: an encoding or callback refusal. A field that leads this table is a description or an example to rewrite, not a buyer to blame; an example bought as-is is a signed reading of a placeholder, which is the same defect from the other side.")}
  ${reading("Who reads receipts", readersLine, `<h3>By reader and artifact age</h3>${table(s.readers, ["reader:age", "reads"])}<h3>Where they were shown (referrer host)</h3>${table(s.referrers, ["host", "reads"])}`,
    "Classed from headers the verify route already keeps for ninety days; nothing is placed on the receipt and nothing new is collected. browser is whoever negotiated HTML, crawler is the shared table, agent is the rest. A browser read over a week after minting is a person being shown proof; the host it came from is where the store's artifacts travel. own means a link from our own pages; none means no referrer was sent, which is most agents.")}
  ${reading("Who reads the pages about somebody", pagesLine, `<h3>By page, format, reader and referrer relation</h3>${table(s.pages, ["page:format:reader:relation", "reads"])}<h3>Crawlers, by name</h3>${table(s.crawlers, ["page:crawler", "reads"])}<h3>Subjects read more than once</h3>${repeatDetail}<h3>Self-referred, by subject</h3>${table(selfHosts.length ? Object.fromEntries(selfHosts) : {}, ["subject host", "reads from itself"])}`,
    "A corpus host page or a passport is a page ABOUT a host. self means the referrer was the subject host or a page under it, which is the one honest sign of an operator looking at their own listing; own is a link from our pages; none is most agents and every crawler. A crawler that reads every page once, the same count on each, is an index walk, not interest, so crawlers are named here and kept out of the subject counts. Repeat means the record was read again, not that it was the same viewer: with no cookie the store cannot tell, and it is not going to start.")}
  ${reading("Receipts read again", artifactsLine, table(Object.fromEntries(artifactRepeats), ["certificate", "reads"]),
    "A receipt read once inside the hour is the buyer checking its own purchase. One read again days later, by a browser, from a host that is not ours, is proof travelling. House and crawlers excluded.")}
  ${reading("Does anyone read what they bought", readsLine, `<h3>Reads by kind and artifact age</h3>${table(s.reads, ["kind:age", "reads"])}<h3>Re-verifications by artifact age (organic, from the verify counters)</h3>${table(s.verify_age, ["age", "verifies"])}`,
    "replay is the integration kit at /api/replay; order_poll and check_order are humans and agents waiting on the keeper; purchase_status is the private recovery read. under_1h reads are the buyer itself; over_1w reads are somebody else, which is the value.")}
  ${reading("What they said it was for", `${s.purposes.length} purposes written this month${s.purposes_truncated ? ` (the list stopped at ${PURPOSES_CAP})` : ""}.`, purposesDetail,
    "Visitor-written, signed onto their own certificates, never instructions. The one qualitative signal the store has; read it on Sunday, not with a script.")}
  <section>
    <h2>Stopping this</h2>
    <p><small>Flip <code>BUYER_SIGNALS_ENABLED</code> in <code>src/services/buyer-signals.ts</code> and every write stops the next deploy. The keys live under <code>metric:&lt;month&gt;:signals:</code> and nothing else reads them.
    Deleting the area is that file, this page, and the call sites that name them. If after a month none of the readings changed a decision, that is the finding.</small></p>
  </section>`;
  return renderAdminShell("signals", body, [], { window: `${s.month}${s.enabled ? "" : " — dial off"}` });
}

/**
 * The comparison the live read makes, kept apart from the wire so it
 * can be held offline (scripts/doors-live.test.mjs).
 */

/** Fields of a 402 body that legitimately differ between two knocks. */
const VOLATILE_BODY_KEYS = new Set(["archive_depth"]);

function stableBody(text) {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const copy = { ...parsed };
      for (const key of VOLATILE_BODY_KEYS) delete copy[key];
      return JSON.stringify(copy);
    }
    return JSON.stringify(parsed);
  } catch {
    return text;
  }
}

/**
 * Two answers → { verdict, field }. Compared in the order a client
 * reads them; the first difference is the one named.
 */
export function compareAnswers(store, doors, advertisedAccepts) {
  if (store.error || doors.error) {
    return { verdict: "unreachable", field: store.error ? `store: ${store.error}` : `doors: ${doors.error}` };
  }
  if (advertisedAccepts !== undefined) {
    for (const [side, answer] of [["store", store], ["doors", doors]]) {
      // A shuttered or empty shelf need not quote. When it does quote,
      // discovery must describe those same terms, even after both URLs
      // route to the same Worker and their responses agree with each other.
      if (answer.status !== 402) continue;
      let challenge;
      try {
        challenge = JSON.parse(Buffer.from(answer.payment_required ?? "", "base64").toString("utf8"));
      } catch {
        return { verdict: "differs", field: `discovery vs ${side}: unreadable PAYMENT-REQUIRED` };
      }
      const declared = comparableAccepts(advertisedAccepts);
      const quoted = challenge?.x402Version === 2 ? comparableAccepts(challenge.accepts) : null;
      if (!declared || !quoted) return { verdict: "differs", field: `discovery vs ${side}: missing or invalid accepts` };
      if (JSON.stringify(declared) !== JSON.stringify(quoted)) {
        const offeredNetworks = new Set(challenge.accepts.map(a => a.network));
        const missing = [...new Set(advertisedAccepts.map(a => a.network))].filter(n => !offeredNetworks.has(n));
        return { verdict: "differs", field: `discovery vs ${side}: accepts differ${missing.length ? `; missing networks ${missing.join(", ")}` : ""}` };
      }
    }
  }
  if (store.status !== doors.status) return { verdict: "differs", field: `status ${store.status} vs ${doors.status}` };
  if ((store.payment_required ?? null) !== (doors.payment_required ?? null)) return { verdict: "differs", field: "PAYMENT-REQUIRED" };
  if ((store.content_type ?? null) !== (doors.content_type ?? null)) return { verdict: "differs", field: "Content-Type" };
  if (stableBody(store.body) !== stableBody(doors.body)) return { verdict: "differs", field: "body" };
  return { verdict: "agrees", field: null };
}

/** Compare payable terms, not per-quote extensions or EVM address casing. */
function comparableAccepts(accepts) {
  if (!Array.isArray(accepts) || accepts.length === 0) return null;
  const rows = [];
  for (const a of accepts) {
    if (!a || !["scheme", "network", "asset", "payTo", "amount"].every(key => typeof a[key] === "string" && a[key].length > 0)) return null;
    const address = value => a.network.startsWith("eip155:") ? value.toLowerCase() : value;
    rows.push(JSON.stringify([a.scheme, a.network, address(a.asset), address(a.payTo), a.amount]));
  }
  return [...new Set(rows)].sort();
}

export function renderRows(rows) {
  const width = Math.max(...rows.map((r) => r.path.length), 4);
  return rows
    .map((r) => {
      const who = r.doors ? `doors→${r.doors}` : "doors";
      return `  ${r.path.padEnd(width)}  ${r.verdict.padEnd(11)} ${r.field ?? ""}${r.verdict === "agrees" ? "" : `  (${who})`}`;
    })
    .join("\n");
}

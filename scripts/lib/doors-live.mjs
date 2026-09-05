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
export function compareAnswers(store, doors) {
  if (store.error || doors.error) {
    return { verdict: "unreachable", field: store.error ? `store: ${store.error}` : `doors: ${doors.error}` };
  }
  if (store.status !== doors.status) return { verdict: "differs", field: `status ${store.status} vs ${doors.status}` };
  if ((store.payment_required ?? null) !== (doors.payment_required ?? null)) return { verdict: "differs", field: "PAYMENT-REQUIRED" };
  if ((store.content_type ?? null) !== (doors.content_type ?? null)) return { verdict: "differs", field: "Content-Type" };
  if (stableBody(store.body) !== stableBody(doors.body)) return { verdict: "differs", field: "body" };
  return { verdict: "agrees", field: null };
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

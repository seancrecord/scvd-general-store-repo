/**
 * The cold read's arithmetic, kept apart from the wire so it can be
 * tested offline against synthetic readings (scripts/cold-read.test.mjs).
 *
 * A READING IS THREE NUMBERS AND A MARKER. For every knock the wire
 * gives us the time from "the request could be sent" to "the headers
 * arrived" (the TLS handshake is subtracted when the socket is new,
 * so a first knock and a reused-socket knock are the same measure),
 * plus the store's own Server-Timing line: whether the isolate that
 * answered was cold, how old it was, and how long the request spent
 * waiting on I/O inside the Worker. The cold penalty is the first
 * knock minus the warm median — the figure nothing on the Cloudflare
 * dashboard reports, because the dashboard's wall time starts after
 * the isolate exists.
 */

/**
 * `isolate;desc=cold, age;dur=12, req;dur=3` → { isolate: "cold",
 * age: 12, req: 3 }. Missing or foreign lines give an empty object;
 * the reading then says "unmarked" rather than guessing.
 */
export function parseServerTiming(header) {
  const out = {};
  if (typeof header !== "string" || header.trim() === "") return out;
  for (const part of header.split(",")) {
    const [rawName, ...params] = part.trim().split(";");
    const name = rawName?.trim();
    if (!name) continue;
    for (const param of params) {
      const [key, value] = param.split("=").map((s) => s.trim());
      if (name === "isolate" && key === "desc") out.isolate = value;
      if (name === "age" && key === "dur") out.age = Number(value);
      if (name === "req" && key === "dur") out.req = Number(value);
    }
  }
  return out;
}

export function median(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * One URL's readings → the figures the table prints. `knocks` is the
 * ordered list of { ms, status, timing } the wire produced; the first
 * is the knock that may have been cold.
 */
export function summarize(knocks) {
  const [first, ...rest] = knocks;
  if (!first) return null;
  const warm = rest.map((k) => k.ms);
  const warmMedian = median(warm);
  const isolate = first.timing?.isolate ?? "unmarked";
  return {
    first_ms: first.ms,
    first_status: first.status,
    first_isolate: isolate,
    first_age_s: first.timing?.age ?? null,
    first_req_ms: first.timing?.req ?? null,
    warm_knocks: rest.length,
    warm_median_ms: warmMedian,
    warm_max_ms: warm.length ? Math.max(...warm) : null,
    // Only a knock the store itself marked cold is a cold penalty;
    // a warm first knock measures nothing but the network.
    cold_penalty_ms:
      isolate === "cold" && warmMedian !== null ? Math.max(0, first.ms - warmMedian) : null,
    statuses: [...new Set(knocks.map((k) => k.status))],
  };
}

/**
 * Had the deploy landed before this knock? The isolate says how many
 * seconds ago it first answered; if that is longer than the time since
 * the push, the isolate predates the push and the reading is of the
 * old script, or of a colo that was never evicted. Either way it is
 * not the reading the workflow came for, and the line says so.
 */
export function deployLanded(firstAgeSeconds, sinceIso, now = Date.now()) {
  if (!sinceIso) return { known: false };
  const since = Date.parse(sinceIso);
  if (!Number.isFinite(since) || firstAgeSeconds === null || firstAgeSeconds === undefined) {
    return { known: false };
  }
  const secondsSincePush = Math.max(0, Math.round((now - since) / 1000));
  return {
    known: true,
    landed: firstAgeSeconds <= secondsSincePush,
    isolate_age_s: firstAgeSeconds,
    seconds_since_push: secondsSincePush,
  };
}

/** A burst's readings (one per door, all fired together) → one row. */
export function summarizeBurst(doors) {
  const answered = doors.filter((d) => Number.isFinite(d.ms));
  const times = answered.map((d) => d.ms);
  const cold = answered.filter((d) => d.timing?.isolate === "cold").length;
  const warm = answered.filter((d) => d.timing?.isolate === "warm").length;
  const challenged = answered.filter((d) => d.status === 402).length;
  return {
    doors: doors.length,
    answered: answered.length,
    challenged_402: challenged,
    cold_isolates: cold,
    warm_isolates: warm,
    unmarked: answered.length - cold - warm,
    min_ms: times.length ? Math.min(...times) : null,
    median_ms: median(times),
    max_ms: times.length ? Math.max(...times) : null,
    slowest: [...answered].sort((a, b) => b.ms - a.ms).slice(0, 3).map((d) => ({
      path: d.path,
      ms: d.ms,
      isolate: d.timing?.isolate ?? "unmarked",
    })),
  };
}

const pad = (v, n) => String(v ?? "-").padStart(n);

export function renderSummary(url, s, landed) {
  const lines = [];
  lines.push(`${url}`);
  lines.push(
    `  first knock   ${pad(s.first_ms, 6)} ms   ${s.first_isolate.padEnd(8)} isolate, age ${s.first_age_s ?? "-"}s, req ${s.first_req_ms ?? "-"}ms, status ${s.first_status}`,
  );
  lines.push(
    `  warm (${s.warm_knocks})      ${pad(s.warm_median_ms, 6)} ms   median, max ${s.warm_max_ms ?? "-"}ms`,
  );
  lines.push(
    s.cold_penalty_ms === null
      ? `  cold penalty       -      (first knock was not cold; nothing to subtract)`
      : `  cold penalty  ${pad(s.cold_penalty_ms, 6)} ms   first knock minus warm median`,
  );
  if (landed?.known) {
    lines.push(
      landed.landed
        ? `  deploy        landed   (isolate ${landed.isolate_age_s}s old, push ${landed.seconds_since_push}s ago)`
        : `  deploy        NOT YET  (isolate ${landed.isolate_age_s}s old predates the push ${landed.seconds_since_push}s ago; this reads the old script)`,
    );
  }
  return lines.join("\n");
}

export function renderBurst(base, b) {
  const lines = [];
  lines.push(`${base} — ${b.doors} doors knocked at once, as the directory does`);
  lines.push(
    `  answered ${b.answered}/${b.doors}, 402 on ${b.challenged_402}; isolates: ${b.cold_isolates} cold, ${b.warm_isolates} warm, ${b.unmarked} unmarked`,
  );
  lines.push(`  min ${b.min_ms ?? "-"}ms  median ${b.median_ms ?? "-"}ms  max ${b.max_ms ?? "-"}ms`);
  for (const s of b.slowest) lines.push(`  slowest  ${pad(s.ms, 6)} ms  ${s.isolate.padEnd(8)} ${s.path}`);
  return lines.join("\n");
}

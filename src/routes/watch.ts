import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { readWatch } from "@/services/standing-watch";
import type { WatchHistory } from "@/services/standing-watch";
import { readConformanceWatch } from "@/services/conformance-watch";
import { nextWeek, type NextWeek } from "@/services/watch-next-week";
import type { HonoEnv } from "@/types";

/**
 * THE WEEK, AS A TABLE A PERSON CAN READ.
 *
 * The history was JSON only, which is right for the contract and
 * wrong for the moment it exists for: the keeper asked what he would
 * actually SEE on the day a watch completes, and sketched an hour-by-
 * hour column of verdicts. That is exactly what the probes are — it
 * had simply never been rendered, so showing anyone a week of signed
 * observation meant showing them raw JSON.
 *
 * THE FOUR VERDICTS SURVIVE THE RENDERING, deliberately. Flattening
 * them to PASS/FAIL would throw away the distinction the artifact was
 * built to carry: `refused` is OURS — the target failed this store's
 * own probe-target law, so no request was made — and printing that as
 * a failure would publish our policy as a fact about somebody's
 * endpoint. `unreachable` is a fact about the network, `not_ready` a
 * fact about the door. Three different sentences, three different
 * words.
 */
const VERDICT_WORD: Record<string, string> = {
  ready: "ready",
  not_ready: "not ready",
  unreachable: "unreachable",
  refused: "refused (ours)",
};

function hourLabel(iso: string): string {
  // "2026-08-21 19:00" — the grain the probes actually run at.
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function watchHistoryHtml(
  history: WatchHistory,
  jsonPath: string,
  kind: string,
  next: NextWeek | null,
): string {
  const rows = history.probes
    .map((probe) => {
      const failed = probe.failed.length > 0 ? probe.failed.join(", ") : "";
      return `<tr>
        <td><code>${escapeHtml(hourLabel(probe.at))}</code></td>
        <td>${escapeHtml(VERDICT_WORD[probe.verdict] ?? probe.verdict)}</td>
        <td>${probe.status === undefined ? "&mdash;" : probe.status}</td>
        <td>${probe.latency_ms === undefined ? "&mdash;" : `${probe.latency_ms} ms`}</td>
        <td>${escapeHtml(failed) || "&mdash;"}</td>
      </tr>`;
    })
    .join("\n");
  const s = history.summary;
  return `<section>
    <p class="menu-desc"><strong>${escapeHtml(history.url)}</strong>, watched
    ${escapeHtml(history.started_at.slice(0, 10))} to
    ${escapeHtml(history.ends_at.slice(0, 10))}${history.complete ? " — complete" : " — still running"}.</p>
    <p class="menu-meta">${s.probes_recorded} observation${s.probes_recorded === 1 ? "" : "s"}
    over ${s.hours_elapsed} elapsed hour${s.hours_elapsed === 1 ? "" : "s"}:
    <strong>${s.ready} ready</strong>, ${s.not_ready} not ready, ${s.unreachable} unreachable.
    ${
      s.hours_unprobed > 0
        ? `<strong>${s.hours_unprobed} hour${s.hours_unprobed === 1 ? "" : "s"} nobody probed</strong> — ours, not the endpoint's, and counted here because a history that hides the watcher's absences is vouching for hours nobody watched.`
        : "No unprobed hours: every elapsed hour of this week was actually looked at."
    }</p>
  </section>
  <section>
    <h2>What we saw, hour by hour</h2>
    ${
      history.probes.length === 0
        ? `<p class="menu-desc">Nothing observed yet. The first probe lands on the store's next hourly rounds; this page fills in as the week goes.</p>`
        : `<table border="1" cellpadding="6">
      <tr><th>when (UTC)</th><th>verdict</th><th>status</th><th>latency</th><th>checks that failed</th></tr>
      ${rows}
    </table>
    <p class="menu-meta">Every row is signed on its own, so a single hour
    survives being quoted alone — the signatures ride the
    <a href="${escapeHtml(jsonPath)}">JSON twin</a>, which is the contract this
    page renders. <em>refused</em> means the target failed this store's own
    probe-target law and no request was made: our policy, never a fact about
    the endpoint.</p>`
    }
  </section>
  <section>
    <h2>What this is not</h2>
    <p class="menu-meta">${escapeHtml(history.what_this_is_not)}</p>
    <p class="menu-meta">${escapeHtml(history.who_pays_and_what_it_buys)}</p>
    <p class="menu-meta">Free to read forever, by anyone, ${escapeHtml(kind)}. The buyer paid for the WATCHING; reading what was seen costs nobody anything.</p>
  </section>
  ${
    next
      ? `<section>
    <h2>When the week is over</h2>
    <p class="menu-desc">${escapeHtml(next.what_now)}</p>
    <p class="menu-meta">${escapeHtml(next.the_rule)} <a href="${escapeHtml(next.buy_url)}">${escapeHtml(String(next.item["name"]))}</a>, ${escapeHtml(String(next.item["price"]))}.</p>
  </section>`
      : ""
  }`;
}

/**
 * GET /api/watch/:watch_id — a standing watch's history. Free forever,
 * like every verification surface here: the buyer paid for the
 * WATCHING, and reading what was seen costs nobody anything. Each
 * probe row carries its own signature, so any single row survives
 * being quoted alone, and the summary counts the hours WE missed
 * (rule 5b — the watcher's gaps are part of the record).
 */
export const watchRoutes = new Hono<HonoEnv>();

watchRoutes.get("/api/watch/:watch_id", async (c) => {
  const watchId = c.req.param("watch_id");
  const history = await readWatch(c.env, watchId);
  if (!history) {
    return c.json(
      {
        error:
          "No watch by that id. Watch ids start with watch_ and come from the purchase response — and if you lost that response, POST /api/claims proves the wallet that paid and hands back every watch it bought.",
      },
      404,
    );
  }
  const next = nextWeek(
    c.env.STORE_BASE_URL,
    "standing_watch",
    history.url,
    history.ends_at,
    history.complete,
  );
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(
      renderSimplePage({
        title: `A week watching ${history.url}`,
        description: `Hour-by-hour signed observations of ${history.url} over one week: what answered, what failed, and the hours nobody watched, counted against the watcher.`,
        path: `/api/watch/${watchId}`,
        bodyHtml: watchHistoryHtml(
          history,
          `/api/watch/${watchId}`,
          "hourly for seven days",
          next,
        ),
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  }
  return c.json(
    { ...history, ...(next ? { the_next_week: next } : {}) },
    200,
    { "Cache-Control": "no-store" },
  );
});

/**
 * GET /api/conformance-watch/:watch_id — a conformance watch's week,
 * same contract as its hourly sibling: free forever, each daily pass
 * signed alone, the days WE missed derived at read and counted
 * against us, and drift stated as recomputable arithmetic.
 */
watchRoutes.get("/api/conformance-watch/:watch_id", async (c) => {
  const history = await readConformanceWatch(c.env, c.req.param("watch_id"));
  if (!history) {
    return c.json(
      { error: "No conformance watch by that id. Ids start with cwatch_ and come from the purchase response." },
      404,
    );
  }
  const next = nextWeek(
    c.env.STORE_BASE_URL,
    "conformance_watch",
    history.url,
    history.ends_at,
    history.complete,
  );
  return c.json(
    { ...history, ...(next ? { the_next_week: next } : {}) },
    200,
    { "Cache-Control": "no-store" },
  );
});

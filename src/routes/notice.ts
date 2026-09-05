import { Hono } from "hono";
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT, prefersMarkdown } from "@/lib/accept";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  buildOperatorNotice,
  type OperatorNotice,
} from "@/services/operator-notice";
import type { HonoEnv } from "@/types";

/**
 * GET /notice — the door an operator arrives at from their own log.
 * GET /notice/{host} — what we observed about that one endpoint.
 *
 * THE LANDING IS LISTED; THE PER-HOST PAGE IS NOT. That split is the
 * naming law, not shyness. The census counts failing doors in
 * aggregates and names nobody, so a page naming one is reachable by
 * the operator and linked from no index of ours. It is registered in
 * the no-orphan guard as deliberately quiet, with that reason written
 * down where the next person will look.
 *
 * NO OUTBOUND REQUEST ON A GET. Everything comes from observations
 * already in the signed chain, so this route cannot be pointed at a
 * third party and used to make the store probe on a stranger's behalf.
 */
export const noticeRoutes = new Hono<HonoEnv>();

const HOST_SHAPE = /^[a-z0-9.:_-]+$/i;

function landingJson(base: string) {
  return {
    what_this_is:
      "The notice desk. This store walks the public x402 directories weekly and records what each door answered; if our calling card is in your access log, this is where the record of your endpoint lives.",
    the_calling_card: [
      "scvd-general-store/1.0 (+https://scvd.store) — the weekly unpaid census.",
      "scvd-walkabout/1.0 (+https://scvd.store/what) x402-launch-check — a paid walk somebody bought against your door.",
    ],
    your_notice: `${base}/notice/{your-hostname}`,
    cost: "Free, no account, no wallet, and nothing to buy to make it go away.",
    why_it_is_not_listed:
      "Doors that failed a round are counted in our public aggregates and never named there; only the ready side is listed. A per-host notice is unlisted for that reason — reachable by the operator, linked from no index of ours.",
    current_state_instead: `POST {"url":"<your endpoint>"} to ${base}/api/preflight/v2 for a live verdict rather than last week's.`,
    the_names_we_use: `${base}/defects`,
  };
}

function landingHtml(base: string): string {
  return renderSimplePage({
    title: "The notice desk",
    description:
      "If this store's calling card is in your access log, here is where the record of your x402 endpoint lives. Free, unlisted, and derived from observations we already published in aggregate.",
    path: "/notice",
    bodyHtml: `
      <p>This store walks the public x402 directories once a week and records
      what each door answered. If you found one of these in your access log,
      that was us:</p>
      <ul>
        <li><code>scvd-general-store/1.0 (+https://scvd.store)</code> — the weekly unpaid census.</li>
        <li><code>scvd-walkabout/1.0 (+https://scvd.store/what) x402-launch-check</code> — a paid walk somebody bought against your door.</li>
      </ul>
      <p><strong>Your record is at <code>/notice/your-hostname</code></strong> —
      for example <code>${escapeHtml(base)}/notice/example.com</code>. It is free,
      there is no account, and there is nothing to buy to make it go away.</p>
      <p><strong>Why it is not listed anywhere.</strong> Doors that failed a
      round are counted in our public aggregates and never named there; only
      the ready side is listed. So a per-host notice is reachable by the
      operator and linked from no index of ours. Unlisted is not secret, and
      the page says so about itself.</p>
      <p>Want the current state rather than last week's? <code>POST
      {"url":"…"}</code> to <a href="/developers"><code>/api/preflight/v2</code></a>.
      The names we use for findings are defined at
      <a href="/defects"><code>/defects</code></a>, each with what would prove
      it wrong.</p>
    `,
  });
}

function noticeMarkdown(notice: OperatorNotice, base: string): string {
  const lines: string[] = [
    `# What we observed about ${notice.host}`,
    "",
    notice.why_you_are_reading_this,
    "",
    `_Assembled ${notice.as_of}. Free._`,
    "",
    "---",
    "",
  ];

  const seen = notice.last_observation;
  if (!seen) {
    lines.push(
      "## We have listed you and never knocked",
      "",
      "Your host is on our enumeration register but no round of ours has probed it, so we have no verdict on your endpoint and will not imply one. That is a fact about our cadence, not about your door.",
      "",
    );
  } else {
    lines.push(
      `## One GET, ${seen.week}, ${seen.at}`,
      "",
      `**Door knocked:** ${seen.url ?? "(not recorded)"}`,
      "",
      `**Verdict:** \`${seen.verdict}\``,
      "",
    );
    if (seen.findings.length === 0) {
      lines.push("No check in the published battery failed on that probe.", "");
    } else {
      lines.push("### Findings", "");
      for (const finding of seen.findings) {
        lines.push(`- **\`${finding.signal}\`**`);
        if (finding.defect_class) {
          lines.push(`  - Class: \`${finding.defect_class}\` — ${base}/defects`);
        }
        if (finding.asserts) lines.push(`  - Asserts: ${finding.asserts}`);
        if (finding.costs) lines.push(`  - Costs you: ${finding.costs}`);
        if (finding.falsified_by) {
          lines.push(`  - This finding is wrong if: ${finding.falsified_by}`);
        }
        lines.push(
          `  - Seen without paying: ${finding.seen_unpaid ? "yes" : "no — a settled payment revealed it"}`,
        );
      }
      lines.push("");
    }
    if (seen.advisories.length > 0) {
      lines.push(
        "### Advisories, which are not failures",
        "",
        ...seen.advisories.map((item) => `- \`${item}\``),
        "",
      );
    }
  }

  lines.push(
    "## Our coverage of you, stated against us",
    "",
    `- Rounds since we first saw your host: **${notice.our_coverage.rounds_since_we_met_you}**`,
    `- Rounds we actually probed: **${notice.our_coverage.rounds_we_probed}**`,
    `- Full record including the weeks we did NOT look, and why: ${notice.our_coverage.history_url}`,
    "",
    "## What this is not",
    "",
    ...notice.what_this_is_not.map((item) => `- ${item}`),
    "",
    "## How to answer",
    "",
    ...notice.how_to_answer.map((item) => `- ${item}`),
    "",
    "---",
    "",
    notice.listing_status,
    "",
  );
  return lines.join("\n");
}

function noticeHtml(notice: OperatorNotice, base: string): string {
  const seen = notice.last_observation;
  const findings = seen?.findings ?? [];

  const observation = !seen
    ? `<h2>We have listed you and never knocked</h2>
       <p>Your host is on our enumeration register but no round of ours has
       probed it, so we have no verdict on your endpoint and will not imply
       one. That is a fact about our cadence, not about your door.</p>`
    : `<h2>One GET, ${escapeHtml(seen.week)}</h2>
       <p><strong>Door knocked:</strong> <code>${escapeHtml(seen.url ?? "(not recorded)")}</code><br>
       <strong>When:</strong> ${escapeHtml(seen.at)}<br>
       <strong>Verdict:</strong> <code>${escapeHtml(seen.verdict)}</code></p>
       ${
         findings.length === 0
           ? "<p>No check in the published battery failed on that probe.</p>"
           : `<div style="overflow-x:auto"><table>
              <thead><tr><th>check</th><th>class</th><th>what it asserts</th><th>wrong if</th></tr></thead>
              <tbody>${findings
                .map(
                  (finding) => `<tr>
                    <td><code>${escapeHtml(finding.signal)}</code></td>
                    <td>${finding.defect_class ? `<code>${escapeHtml(finding.defect_class)}</code>` : "&mdash;"}</td>
                    <td>${escapeHtml(finding.asserts ?? "—")}</td>
                    <td>${escapeHtml(finding.falsified_by ?? "—")}</td>
                  </tr>`,
                )
                .join("")}</tbody></table></div>`
       }
       ${
         seen.advisories.length > 0
           ? `<p><strong>Advisories, which are not failures:</strong> ${seen.advisories
               .map((item) => `<code>${escapeHtml(item)}</code>`)
               .join(", ")}</p>`
           : ""
       }`;

  return renderSimplePage({
    title: `What we observed about ${notice.host}`,
    description: `A free, dated record of what this store's weekly x402 census observed about ${notice.host}, with the method attached and nothing to buy.`,
    path: `/notice/${notice.host}`,
    bodyHtml: `
      <p>${escapeHtml(notice.why_you_are_reading_this)}</p>
      <p><em>Assembled ${escapeHtml(notice.as_of)}. Free.</em></p>
      ${observation}
      <h2>Our coverage of you, stated against us</h2>
      <p>Rounds since we first saw your host:
      <strong>${notice.our_coverage.rounds_since_we_met_you}</strong>. Rounds we
      actually probed: <strong>${notice.our_coverage.rounds_we_probed}</strong>.
      The full record, including every week we did <em>not</em> look and the
      reason, is at
      <a href="${escapeHtml(notice.our_coverage.history_url)}"><code>/corpus/host/${escapeHtml(notice.host)}.json</code></a>.</p>
      <h2>What this is not</h2>
      <ul>${notice.what_this_is_not.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <h2>How to answer</h2>
      <ul>${notice.how_to_answer.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      <p><small>${escapeHtml(notice.listing_status)}</small></p>
      <p><small>The names above are defined at <a href="${escapeHtml(base)}/defects"><code>/defects</code></a>, each with what would prove it wrong.</small></p>
    `,
  });
}

noticeRoutes.get("/notice", (c) => {
  const base = c.env.STORE_BASE_URL;
  const accept = c.req.header("Accept");
  if (wantsHtml(accept, c.req.header("User-Agent"))) {
    return c.html(landingHtml(base), 200, { Vary: VARY_ACCEPT });
  }
  c.header("Vary", VARY_ACCEPT);
  return c.json(landingJson(base));
});

noticeRoutes.get("/notice/:host", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const host = c.req.param("host");
  if (!host || host.length > 253 || !HOST_SHAPE.test(host)) {
    return c.json(
      {
        error:
          "Ask for a hostname, e.g. /notice/example.com. What this desk is, and how to read it, is at /notice.",
        notice_desk: `${base}/notice`,
      },
      400,
    );
  }

  const notice = await buildOperatorNotice(c.env, host, base);

  /*
   * NOINDEX ON EVERY ANSWER, including the miss. A 404 that is
   * indexable still tells a crawler the URL shape exists, and the
   * shape is the part the naming law cares about.
   */
  c.header("X-Robots-Tag", "noindex, nofollow");
  c.header("Vary", VARY_ACCEPT);

  if (!notice) {
    return c.json(
      {
        host: host.toLowerCase(),
        observed: false,
        what_this_means:
          "No feed we read has ever listed this host and no round of ours has probed it, so we have nothing to tell you. That is a fact about our sources, not about your endpoint.",
        get_a_verdict_now: `POST {"url":"<your endpoint>"} to ${base}/api/preflight/v2 — free, no account, no wallet.`,
      },
      404,
    );
  }

  const accept = c.req.header("Accept");
  if (prefersMarkdown(accept, "text/html", c.req.header("User-Agent"))) {
    return new Response(noticeMarkdown(notice, base), {
      headers: {
        "Content-Type": MARKDOWN_MEDIA_TYPE,
        Vary: VARY_ACCEPT,
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }
  if (wantsHtml(accept, c.req.header("User-Agent"))) {
    return c.html(noticeHtml(notice, base), 200);
  }
  return c.json(notice);
});

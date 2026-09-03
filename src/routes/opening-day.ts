import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { kvGetJson } from "@/lib/kv-retry";
import { KV_KEYS } from "@/lib/kv-keys";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import type { HonoEnv } from "@/types";

/**
 * THE OPENING DAY'S ONE URL (roadmap S3, 2026-09-01). The bundle sells
 * three things this store already serves at three addresses; this is
 * the fourth address that names the other three, so a merchant hands
 * a directory one link. It holds no evidence of its own — every claim
 * on it is a link to a record signed elsewhere — and it says so.
 */
export interface OpeningDayRecord {
  cert_id: string;
  host: string;
  url: string;
  check_id: string;
  watch_id: string;
  opened_at: string;
}

export const openingDayRoutes = new Hono<HonoEnv>();

openingDayRoutes.get("/api/opening-day/:cert_id", async (c) => {
  const certId = c.req.param("cert_id");
  const record = await kvGetJson<OpeningDayRecord>(
    c.env.ORDERS,
    KV_KEYS.openingDay(certId),
    "json",
  );
  if (!record) {
    return c.json(
      {
        error:
          "No opening day under that certificate id. The id is on the purchase response and the certificate; the item is /api/buy/opening_day.",
      },
      404,
    );
  }
  const base = c.env.STORE_BASE_URL;
  const body = {
    what_this_is:
      "One merchant's opening day, under one certificate: a real purchase attempt this store made at the door named, a week of daily signed conformance passes on the same door, and the host's endpoint passport. This page holds no evidence of its own — each line below is a link to a record signed where it was made — and it is not a badge: three dated observations, not a grade.",
    host: record.host,
    url: record.url,
    opened_at: record.opened_at,
    certificate: `${base}/api/verify/${record.cert_id}`,
    launch_check: `${base}/api/launch-check/${record.check_id}`,
    conformance_watch: `${base}/api/conformance-watch/${record.watch_id}`,
    passport: `${base}/passport/${record.host}`,
    how_to_verify: [
      "1. The certificate binds the launch walk's evidence_hash in its attests field; the certificate URL re-checks its signature on every load.",
      "2. The walk record is signed on its own at the launch_check URL; each daily pass is signed alone at the conformance_watch URL, with the days we missed derived and counted against us.",
      "3. The passport derives from the public corpus and names the date after which to refuse it. Nothing on this page outlives the records it links.",
    ],
  };
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(body, 200, { "Cache-Control": "public, max-age=300" });
  }
  const row = (label: string, href: string) =>
    `<tr><td>${escapeHtml(label)}</td><td><a href="${escapeHtml(href)}"><code>${escapeHtml(href)}</code></a></td></tr>`;
  return c.html(
    renderSimplePage({
      title: `Opening day: ${record.host}`,
      description: `The opening day of ${record.host} under one certificate: one real purchase attempt, seven daily signed conformance passes, and the endpoint passport — three dated observations at their own signed addresses, never a badge.`,
      path: `/api/opening-day/${certId}`,
      bodyHtml: `<section>
        <p class="menu-desc">${escapeHtml(body.what_this_is)}</p>
        <p class="menu-meta">Opened ${escapeHtml(record.opened_at.slice(0, 10))} for <strong>${escapeHtml(record.host)}</strong>.</p>
      </section>
      <section>
        <h2>The three records</h2>
        <table border="1" cellpadding="6">
          ${row("The purchase certificate", body.certificate)}
          ${row("The launch check, signed stage by stage", body.launch_check)}
          ${row("The conformance watch, one signed pass a day", body.conformance_watch)}
          ${row("The endpoint passport, dated, with its stale-after", body.passport)}
        </table>
      </section>
      <section>
        <h2>How to verify</h2>
        ${body.how_to_verify.map((line) => `<p class="menu-meta">${escapeHtml(line)}</p>`).join("\n")}
      </section>`,
    }),
  );
});

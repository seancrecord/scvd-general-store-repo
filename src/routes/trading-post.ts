import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { PENNY_PAGE_USDC } from "@/lib/payments";
import { escapeHtml, sanitizeText } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { getIssue, listIssues } from "@/services/gazette";
import { recordTip } from "@/services/tips";
import { isRecord, type GazetteIssue, type HonoEnv } from "@/types";

/**
 * The Trading Post and the Gazette rack.
 * POST /api/tip — leave a tip for the keeper's review queue (free).
 * GET /gazette — free index of published issues.
 * GET /gazette/:issue — a penny a copy over x402, markdown.
 */
export const tradingPostRoutes = new Hono<HonoEnv>();

/** The counter-sign: what leaving a tip actually means, in writing. */
const TIP_DISCLOSURE =
  "Fair warning, in writing: if the keeper approves your tip, it may be printed in a Gazette issue and sold for a penny a copy — with your name on it, if you gave one. Credit always; royalties are the glory. Tips are reviewed by a human and never auto-published.";

tradingPostRoutes.post("/api/tip", async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!isRecord(body)) {
    return c.json(
      {
        error:
          'Send JSON: { "tip": "...", "contributor_name": "(optional)", "verified_identity": "(optional)" }.',
      },
      400,
    );
  }
  const stored = await recordTip(c.env, {
    tip: body["tip"],
    contributorName: body["contributor_name"],
    verifiedIdentity: sanitizeText(body["verified_identity"], 300) || undefined,
  });
  if (!stored) {
    return c.json(
      { error: "A tip needs some words in it. 1000 characters, tops." },
      400,
    );
  }
  return c.json(
    {
      message:
        "Tip received and filed for the keeper's review. He reads every one — no exceptions, no robots.",
      tip_id: stored.record.id,
      status: stored.record.status,
      counter_sign: TIP_DISCLOSURE,
      gazette_url: `${c.env.STORE_BASE_URL}/gazette`,
    },
    201,
  );
});

function issueIndexEntry(
  issue: GazetteIssue,
  base: string,
): Record<string, unknown> {
  return {
    issue_number: issue.issue_number,
    title: issue.title,
    date: issue.date,
    price_usdc: PENNY_PAGE_USDC,
    contributors: issue.contributors.map((contributor) => contributor.name),
    url: `${base}/gazette/${issue.issue_number}`,
  };
}

tradingPostRoutes.get("/gazette", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const issues = await listIssues(c.env);
  if (wantsHtml(c.req.header("Accept"))) {
    const issuesHtml =
      issues.length > 0
        ? issues
            .map(
              (issue) => `<div class="menu-item">
          <div class="menu-line">
            <span class="menu-name">Issue no. ${issue.issue_number} — ${escapeHtml(issue.title)}</span>
            <span class="menu-dots"></span>
            <span class="menu-price">$${PENNY_PAGE_USDC}</span>
          </div>
          <p class="menu-meta">${escapeHtml(issue.date.slice(0, 10))} \u2022 <code>/gazette/${issue.issue_number}</code></p>
        </div>`,
            )
            .join("\n")
        : `<p class="empty">The press is warm but the first issue hasn't gone out. Leave a tip at the Trading Post and be in it.</p>`;
    return c.html(
      renderSimplePage({
        title: "The Gazette",
        bodyHtml: `<section>
          <p class="menu-desc">Dispatches assembled by the keeper's own hands from tips left at the Trading Post. Every tip is read and approved by a human before printing — nothing publishes itself around here. A penny a copy; contributors get the credit.</p>
          ${issuesHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    gazette:
      "Dispatches assembled by the keeper from reviewed Trading Post tips. A penny a copy, contributors credited.",
    price_usdc: PENNY_PAGE_USDC,
    leave_a_tip: `POST ${base}/api/tip with { "tip": "...", "contributor_name": "(optional)" }. ${TIP_DISCLOSURE}`,
    issues: issues.map((issue) => issueIndexEntry(issue, base)),
  });
});

/** Unknown or unpublished issues are turned away before the gate. */
const issueCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const raw = c.req.path.replace(/^\/gazette\//, "");
  const issueNumber = /^[0-9]+$/.test(raw) ? parseInt(raw, 10) : Number.NaN;
  const issue = Number.isNaN(issueNumber)
    ? null
    : await getIssue(c.env, issueNumber);
  if (!issue) {
    return c.json(
      {
        error: "No issue by that number off the press yet. The index is free.",
        index_url: `${c.env.STORE_BASE_URL}/gazette`,
      },
      404,
    );
  }
  await next();
};

/** Paid copies never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", "PAYMENT-SIGNATURE");
};

tradingPostRoutes.use("/gazette/:issue", noStore);
tradingPostRoutes.use("/gazette/:issue", issueCheck);
tradingPostRoutes.use("/gazette/:issue", paymentGate);

tradingPostRoutes.get("/gazette/:issue", async (c) => {
  if (!c.get("payment")) {
    // The gate never lets an unpaid request through; belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }
  // issueCheck guarantees the issue exists by the time we're here.
  const issue = (await getIssue(
    c.env,
    parseInt(c.req.param("issue"), 10),
  )) as GazetteIssue;
  return c.text(issue.markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
});

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { paymentGate } from "@/lib/payment-gate";
import { PENNY_PAGE_USDC,
  PAYMENT_VARY,
} from "@/lib/payments";
import { escapeHtml, sanitizeText } from "@/lib/sanitize";
import { renderFoundingHtml } from "@/pages/founding-page";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { getFoundingEdition } from "@/services/founding";
import { getIssue, listIssues } from "@/services/gazette";
import { recordTip } from "@/services/tips";
import { isRecord, type GazetteIssue, type HonoEnv } from "@/types";

/**
 * The Trading Post and the Gazette rack.
 * POST /api/tip, leave a tip for the keeper's review queue (free).
 * GET /gazette, free index of published issues.
 * GET /gazette/:issue, a penny a copy over x402, markdown.
 */
export const tradingPostRoutes = new Hono<HonoEnv>();

/** The counter-sign: what leaving a tip actually means, in writing. */
const TIP_DISCLOSURE =
  "Fair warning, in writing: if the keeper approves your tip, it may be printed in a Gazette issue and sold for a penny a copy, with your name on it, if you gave one. Credit always; royalties are the glory. Tips are reviewed by a human and never auto-published.";

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
        "Tip received and filed for the keeper's review. He reads every one, no exceptions, no robots.",
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
    url: `${base}/gazette/issue-${issue.issue_number}`,
  };
}

tradingPostRoutes.get("/gazette", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const [issues, founding] = await Promise.all([
    listIssues(c.env),
    getFoundingEdition(c.env).catch(() => null),
  ]);
  if (wantsHtml(c.req.header("Accept"))) {
    const foundingHtml = founding
      ? `<div class="menu-item">
          <div class="menu-line">
            <span class="menu-name">Issue no. 1, the Founding Edition</span>
            <span class="menu-dots"></span>
            <span class="menu-price">free</span>
          </div>
          <p class="menu-meta">${escapeHtml(founding.date.slice(0, 10))} \u2022 <code>/gazette/founding</code> \u2022 take one</p>
        </div>`
      : "";
    const issuesHtml =
      issues.length > 0 || founding
        ? issues
            .map(
              (issue) => `<div class="menu-item">
          <div class="menu-line">
            <span class="menu-name">Issue no. ${issue.issue_number}, ${escapeHtml(issue.title)}</span>
            <span class="menu-dots"></span>
            <span class="menu-price">$${PENNY_PAGE_USDC}</span>
          </div>
          <p class="menu-meta">${escapeHtml(issue.date.slice(0, 10))} \u2022 <code>/gazette/issue-${issue.issue_number}</code></p>
        </div>`,
            )
            .join("\n")
        : `<p class="empty">The press is warm but the first issue hasn't gone out. Leave a tip at the Trading Post and be in it.</p>`;
    return c.html(
      renderSimplePage({
        title: "The Gazette",
        description:
          "The shop's paper of record: weekly editions set from the store's own books, plus dispatches from tips left at the Trading Post.",
        path: "/gazette",
        bodyHtml: `<section>
          <p class="menu-desc">The shop's paper of record, weekly editions set from the store's own books, and dispatches assembled from tips left at the Trading Post, down at the Red Clay Exchange. Everything is read by a human before printing, nothing publishes itself around here. A penny a copy.</p>
          ${foundingHtml}
          ${issuesHtml}
        </section>`,
      }),
    );
  }
  return c.json({
    gazette:
      "The shop's paper of record: weekly editions set from the store's own books, plus dispatches from reviewed Trading Post tips. A penny a copy.",
    district: "The Red Clay Exchange",
    price_usdc: PENNY_PAGE_USDC,
    ...(founding
      ? {
          founding_edition: {
            url: `${base}/gazette/founding`,
            price_usdc: 0,
            date: founding.date,
            note: "Issue No. 1, free. Take one. Leave it somewhere another agent will find it.",
            verify_url: `${base}/api/verify/gazette_founding`,
          },
        }
      : {}),
    leave_a_tip: `POST ${base}/api/tip with { "tip": "...", "contributor_name": "(optional)" }. ${TIP_DISCLOSURE}`,
    issues: issues.map((issue) => issueIndexEntry(issue, base)),
  });
});

/** The founding edition: Issue No. 1, free, signed, frozen at press. */
tradingPostRoutes.get("/gazette/founding", async (c) => {
  const founding = await getFoundingEdition(c.env);
  if (!founding) {
    return c.json(
      {
        error: "The founding edition hasn't gone to press yet.",
        index_url: `${c.env.STORE_BASE_URL}/gazette`,
      },
      404,
    );
  }
  if (wantsHtml(c.req.header("Accept"))) {
    // Reading copy for humans; the signed original stays the markdown.
    return c.html(renderFoundingHtml(founding.markdown));
  }
  return c.text(founding.markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
    "X-Signature-Ed25519": founding.signature ?? "",
    "X-Verify-URL": `${c.env.STORE_BASE_URL}/api/verify/gazette_founding`,
  });
});

/** Issue paths carry the issue- prefix; bare numbers were never sold. */
function issueNumberFromPath(path: string): number {
  const raw = path.replace(/^\/gazette\/issue-/, "");
  return /^[0-9]+$/.test(raw) ? parseInt(raw, 10) : Number.NaN;
}

/** Unknown or unpublished issues are turned away before the gate. */
const issueCheck: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const issueNumber = issueNumberFromPath(c.req.path);
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
  c.res.headers.set("Vary", PAYMENT_VARY);
};

const ISSUE_PATTERN = "/gazette/:issue{issue-[0-9]+}";

tradingPostRoutes.use(ISSUE_PATTERN, noStore);
tradingPostRoutes.use(ISSUE_PATTERN, issueCheck);
tradingPostRoutes.use(ISSUE_PATTERN, paymentGate);

tradingPostRoutes.get(ISSUE_PATTERN, async (c) => {
  /*
   * `pending`, not `payment` — rule 9 as amended 2026-08-10. Nothing
   * is charged when a handler starts now. These pages mint no
   * certificate and so have no transaction to bind, which means they
   * never call settle themselves: the gate charges after they return
   * a 2xx, which is stock x402's own ordering.
   */
  if (!c.get("pending")) {
    // The gate never lets an unpaid request through; belt-and-braces.
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }
  // issueCheck guarantees the issue exists by the time we're here.
  const issue = (await getIssue(
    c.env,
    issueNumberFromPath(c.req.path),
  )) as GazetteIssue;
  return c.text(issue.markdown, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
});

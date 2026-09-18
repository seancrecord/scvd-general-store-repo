import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { publicationAdmission } from "@/lib/publication-recovery";
import { freeReadRecovery } from "@/lib/buyer-guidance";
import { publicationCheckout, publicationLinks, publicationPage } from "@/lib/publication-checkout";
import { paymentGate } from "@/lib/payment-gate";
import { PAYMENT_VARY, openForBusinessTiersUsdc } from "@/lib/payments";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { jsonLdScript, offerCurrencyFields, organizationRef } from "@/lib/jsonld";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { securityBlock } from "@/store/surface-contract";
import {
  OPEN_FOR_BUSINESS_FOR_MONEY,
  OPEN_FOR_BUSINESS_FREE_FIRST,
  OPEN_FOR_BUSINESS_IS_NOT,
  OPEN_FOR_BUSINESS_NAME,
  OPEN_FOR_BUSINESS_OPENED,
  OPEN_FOR_BUSINESS_PROPOSITION,
  OPEN_FOR_BUSINESS_USDC,
} from "@/store/copy/open-for-business";
import {
  findOpenForBusinessIssue,
  listOpenForBusinessShelf,
  type OpenForBusinessIssue,
} from "@/services/open-for-business-store";
import type { HonoEnv } from "@/types";

/**
 * OPEN FOR BUSINESS — the weekly issue for sellers, on the shelf.
 *
 * GET /open-for-business: the free index, as a page, as JSON (the
 * rule 60 twin with the five answers) or as markdown. Every issue
 * shows its week, its title, its number of the week and one free
 * line. GET /open-for-business/{week}: the issue itself, x402-gated
 * at the price the keeper set, delivered as markdown, no certificate
 * — the PAYMENT-RESPONSE header is the purchase record, the same
 * shape as every other publication here.
 *
 * WHAT IT SELLS is what the keeper published from the desk after
 * reading the instruments' draft: the numbers with their
 * denominators, the sections with what they could not see, the fix
 * of the week in his own words. Nothing on this shelf is written by
 * a machine and nothing is published by one (rule 30).
 */
export const openForBusinessRoutes = new Hono<HonoEnv>();

const PATH = "/open-for-business";

/** A week the shelf does not hold is turned away before the gate. */
const issueCheck = publicationAdmission(async (c) => {
  const week = c.req.path.replace(/^\/open-for-business\//, "");
  if (!(await findOpenForBusinessIssue(c.env, week))) {
    return c.json(
      {
        error: `No issue of ${OPEN_FOR_BUSINESS_NAME} for that week. The index is free, have a look.`,
        index_url: `${c.env.STORE_BASE_URL}${PATH}`,
        ...freeReadRecovery(`${c.env.STORE_BASE_URL}${PATH}?view=compact`),
      },
      404,
    );
  }
});

function indexRow(issue: OpenForBusinessIssue, base: string): Record<string, unknown> {
  const url = `${base}${PATH}/${issue.week}`;
  return {
    week: issue.week,
    title: issue.title,
    date: issue.date,
    teaser: issue.teaser,
    number_of_the_week: issue.number_of_the_week || null,
    price_usdc: OPEN_FOR_BUSINESS_USDC,
    url,
    ...publicationLinks(url),
  };
}

/** The twin: the five answers (60.4), the three sentences (60.2), and the shelf. */
function indexTwin(base: string, rows: unknown[], truncated: boolean, pagination?: Record<string, unknown>) {
  return {
    artifact: "open_for_business_index",
    name: OPEN_FOR_BUSINESS_NAME,
    what_this_is: OPEN_FOR_BUSINESS_PROPOSITION,
    proposition: OPEN_FOR_BUSINESS_PROPOSITION,
    price: OPEN_FOR_BUSINESS_FOR_MONEY,
    for_money: OPEN_FOR_BUSINESS_FOR_MONEY,
    free_first: OPEN_FOR_BUSINESS_FREE_FIRST,
    price_usdc: OPEN_FOR_BUSINESS_USDC,
    price_usdc_options: openForBusinessTiersUsdc(),
    opened: OPEN_FOR_BUSINESS_OPENED,
    how_to_call: {
      this_index: `GET ${base}${PATH} with Accept: application/json for this twin, text/html for the page, text/markdown for the document. No account, no key. ?view=compact pages the shelf eight at a time.`,
      an_issue: `GET any issue url without payment for the 402 quote; decode PAYMENT-REQUIRED (base64 JSON), sign the first accepts entry, retry the identical URL with PAYMENT-SIGNATURE and one Idempotency-Key. The issue arrives as text/markdown; PAYMENT-RESPONSE is the receipt. No certificate is minted for a page.`,
      pay_more_if_you_like: `The first tier is $${OPEN_FOR_BUSINESS_USDC} and that is the price. The two tiers above it buy the same issue and are booked as tips.`,
    },
    errors: {
      "404": "No issue for that week: the week is not on this index. The index is free.",
      "402": "Unpaid: the PAYMENT-REQUIRED header carries the terms. Nothing was charged.",
      settlement_failed: "The payment did not clear and the issue stays shut. No charge; retry with the same payment and idempotency key.",
    },
    security: securityBlock(base, {
      does_in_your_name: "Nothing. A GET on the index reads the shelf; a paid GET presents your signed payment to the facilitator once and delivers the issue.",
      stores: "The purchase record the x402 receipt implies: the exact markdown prepared for your payment, retained for recovery under your private Purchase-Recovery handle. No account, no cookie, no reader list.",
    }),
    what_this_is_not: OPEN_FOR_BUSINESS_IS_NOT,
    checkout: publicationCheckout(base),
    ...(pagination ?? {}),
    /* Rule 52: a list that could not see the whole shelf says so. */
    shelf_complete: !truncated,
    ...(truncated ? { shelf_truncated: "The read stopped at its cap: these are the newest issues it reached, not the whole shelf. Any issue is still readable at its own URL." } : {}),
    issues: rows,
  };
}

openForBusinessRoutes.get(PATH, async (c) => {
  const base = c.env.STORE_BASE_URL;
  const { issues, truncated } = await listOpenForBusinessShelf(c.env);
  const rows = issues.map((issue) => indexRow(issue, base));
  if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    const shelf = issues.length === 0
      ? `<p class="menu-meta">No issue on the shelf yet. The first goes up when the keeper has a week worth selling; the index is the place to check.</p>`
      : issues.map(
          (issue) => `<div class="menu-item">
        <div class="menu-line">
          <span class="menu-name">${escapeHtml(issue.title)}</span>
          <span class="menu-dots"></span>
          <span class="menu-price">$${OPEN_FOR_BUSINESS_USDC}</span>
        </div>
        ${issue.number_of_the_week ? `<p class="menu-desc"><strong>${escapeHtml(issue.number_of_the_week)}</strong></p>` : ""}
        <p class="menu-desc">${escapeHtml(issue.teaser)}</p>
        <p class="menu-meta">${escapeHtml(issue.week)} • published ${escapeHtml(issue.date)} • <code>${PATH}/${escapeHtml(issue.week)}</code></p>
      </div>`,
        ).join("\n");
    return c.html(
      renderSimplePage({
        title: OPEN_FOR_BUSINESS_NAME,
        description:
          "The weekly issue for sellers: what agents did at a live x402 till and at the doors the store probes, where they got hung up before paying, and how not to turn them away silently. One issue, one price, no subscription.",
        path: PATH,
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(OPEN_FOR_BUSINESS_PROPOSITION)}</p>
          <p class="menu-desc">${escapeHtml(OPEN_FOR_BUSINESS_FOR_MONEY)}</p>
          <p class="menu-meta">${escapeHtml(OPEN_FOR_BUSINESS_FREE_FIRST)}</p>
        </section>
        <section>
          <h2>Issues</h2>
          ${truncated ? `<p class="menu-meta">The read stopped at its cap: these are the newest issues it reached, not the whole shelf. Any issue is still readable at its own URL.</p>` : ""}
          ${shelf}
        </section>
        <section>
          <h2>What this is not</h2>
          <p class="menu-desc">${escapeHtml(OPEN_FOR_BUSINESS_IS_NOT)}</p>
          <p class="menu-meta">Where the numbers come from: the same instruments the store reports on at <a href="/sources">/sources</a> and <a href="/ledger">/ledger</a>; the operator side of the shelf is at <a href="/operators">/operators</a>. JSON twin of this page at the same URL with <code>Accept: application/json</code>; the x402 checkout shape is in it.</p>
        </section>
        ${jsonLdScript({
          "@context": "https://schema.org",
          "@type": "Periodical",
          name: OPEN_FOR_BUSINESS_NAME,
          description: OPEN_FOR_BUSINESS_PROPOSITION,
          url: `${base}${PATH}`,
          publisher: organizationRef(base),
          inLanguage: "en",
          isAccessibleForFree: false,
          offers: {
            "@type": "Offer",
            price: String(OPEN_FOR_BUSINESS_USDC),
            /* An ISO code for the validator and the asset in words for the buyer (lib/jsonld.ts). */
            ...offerCurrencyFields(c.env),
            description: "One issue, paid once; no subscription.",
            url: `${base}${PATH}`,
          },
          hasPart: issues.map((issue) => ({
            "@type": "PublicationIssue",
            name: issue.title,
            issueNumber: issue.week,
            datePublished: issue.date,
            url: `${base}${PATH}/${issue.week}`,
            isAccessibleForFree: false,
          })),
        })}`,
      }),
    );
  }
  const page = publicationPage(rows, `${base}${PATH}`, c.req.query("page"));
  if (c.req.query("view") === "compact" && !page) return c.json({ error: "Invalid publication page." }, 400);
  const twin = c.req.query("view") === "compact" ? indexTwin(base, page!.rows, truncated, page!.pagination) : indexTwin(base, rows, truncated);
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: PATH,
      title: OPEN_FOR_BUSINESS_NAME,
      description: OPEN_FOR_BUSINESS_PROPOSITION,
      document: twin as unknown as Record<string, unknown>,
    });
  }
  return c.json(twin);
});

/** Paid pages never sit in a shared cache. */
const noStore: MiddlewareHandler<HonoEnv> = async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
  c.res.headers.set("Vary", PAYMENT_VARY);
};

openForBusinessRoutes.use(`${PATH}/:week`, noStore);
openForBusinessRoutes.use(`${PATH}/:week`, issueCheck);
openForBusinessRoutes.use(`${PATH}/:week`, paymentGate);

openForBusinessRoutes.get(`${PATH}/:week`, async (c) => {
  // issueCheck guarantees the issue exists by the time we are here.
  const issue = (await findOpenForBusinessIssue(c.env, c.req.param("week"))) as OpenForBusinessIssue;
  // Nothing is charged when a handler starts (rule 9 as amended
  // 2026-08-10): the gate settles after a 2xx, stock x402's ordering.
  if (!c.get("pending")) {
    return c.json({ error: "The till hasn't heard from you yet." }, 402);
  }
  return c.text(issue.markdown, 200, { "Content-Type": "text/markdown; charset=utf-8" });
});

import { Hono } from "hono";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { publishedCountsBlock } from "@/store/published-counts";
import {
  STORE_MONTH_FOR_MONEY,
  STORE_MONTH_FREE_FIRST,
  STORE_MONTH_PROPOSITION,
} from "@/store/copy/instruments";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import {
  canonicalizeStoreMonth,
  getStoreMonth,
  listStoreMonths,
  verifyStoreMonthChain,
  type StoreMonthRecord,
} from "@/services/store-month";
import type { HonoEnv } from "@/types";

/**
 * THE STORE'S OWN MONTH, READ — the public face of the third chain.
 *
 * WHY IT IS A ROOM AND NOT ONLY JSON. The coverage matrix spent its
 * first weeks legible to indexers and invisible to the operator
 * deciding whether to trust us, and the fix was a page. The same
 * applies here with more force: this record exists to be read by
 * somebody deciding whether our other readings are worth citing, and
 * that somebody is frequently a person.
 *
 * NOTHING HERE RECOMPUTES ANYTHING. Every figure on the page is the
 * sealed document's own field, printed. The page cannot show a number
 * the chain does not hold, which is the whole point of putting the
 * canonical string and the digest on it: a reader can rebuild the
 * bytes we signed from what they are looking at.
 */
export const storeMonthRoutes = new Hono<HonoEnv>();

/**
 * The five answers every feature owes its JSON twin (house rule
 * 60.4). They are the same on both doors because they are facts about
 * the instrument, not about the response.
 */
function fiveAnswers(base: string): Record<string, unknown> {
  return {
    what_this_is: STORE_MONTH_PROPOSITION,
    price: STORE_MONTH_FOR_MONEY,
    free_first: STORE_MONTH_FREE_FIRST,
    how_to_call: `GET ${base}/store-month.json for the chain, ${base}/store-month/{YYYY-MM}.json for one sealed month, ${base}/store-month/verify.json for the verdict. No key, no payment, no rate limit beyond the ordinary one.`,
    errors: {
      not_sealed:
        "the month asked for has not been sealed — the response names the months that have, because a bare 404 answers a question nobody asked",
    },
    security: {
      what_this_does_in_your_name: "nothing; every door here is a read",
      what_it_stores_about_you:
        "nothing beyond the ordinary request counters every page on this store keeps",
      the_rest: `${base}/mcp.md`,
    },
  };
}

/** One entry as a reader receives it, with the bytes that were signed. */
function entryDocument(record: StoreMonthRecord): Record<string, unknown> {
  return {
    ...record,
    /*
     * THE EXACT STRING THE SIGNATURE COVERS, served rather than
     * described. Telling a reader "canonicalize it yourself" is how a
     * verification step becomes a paragraph nobody follows; handing
     * over the bytes makes checking us a copy and a paste.
     */
    signed_payload: canonicalizeStoreMonth(record.document),
    signature_covers:
      "the signed_payload string exactly, UTF-8, ed25519 over public_key; digest is sha256 of the same bytes",
  };
}

storeMonthRoutes.get("/store-month.json", async (c) => {
  const { records, truncated } = await listStoreMonths(c.env);
  return c.json({
    chain: "store_month",
    ...fiveAnswers(c.env.STORE_BASE_URL),
    entries: records.map(entryDocument),
    scan_truncated: truncated,
    verify: `${c.env.STORE_BASE_URL}/store-month/verify.json`,
    published_counts: publishedCountsBlock("/store-month"),
  });
});

storeMonthRoutes.get("/store-month/verify.json", async (c) => {
  return c.json({
    ...(await verifyStoreMonthChain(c.env)),
    what_this_checks:
      "every entry rehashed from its published document, every signature checked against the key that entry names, and every link walked — run by us, on our own chain, which is why the signed_payload is served beside each entry for you to check yourself",
    published_counts: publishedCountsBlock("/store-month"),
  });
});

storeMonthRoutes.get("/store-month/:month{[0-9]{4}-[0-9]{2}}.json", async (c) => {
  const record = await getStoreMonth(c.env, c.req.param("month"));
  if (!record) {
    const { records } = await listStoreMonths(c.env);
    return c.json(
      {
        code: "not_sealed",
        // Never a bare 404: the months that ARE sealed are the answer
        // to the question the reader was actually asking.
        sealed: records.map((entry) => entry.document.month),
        note: "A month is sealed once it has closed and while the pulse can still see it.",
      },
      404,
    );
  }
  return c.json(entryDocument(record));
});

const STORE_MONTH_CSS = `
.month-entry { border: 1px dashed var(--line); padding: 0.75rem 1rem; margin: 1rem 0; }
.month-entry h3 { margin-top: 0; }
.month-entry code { overflow-wrap: anywhere; }
table.figures td:first-child { white-space: nowrap; }
`;

function figureRows(record: StoreMonthRecord): string {
  const figures = record.document.figures;
  const rows: Array<[string, string]> = [
    ["offered (402s to organic traffic)", String(figures.organic_challenges)],
    ["presented", String(figures.organic_payments_presented)],
    ["settled", String(figures.organic_settled)],
    ["declined", String(figures.organic_declines)],
  ];
  return rows
    .map(
      ([label, value]) =>
        `<tr><td>${escapeHtml(label)}</td><td><code>${escapeHtml(value)}</code></td></tr>`,
    )
    .join("");
}

function entrySection(record: StoreMonthRecord): string {
  const document = record.document;
  const rails = document.figures.by_rail;
  const railRows = rails
    ? Object.entries(rails)
        .map(
          ([rail, count]) =>
            `<tr><td><code>${escapeHtml(rail)}</code></td><td><code>${escapeHtml(String(count))}</code></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2">the rail split is withheld this month</td></tr>`;
  return `<section class="month-entry">
    <h3>${escapeHtml(document.month)} <span class="menu-meta">#${escapeHtml(String(document.sequence))}, sealed ${escapeHtml(document.taken_at)}</span></h3>
    <p class="menu-meta">${escapeHtml(document.figures.window)}</p>
    <table class="figures"><tbody>${figureRows(record)}</tbody></table>
    <h4>By rail <span class="menu-meta">(all time, not this month)</span></h4>
    <table class="figures"><tbody>${railRows}</tbody></table>
    <p class="menu-meta">${escapeHtml(document.figures.note)}</p>
    <p class="menu-meta">Excluded: ${escapeHtml(document.figures.exclusions.join("; "))}.</p>
    <p class="menu-meta">digest <code>${escapeHtml(record.digest)}</code></p>
    <p class="menu-meta">extends <code>${escapeHtml(document.previous_digest ?? "nothing — this is the first entry")}</code></p>
    <p class="menu-meta">signed by <code>${escapeHtml(document.issuer)}</code>; Bitcoin stamp: <code>${escapeHtml(record.ots?.status ?? "not submitted")}</code></p>
    <p class="menu-meta"><a href="/store-month/${escapeHtml(document.month)}.json">the signed bytes for ${escapeHtml(document.month)}</a></p>
  </section>`;
}

storeMonthRoutes.get("/store-month", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const { records, truncated } = await listStoreMonths(c.env);
  const document: Record<string, unknown> = {
    chain: "store_month",
    ...fiveAnswers(base),
    entries: records.map(entryDocument),
    scan_truncated: truncated,
    verify: `${base}/store-month/verify.json`,
    published_counts: publishedCountsBlock("/store-month"),
  };
  if (
    prefersMarkdown(
      c.req.header("Accept"),
      "text/html",
      c.req.header("User-Agent"),
    )
  ) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/store-month",
      title: "The store's own month, signed",
      description: STORE_MONTH_PROPOSITION,
      document,
    });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(document);
  }
  const sections = records.length
    ? [...records].reverse().map(entrySection).join("")
    : `<section class="month-entry"><p class="menu-desc">No month is sealed yet.
       The first entry is written when the first month closes, and this page
       says so rather than showing an empty table that reads like a zero.</p></section>`;
  const bodyHtml = `<section>
    <p class="menu-desc">${escapeHtml(STORE_MONTH_PROPOSITION)}</p>
    <p class="menu-desc"><strong>Why this exists.</strong> We ask strangers to
    cite a signed, hash-chained, Bitcoin-anchored record of what we saw at
    <em>their</em> doors. Our own numbers had no such record: the
    <a href="/pulse">pulse</a> and the <a href="/stats">books</a> are live
    surfaces that move under a reader, and a figure that can change silently is
    a figure you have to take on trust. This is the same instrument pointed at
    us.</p>
    <p class="menu-desc">${escapeHtml(STORE_MONTH_FREE_FIRST)}</p>
    <p class="menu-desc">${escapeHtml(STORE_MONTH_FOR_MONEY)}</p>
  </section>
  <section><h2>What this does not prove</h2>
    <p class="menu-desc">Every figure is a count off our own counters. That is
    a claim about our bookkeeping, not an independent audit of it — nobody
    outside has checked these numbers, and this record does not pretend
    otherwise. The chain proves the rows have not been edited <em>since</em>
    they were sealed; it cannot prove they were right when they were written.
    A Bitcoin stamp reading <code>pending</code> means a calendar accepted the
    digest, not that Bitcoin confirmed it.</p>
    <p class="menu-desc">The window is a month because the counters are kept by
    month: as of 2026-09-22 there is no weekly cut of these numbers, and
    inventing one would have meant printing month-to-date figures under a
    weekly heading.</p>
  </section>
  <section><h2>The chain</h2>
    <p class="menu-meta">Newest first. <a href="/store-month/verify.json">Verify
    the whole chain</a> — or better, rebuild it: each entry serves the exact
    string its signature covers.</p>
    ${sections}
  </section>
  ${jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${base}/store-month#dataset`,
    name: "The store's own month, signed",
    description: STORE_MONTH_PROPOSITION,
    url: `${base}/store-month`,
    isAccessibleForFree: true,
    creator: organizationRef(base),
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${base}/store-month.json`,
      },
    ],
  })}`;
  return c.html(
    renderSimplePage({
      title: "The store's own month, signed",
      description: STORE_MONTH_PROPOSITION,
      path: "/store-month",
      markdownAlt: "/store-month",
      extraCss: STORE_MONTH_CSS,
      bodyHtml,
    }),
  );
});

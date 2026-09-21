import { Hono } from "hono";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { catalogLastUpdated } from "@/lib/freshness";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import directoryData from "@/store/directory.json";
import { TRUST_LIST_ENTRIES } from "@/store/trust-list";
import { NEIGHBOUR_RECEIPTS } from "@/store/neighbours";
import type { DirectoryData, DirectoryListing, HonoEnv } from "@/types";

/**
 * GET /directory, the Town Directory. Keeper-edited by hand in
 * src/store/directory.json; honest one-line reviews, no pay-for-placement.
 * JSON for agents, a paper page for humans.
 *
 * GET /directory/:slug, one listing on its own page — because a
 * listing a neighbor cannot link to is a listing nobody has a reason
 * to want, and having a reason to want one is the whole supplier
 * ladder.
 *
 * The directory and the trust list are the same muscle: the keeper
 * went and looked. They stayed two disconnected surfaces with
 * overlapping content until 2026-07-27; now each says what the other
 * knows, because a review is an OPINION and a signed entry is an
 * OBSERVATION, and a reader deserves to know which one they are
 * holding.
 */
export const directoryRoutes = new Hono<HonoEnv>();

const DIRECTORY: DirectoryData = directoryData;

/**
 * WHAT THE PAGE SAYS IT IS, typed once (2026-09-21, his brief: "more
 * of like who we are seeing about town"). It rode in two places, the
 * paper page and the markdown twin, and a description hand-typed
 * twice is a description that drifts — AT_SCALE rule 1 in miniature.
 *
 * The old line called this "a short book, kept short on purpose,"
 * which stopped being true the day the September receipts landed and
 * the book went from four names to twenty-two. What has not changed
 * is how a name gets on it, so the copy says that instead of counting.
 */
const DIRECTORY_DESCRIPTION =
  "Who we've been seeing about town. Other services in the neighbourhood, each one listed by hand after the keeper used it, and what it was like when he did.";

/** Origins normalize loosely: a trailing slash is not a different neighbor. */
function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** The signed entry for a listing, when the keeper has also signed one. */
function trustEntryFor(listing: DirectoryListing) {
  return TRUST_LIST_ENTRIES.find((entry) =>
    sameOrigin(entry.origin, listing.url),
  );
}

/**
 * THE RECEIPT BEHIND A LINE, when there is one (2026-09-20, the
 * September catch-up). Eighteen listings arrived at once out of
 * /neighbours, and every one of them has something the four older
 * listings do not: money moved, on a date, for a named amount.
 *
 * Until now a listing off the signed trust list was told "nothing
 * about this neighbor is signed," which for these eighteen is a FALSE
 * NEGATIVE ABOUT OUR OWN EVIDENCE — the SniperX line rests on a
 * Solana mainnet signature a stranger can open. The trust list and
 * the receipts table are different instruments and neither stands in
 * for the other, so the listing points at whichever one it actually
 * has, and says so in those words.
 */
function receiptFor(listing: DirectoryListing) {
  return NEIGHBOUR_RECEIPTS.find((row) => sameOrigin(row.origin, listing.url));
}

function listingJson(
  listing: DirectoryListing,
  base: string,
): Record<string, unknown> {
  const entry = trustEntryFor(listing);
  const receipt = receiptFor(listing);
  return {
    ...listing,
    listing_url: `${base}/directory/${listing.slug}`,
    ...(receipt
      ? {
          receipt: {
            paid: true,
            date: receipt.date,
            paid_usdc: receipt.paid_usdc,
            receipts_url: `${base}/neighbours`,
            note: "This line was written after a purchase. The dated receipt — what we asked, what came back, what it cost — is on /neighbours, and it is an observation of one transaction rather than a claim about this neighbor today.",
          },
        }
      : {}),
    trust_list: entry
      ? {
          listed: true,
          relation: entry.relation,
          first_verified: entry.first_verified,
          signed_list: `${base}/trust-list.json`,
          note: "The signed list records what happened; the review above is the keeper's opinion of it.",
        }
      : {
          listed: false,
          note: receipt
            ? "Not on the signed trust list. What stands behind this line is the dated receipt above, on /neighbours."
            : "Reviewed here, not on the signed trust list. The review is an opinion and nothing about this neighbor is signed.",
        },
  };
}

function listingHtml(listing: DirectoryListing, base: string): string {
  const entry = trustEntryFor(listing);
  const signedLine = entry
    ? `<p class="menu-meta">Also on the <a href="/trust-list.json">signed trust list</a>, as ${escapeHtml(
        entry.relation === "transacted"
          ? "a paid transaction that delivered"
          : entry.relation === "treaty"
            ? "a receipt treaty, pointing at their own statement"
            : "used, with nothing paid",
      )}, first checked ${escapeHtml(entry.first_verified)}.</p>`
    : "";
  // The human page says what the JSON says: a line bought and paid
  // for points at its receipt, rather than going quiet because the
  // trust list happens not to carry the name.
  const receipt = receiptFor(listing);
  const receiptLine = receipt
    ? `<p class="menu-meta">Written after a purchase: $${escapeHtml(String(receipt.paid_usdc))} on ${escapeHtml(receipt.date)}. The <a href="/neighbours">receipt</a> says what we asked and what came back.</p>`
    : "";
  return `<div class="menu-item">
    <div class="menu-line">
      <span class="menu-name"><a href="${base}/directory/${escapeHtml(listing.slug)}">${escapeHtml(listing.name)}</a></span>
      <span class="menu-dots"></span>
      <span class="menu-price">${escapeHtml(listing.category)}</span>
    </div>
    <p class="menu-desc">${escapeHtml(listing.review)}</p>
    <p class="menu-meta"><a href="${escapeHtml(listing.url)}">${escapeHtml(listing.url)}</a> • added ${escapeHtml(listing.added)}</p>
    ${receiptLine}
    ${signedLine}
  </div>`;
}

/**
 * schema.org for the directory. A crawler or an LLM reading this page
 * should be able to tell these are dated reviews written by a named
 * party about named organizations, rather than a link farm — which is
 * exactly the difference the page is claiming.
 */
function directoryJsonLd(base: string): string {
  const graph = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Town Directory",
    description: DIRECTORY.note,
    url: `${base}/directory`,
    dateModified: catalogLastUpdated(),
    numberOfItems: DIRECTORY.listings.length,
    itemListElement: DIRECTORY.listings.map((listing, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${base}/directory/${listing.slug}`,
      item: {
        "@type": "Review",
        url: `${base}/directory/${listing.slug}`,
        datePublished: listing.added,
        reviewBody: listing.review,
        author: organizationRef(base),
        itemReviewed: {
          "@type": "Organization",
          name: listing.name,
          url: listing.url,
        },
      },
    })),
  };
  return jsonLdScript(graph);
}

/**
 * One listing's own page gets its own Review node (2026-08-18, the
 * AEO straggler): the detail pages are the linkable surface, and
 * until now only the index carried markup — a crawler landing on a
 * single listing saw prose with no structure at all.
 */
function listingJsonLd(listing: DirectoryListing, base: string): string {
  const review = {
    "@context": "https://schema.org",
    "@type": "Review",
    url: `${base}/directory/${listing.slug}`,
    datePublished: listing.added,
    reviewBody: listing.review,
    author: organizationRef(base),
    itemReviewed: {
      "@type": "Organization",
      name: listing.name,
      url: listing.url,
    },
  };
  return jsonLdScript(review);
}

directoryRoutes.get("/directory", (c) => {
  const base = c.env.STORE_BASE_URL;
  const indexPayload = {
    ...DIRECTORY,
    listings: DIRECTORY.listings.map((listing) => listingJson(listing, base)),
    suggest_a_listing: `POST ${base}/api/request with a suggest_listing field (name + URL, one line). The keeper visits before he lists.`,
    no_pay_for_placement:
      "There is no fee and no placement to buy. Every line here is the keeper's own, written after he used the thing.",
    signed_list: `${base}/trust-list.json`,
  };
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/directory",
      title: "Town Directory",
      description:
        DIRECTORY_DESCRIPTION,
      document: indexPayload as unknown as Record<string, unknown>,
    });
  }
  if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    const listingsHtml =
      DIRECTORY.listings.length > 0
        ? DIRECTORY.listings
            .map((listing) => listingHtml(listing, base))
            .join("\n")
        : `<p class="empty">No listings yet. The keeper only lists neighbors he'd actually send you to, and he's still making the rounds.</p>`;
    return c.html(
      renderSimplePage({
        title: "Town Directory",
        description:
          DIRECTORY_DESCRIPTION,
        path: "/directory",
        bodyHtml: `<section>
          <p class="menu-desc">${escapeHtml(DIRECTORY.note)}</p>
          ${listingsHtml}
          <p class="menu-meta">Every listing has a page of its own, so a neighbor has something to point at. Nobody paid to be here and nobody can.</p>
        </section>
        ${directoryJsonLd(base)}`,
      }),
    );
  }
  return c.json(indexPayload);
});

/*
 * THE SLUG EXCLUDES A DOT (2026-09-16), so `/directory/x.md` is not
 * swallowed as a listing named "x.md".
 *
 * An unconstrained :slug matches the suffix too, answers its own 404
 * for a listing nobody has, and the `.md` twin handler in index.ts
 * never runs — it lives in notFound, and this route was not letting
 * the request get there. Every listing had a markdown representation
 * and no way to ask for it by suffix.
 */
directoryRoutes.get("/directory/:slug{[a-z0-9-]+}", (c) => {
  const base = c.env.STORE_BASE_URL;
  const slug = c.req.param("slug");
  const listing = DIRECTORY.listings.find((entry) => entry.slug === slug);
  if (!listing) {
    if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
      return c.html(
        renderSimplePage({
          title: "No such listing",
          description:
            "No entry by that name in the Town Directory. The whole book is short enough to read start to finish.",
          bodyHtml: `<section><p class="empty">Nobody by that name in the book. The <a href="/directory">whole directory</a> is short enough to read start to finish.</p></section>`,
        }),
        404,
      );
    }
    return c.json(
      { error: "No listing by that name.", directory: `${base}/directory` },
      404,
    );
  }
  const listingPayload = {
    ...listingJson(listing, base),
    district: DIRECTORY.district,
    directory: `${base}/directory`,
  };
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: `/directory/${listing.slug}`,
      title: `${listing.name} in the Town Directory`,
      description: `${listing.name} in the Town Directory: what it does, and what this store can and cannot say about it.`,
      document: listingPayload as unknown as Record<string, unknown>,
    });
  }
  if (wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.html(
      renderSimplePage({
        title: `${listing.name} in the Town Directory`,
        description: `${listing.name} in the Town Directory: what it does, and what this store can and cannot say about it.`,
        path: `/directory/${listing.slug}`,
        bodyHtml: `<section>
          ${listingHtml(listing, base)}
          <p class="menu-meta">One of ${DIRECTORY.listings.length} in the <a href="/directory">Town Directory</a>, ${escapeHtml(DIRECTORY.district)}. No fee was paid for this listing and none could be.</p>
        </section>
        ${listingJsonLd(listing, base)}`,
      }),
    );
  }
  return c.json(listingPayload);
});

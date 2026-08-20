import { Hono } from "hono";
import { jsonLdScript } from "@/lib/jsonld";
import { catalogLastUpdated } from "@/lib/freshness";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import directoryData from "@/store/directory.json";
import { TRUST_LIST_ENTRIES } from "@/store/trust-list";
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

function listingJson(
  listing: DirectoryListing,
  base: string,
): Record<string, unknown> {
  const entry = trustEntryFor(listing);
  return {
    ...listing,
    listing_url: `${base}/directory/${listing.slug}`,
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
          note: "Reviewed here, not on the signed trust list. The review is an opinion and nothing about this neighbor is signed.",
        },
  };
}

function listingHtml(listing: DirectoryListing, base: string): string {
  const entry = trustEntryFor(listing);
  const signedLine = entry
    ? `<p class="menu-meta">Also on the <a href="/trust-list.json">signed trust list</a>, as ${escapeHtml(
        entry.relation === "transacted"
          ? "a paid transaction that delivered"
          : "used, with nothing paid",
      )}, first checked ${escapeHtml(entry.first_verified)}.</p>`
    : "";
  return `<div class="menu-item">
    <div class="menu-line">
      <span class="menu-name"><a href="${base}/directory/${escapeHtml(listing.slug)}">${escapeHtml(listing.name)}</a></span>
      <span class="menu-dots"></span>
      <span class="menu-price">${escapeHtml(listing.category)}</span>
    </div>
    <p class="menu-desc">${escapeHtml(listing.review)}</p>
    <p class="menu-meta"><a href="${escapeHtml(listing.url)}">${escapeHtml(listing.url)}</a> • added ${escapeHtml(listing.added)}</p>
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
        author: { "@type": "Organization", name: "scvd.store", url: base },
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
    author: { "@type": "Organization", name: "scvd.store", url: base },
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
  if (wantsHtml(c.req.header("Accept"))) {
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
          "Other services in the neighbourhood, listed by hand with what each one does. A short book, kept short on purpose.",
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
  return c.json({
    ...DIRECTORY,
    listings: DIRECTORY.listings.map((listing) => listingJson(listing, base)),
    suggest_a_listing: `POST ${base}/api/request with a suggest_listing field (name + URL, one line). The keeper visits before he lists.`,
    no_pay_for_placement:
      "There is no fee and no placement to buy. Every line here is the keeper's own, written after he used the thing.",
    signed_list: `${base}/trust-list.json`,
  });
});

directoryRoutes.get("/directory/:slug", (c) => {
  const base = c.env.STORE_BASE_URL;
  const slug = c.req.param("slug");
  const listing = DIRECTORY.listings.find((entry) => entry.slug === slug);
  if (!listing) {
    if (wantsHtml(c.req.header("Accept"))) {
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
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(
      renderSimplePage({
        title: listing.name,
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
  return c.json({
    ...listingJson(listing, base),
    district: DIRECTORY.district,
    directory: `${base}/directory`,
  });
});

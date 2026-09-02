import { Hono } from "hono";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import { escapeHtml } from "@/lib/sanitize";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import { CORRECTIONS_POINTER } from "@/store/corrections";
import { MENU_ITEMS } from "@/store/menu";
import { priceLine } from "@/services/menu-markdown";
import type { HonoEnv, MenuItem } from "@/types";
import { NEVER_A_RANKING_SENTENCE } from "@/store/copy/doctrine";

/**
 * GET /how-it-works — the mechanism, in the machine's words as well as
 * the reader's (the keeper's ask, 2026-08-30: "i think we need a
 * machine readable /how-it-works url").
 *
 * WHAT WAS MISSING, STATED PLAINLY. This store publishes a great deal
 * about WHAT it observed — the corpus, the doors index, the per-host
 * histories, the battery, the defect vocabulary — and a great deal
 * about WHAT IT SELLS, on the menu and every item page. What it had
 * nowhere in one piece, for either audience, was HOW THE THING WORKS:
 * how an observation becomes evidence somebody else can check, and
 * what happens to your money when you buy our labour on it.
 *
 * A stranger could assemble that from eight pages. An agent deciding
 * whether to trust or spend could not, because the assembling is the
 * part it cannot do cheaply. Rule 57.2 is the standard this fails
 * without the room: say what it is and what it is for, on the surface
 * the caller is actually holding.
 *
 * BUILT TO RULES 57 AND 58, with /doors as the worked example. The
 * five agent questions are answered in the body an agent gets; the
 * human page is the same facts in the reader's order.
 *
 * WHAT IS DERIVED AND WHAT IS TYPED, because today's lesson was that
 * a typed number outlives its truth (docs/SURFACE_CONTRACT_2026-08.md,
 * the withdrawn standing_watch row). Every price and cadence here is
 * read off MENU_ITEMS at request time. Every free door named is
 * fetched by a standing test, so a room that stops answering fails the
 * build rather than sitting here being quoted. The prose is the only
 * typed part, and prose is the one thing a test cannot check.
 */

export const howItWorksRoutes = new Hono<HonoEnv>();

const WHAT_THIS_IS =
  "The mechanism of this store in one document: how a claim about somebody else's endpoint is made, signed, chained and published so a third party can check it without trusting us, and what happens to your money if you buy our labour on top of it.";

const WHAT_IT_IS_FOR =
  "Deciding whether to rely on anything this store publishes, and on what terms. It is written for a caller who has never been here, needs to know what kind of thing an observation is before citing one, and wants the failure modes named before it spends. Nothing here narrows what you may do with the record: it is free, complete, and licensed for reuse, including by people building something that competes with us.";

const WHAT_THIS_IS_NOT =
  `${NEVER_A_RANKING_SENTENCE} Not a certification, and not an escrow, a guarantor, or a dispute court. Those last three absorb the risk between payment and delivery and need a balance sheet; this store observes that gap, signs what it saw, and publishes it. A verdict here is one dated observation of one moment, which expires and is re-taken, or a derivation from those that prints its rule and its fraction — never a standing judgement about an operator.`;

/**
 * THE CHAIN OF CUSTODY, which is the whole product. Each step names
 * what a reader can verify for themselves, because a step nobody can
 * check is a step that only works if you already believe us.
 */
const HOW_EVIDENCE_IS_MADE = [
  {
    step: 1,
    name: "The knock",
    what_happens:
      "Once a week the round walks the public x402 discovery feeds and sends one plain GET to every door they name. No authentication is bypassed, no rate limit is evaded, and nothing private is read.",
    what_you_can_check:
      "The feeds are public and so is the door list: /doors.json names every host ever seen, and every host page carries the weeks we did NOT reach it, with the reason.",
  },
  {
    step: 2,
    name: "The reading",
    what_happens:
      "The bytes that came back are run through a named battery of checks. Each check has a published name, so two instruments can mean the same thing by the same word, and a check that cannot run says so instead of passing.",
    what_you_can_check:
      "The vocabulary is at /defects.json and the desk that runs the battery is free at /api/conformance/v1 — point it at your own door, or at ours.",
  },
  {
    step: 3,
    name: "The signature",
    what_happens:
      "The reading is written as one dated observation and signed ed25519. The signature covers the observation, not a summary of it, so an artifact cannot be edited into agreeing with a later story.",
    what_you_can_check:
      "Verification is free and permanent at /api/verify/{id}, and it works offline: the public key is published and the artifact carries everything the check needs.",
  },
  {
    step: 4,
    name: "The chain",
    what_happens:
      "Observations are sealed into weekly snapshots linked by hash, so a row cannot be changed after the fact without breaking every snapshot after it.",
    what_you_can_check:
      "Every snapshot is listed at /corpus.json with its digest. Fetch two consecutive weeks and verify the link yourself.",
  },
  {
    step: 5,
    name: "The anchor",
    what_happens:
      "Snapshot digests are submitted to OpenTimestamps for Bitcoin anchoring, which puts the existence of a reading at a time beyond this store's reach to revise.",
    what_you_can_check:
      "The anchor proofs are public and verifiable with any OpenTimestamps client. We cannot forge them and cannot withdraw them.",
  },
] as const;

/**
 * THE ORDER OF OPERATIONS AT THE TILL, which is the thing most worth
 * knowing before spending and is nowhere else in one sentence: the
 * goods are produced FIRST and the payment is presented at the last
 * moment before the artifact is signed. A delivery that fails takes
 * no money at all, so there is nothing to refund and nothing to chase.
 */
const HOW_MONEY_WORKS = {
  order_of_operations:
    "The store delivers first and settles after. The work is done, then payment is presented at the last moment before the artifact is signed. A delivery that fails takes no money at all — which is why there is no refund queue to join and nobody to chase.",
  what_money_buys:
    "Our labour on the record. Never the record itself: the corpus, the battery, the vocabulary and every published observation are free forever and are not behind any payment. A purchase buys a fresh look, a longer look, a look aimed somewhere specific, or a signed artifact you can hand to a third party.",
  what_money_never_buys:
    "A verdict. Nothing on the shelf changes what an observation says, and a paid look that finds a defect reports the defect. If money could move a reading, every reading would be worth nothing.",
  rails: "USDC over x402, on Base, Polygon or Solana.",
  recurrence:
    "Nothing here charges again by itself, ever — there is no mechanism that could. Some items cover a term of days for one payment; when the term ends it stops, and a further purchase is a decision you make.",
  refunds:
    "Structurally unnecessary rather than generously offered: because settlement happens after delivery, a failure takes nothing.",
} as const;

/** The free doors, each fetched by a standing test so this list cannot rot. */
const FREE_INSTRUMENTS = [
  {
    url: "/api/preflight/v1",
    answers: "Is this x402 door shaped the way the protocol says, and what did it actually serve?",
    method: "POST",
  },
  {
    url: "/api/conformance/v1",
    answers: "Do these signed offers and receipts conform — including a competitor's, including ours?",
    method: "POST",
  },
  {
    url: "/api/before-you-pay/v1",
    answers: "Would a stock x402 client be able to pay this door at all, before I try?",
    method: "POST",
  },
  {
    url: "/doors.json",
    answers: "Which doors have you ever looked at, and what did the last look see?",
    method: "GET",
  },
  {
    url: "/corpus.json",
    answers: "Every signed weekly snapshot, with digests, so I can rebuild any figure myself.",
    method: "GET",
  },
  {
    url: "/defects.json",
    answers: "What do you mean by each defect name, so my instrument and yours can agree?",
    method: "GET",
  },
  {
    url: "/samples/once-over.json",
    answers: "What does a paid artifact actually look like, before I buy one?",
    method: "GET",
  },
  {
    url: "/menu.json",
    answers: "What is for sale, at what price, on what cadence?",
    method: "GET",
  },
  {
    url: "/pricing",
    answers: "What are the pricing rules this store signed itself to?",
    method: "GET",
  },
] as const;

/**
 * The paid side names ids only; every price, cadence and term is read
 * off the shelf at request time.
 *
 * EXPORTED FOR THE GUARD, and the reason is a hole found by mutation
 * (2026-08-30). paidItems() DROPS an id the shelf does not carry —
 * which is the right behaviour, the same as ROOMS.deeper: a stale id
 * should vanish rather than render as a broken promise. But it means
 * a test reading only the rendered output cannot see a stale id at
 * all; the first version of the guard passed happily when one was
 * planted. The check has to read THIS list, not what survived it.
 */
export const PAID_EXAMPLES: { id: string; answers: string }[] = [
  { id: "spot_check", answers: "what the books already hold about a host, read back signed" },
  { id: "service_audit", answers: "one fresh, signed look at one endpoint, servable to a third party" },
  { id: "conformance_watch", answers: "the same battery daily for a term, with drift derived from the signed rows" },
  { id: "launch_check", answers: "one real purchase attempt of your own door, from our field wallet, signed stage by stage" },
  { id: "opening_day", answers: "that walk, then a week of daily passes on the same door, then your passport page — one certificate, one URL" },
  { id: "provenance_check", answers: "which doors advertised a receiving address and when, read from the signed chain, delivered to you and never published" },
  { id: "the_case_file", answers: "everything this store observed about one purchase in one signed file, each section present or absent by name, never a verdict" },
];

function paidItems(): { item: MenuItem; answers: string }[] {
  const out: { item: MenuItem; answers: string }[] = [];
  for (const { id, answers } of PAID_EXAMPLES) {
    const item = MENU_ITEMS.find((candidate) => candidate.id === id);
    if (item) out.push({ item, answers });
  }
  return out;
}

/** Derived so the page cannot quote a floor the shelf stopped honouring. */
function cheapestUsdc(): number {
  return MENU_ITEMS.reduce(
    (low, item) => (item.price_usdc < low ? item.price_usdc : low),
    MENU_ITEMS[0]!.price_usdc,
  );
}

const EXPECTED_OUTCOME =
  "A JSON object describing the mechanism: the five steps by which an observation becomes checkable evidence, how payment is ordered against delivery, the free doors with what each one answers, and the paid rungs with prices read off the live shelf. It takes no input, touches no wallet, and is the same for every caller.";

const ERRORS = [
  {
    code: "method_not_allowed",
    means: "This door answers GET only. A POST reaches nothing here.",
    what_to_do: "Send GET. There is no body to post and no field to fill.",
  },
  {
    code: "not_found",
    means: "The path was not /how-it-works or /how-it-works.json.",
    what_to_do: "Check the spelling. Both spellings above return the same document; the bare path also serves HTML to a browser.",
  },
] as const;

const SECURITY = {
  what_this_surface_reads:
    "Its own shelf, at request time. It takes no input, touches no wallet, makes no network call to any host, and reaches no caller-supplied URL.",
  what_it_stores_about_you:
    "Nothing. There is no account, no cookie, no body to post, and no log entry keyed to a caller — true as of 2026-08-30, and held by a standing test that fails if this door ever sets a cookie or writes anything.",
  what_the_data_is:
    "A description of this store's own method. It contains no observation about anybody else's endpoint; every such observation lives behind the free doors named here, and those say plainly what they saw and when.",
  integrity:
    "Every price and cadence on this page is read off the live shelf rather than typed, so the page cannot quote a number the store stopped charging. The evidence claims it describes are checkable at the doors it names — you do not have to take this page's word for any of them.",
  standards:
    "Disclosure is private-first and symmetric — an operator hears from us before the public does, and we hold ourselves to the same rule when the defect is ours. Corrections are dated and public, never silent, including corrections to this page.",
  reporting:
    "/.well-known/security.txt, and the corrections desk takes anything we got wrong.",
} as const;

function howToCall(base: string) {
  return {
    the_whole_document: `GET ${base}/how-it-works.json`,
    the_same_thing: `GET ${base}/how-it-works with an Accept header that is not text/html`,
    authentication: "None. No key, no header, no payment, and nothing to sign.",
    rate_limit: "None published; be reasonable and cache. The document changes only when the shelf does.",
    smallest_useful_call: `curl -s ${base}/how-it-works.json | jq '.how_money_works.order_of_operations'`,
    what_to_read_next: `${base}/doors.json for the record itself, ${base}/menu.json for the shelf`,
  };
}

const FAQ = [
  {
    q: "Why should I believe any of this?",
    a: "You should not have to. Every step names something you can check without us: the discovery feeds are public, verification is free and works offline, the snapshots carry digests you can relink, and the anchors are in Bitcoin. If a claim here has no walkable path, that is a defect and the corrections desk wants it.",
  },
  {
    q: "What happens if I pay and the thing fails?",
    a: "Nothing is taken. The work is produced before payment is presented, so a failed delivery settles nothing. That is a property of the order of operations, not a policy we could quietly change.",
  },
  {
    q: "Will buying something change what you say about my door?",
    a: "No, and the store is built so it cannot. A paid look that finds a defect reports the defect. The record is free either way, and a purchase never removes, softens, or delays an observation.",
  },
  {
    q: "Is anything here a subscription?",
    a: "No. Some items cover a term of days for a single payment, and the term simply ends. This store holds no card and no mandate, so there is no mechanism by which a second charge could happen without you deciding to make it.",
  },
  {
    q: "Can I use the record commercially, or to build a competitor?",
    a: "Yes. It is published free and licensed for reuse. We would rather the market had good evidence in it than that we were the only ones holding any.",
  },
  {
    q: "You observed my door and got it wrong.",
    a: "Two free paths: the corrections desk, which publishes dated corrections rather than quietly editing, and a standing note, which puts your own dated statement beside our observation on every surface that shows it.",
  },
] as const;

/* ------------------------------------------------------------------ */

function bodyJson(base: string) {
  return {
    what_this_is: WHAT_THIS_IS,
    what_you_can_use_it_for: WHAT_IT_IS_FOR,
    what_this_is_not: WHAT_THIS_IS_NOT,
    how_evidence_is_made: HOW_EVIDENCE_IS_MADE,
    how_money_works: {
      ...HOW_MONEY_WORKS,
      cheapest_on_the_shelf_usdc: cheapestUsdc(),
      the_whole_shelf: `${base}/menu.json`,
    },
    price: {
      this_surface: "free",
      cadence: "not applicable — nothing is charged for reading this",
      the_whole_record: "free, forever, and never behind a payment",
      free_instruments: FREE_INSTRUMENTS.map((entry) => ({
        ...entry,
        url: `${base}${entry.url}`,
      })),
      paid_examples: paidItems().map(({ item, answers }) => ({
        id: item.id,
        name: item.name,
        answers,
        price: priceLine(item),
        price_usdc: item.price_usdc,
        cadence: item.cadence,
        ...(item.term_days !== undefined ? { term_days: item.term_days } : {}),
        buy_url: `${base}/api/buy/${item.id}`,
      })),
    },
    how_to_call: howToCall(base),
    expected_outcome: EXPECTED_OUTCOME,
    errors: ERRORS,
    faq: FAQ,
    security: SECURITY,
    corrections: CORRECTIONS_POINTER,
    honest_limits:
      "This page describes the method, not its coverage. The round sees only the doors public discovery feeds declare, reads them once a week with one instrument, and this store's own host is in no round at all — a Worker cannot fetch itself — so we are structurally absent from our own denominators. That is stated because it flatters us.",
  };
}

function landingHtml(base: string): string {
  const steps = HOW_EVIDENCE_IS_MADE.map(
    (entry) =>
      `<li><strong>${escapeHtml(entry.name)}.</strong> ${escapeHtml(entry.what_happens)} <em>Check it yourself: ${escapeHtml(entry.what_you_can_check)}</em></li>`,
  ).join("");
  const free = FREE_INSTRUMENTS.map(
    (entry) =>
      `<li><a href="${escapeHtml(entry.url)}"><code>${escapeHtml(entry.method)} ${escapeHtml(entry.url)}</code></a> &mdash; ${escapeHtml(entry.answers)}</li>`,
  ).join("");
  const paid = paidItems()
    .map(
      ({ item, answers }) =>
        `<li><a href="/menu/${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong></a> &mdash; ${escapeHtml(answers)}. <em>${escapeHtml(priceLine(item))}.</em></li>`,
    )
    .join("");
  const faq = FAQ.map(
    (entry) =>
      `<p class="menu-desc"><strong>${escapeHtml(entry.q)}</strong><br>${escapeHtml(entry.a)}</p>`,
  ).join("");
  return `<section>
      <p class="menu-desc">This store watches other people's payment endpoints, writes down what it saw, signs it, and publishes it where anyone can check the writing without trusting the writer. ${escapeHtml(WHAT_THIS_IS_NOT)}</p>
    </section>
    <section>
      <h2>How an observation becomes evidence</h2>
      <p class="menu-desc">Five steps, and every one of them names something you can verify without us. A step nobody can check is a step that only works if you already believe us.</p>
      <ol class="menu-desc">${steps}</ol>
    </section>
    <section>
      <h2>What happens to your money</h2>
      <p class="menu-desc"><strong>${escapeHtml(HOW_MONEY_WORKS.order_of_operations)}</strong></p>
      <p class="menu-desc">${escapeHtml(HOW_MONEY_WORKS.what_money_buys)}</p>
      <p class="menu-desc">${escapeHtml(HOW_MONEY_WORKS.what_money_never_buys)}</p>
      <p class="menu-desc">${escapeHtml(HOW_MONEY_WORKS.recurrence)} Paid in ${escapeHtml(HOW_MONEY_WORKS.rails)}</p>
    </section>
    <section>
      <h2>What you can do with this</h2>
      <p class="menu-desc"><strong>Free, and first.</strong> None of these costs anything and none of them ever will:</p>
      <ul class="menu-desc">${free}</ul>
      <p class="menu-desc"><strong>Deeper, if you want our labour on it</strong> &mdash; a few of the shelf; the whole of it is at <a href="/menu"><code>/menu</code></a>:</p>
      <ul class="menu-desc">${paid}</ul>
      <p class="menu-desc"><strong>Or hand it to your agent.</strong> Paste this and it will do the whole thing without you: <em>&ldquo;Read ${base}/how-it-works.json to learn how this store's evidence works, then check my endpoint against it free at ${base}/api/preflight/v1.&rdquo;</em> The machine copy of this page is <a href="/how-it-works.json"><code>${base}/how-it-works.json</code></a>, and this page answers <code>Accept: application/json</code> at its own URL.</p>
    </section>
    <section>
      <h2>Questions people actually ask</h2>
      ${faq}
    </section>
    <section>
      <h2>How safe this is, and what we hold ourselves to</h2>
      <p class="menu-desc">${escapeHtml(SECURITY.what_this_surface_reads)} ${escapeHtml(SECURITY.what_it_stores_about_you)}</p>
      <p class="menu-desc">${escapeHtml(SECURITY.integrity)}</p>
      <p class="menu-desc">${escapeHtml(SECURITY.standards)} Report anything at <a href="/.well-known/security.txt"><code>/.well-known/security.txt</code></a> or the <a href="/corrections">corrections desk</a>.</p>
    </section>
    <section>
      <p class="menu-meta">${escapeHtml(bodyJson(base).honest_limits)}</p>
    </section>`;
}

function howItWorksJsonLd(base: string): string {
  return jsonLdScript({
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How scvd.store turns an observation into checkable evidence",
    description: WHAT_THIS_IS,
    url: `${base}/how-it-works`,
    isAccessibleForFree: true,
    creator: organizationRef(base),
    step: HOW_EVIDENCE_IS_MADE.map((entry) => ({
      "@type": "HowToStep",
      position: entry.step,
      name: entry.name,
      text: entry.what_happens,
    })),
  });
}

howItWorksRoutes.get("/how-it-works.json", (c) => c.json(bodyJson(c.env.STORE_BASE_URL)));

howItWorksRoutes.get("/how-it-works", (c) => {
  const base = c.env.STORE_BASE_URL;
  if (wantsHtml(c.req.header("Accept"))) {
    return c.html(
      renderSimplePage({
        title: "How this store works",
        description:
          "How scvd.store turns an observation of somebody else's payment endpoint into signed evidence a third party can check without trusting us — and what happens to your money if you buy our labour on top of it.",
        path: "/how-it-works",
        bodyHtml: `${landingHtml(base)}\n${howItWorksJsonLd(base)}`,
      }),
    );
  }
  return c.json(bodyJson(base));
});

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  guideHeadings,
  llmsForArea,
  LLMS_AREAS,
  storeGuideText,
} from "@/routes/llms";
import { LLMS_INDEX_CHARACTER_BUDGET } from "@/store/reader-limits";

const BASE = "https://scvd.store";

/**
 * THE GUIDE, SPLIT — AND THE PROOF THAT IT IS A SPLIT.
 *
 * /llms.txt was 90,540 bytes against the convention's 30,000-character
 * recommendation, and separately scored nothing for having no
 * per-area files. Both findings point the same way and neither is
 * answered by writing less: this store's pitch is that the evidence is
 * the product, so the depth stays.
 *
 * The load-bearing assertion in this file is the FIRST one. Splitting
 * a long document is the exact task where prose quietly becomes two
 * prose, a derived figure quietly becomes a typed one, and a paragraph
 * quietly gets "tidied". So /llms-full.txt is hashed against the byte
 * digest of the document as it stood before any of this was written.
 * If a single character of the guide changed, that test fails, and it
 * fails for a rewrite dressed as a restructure exactly as loudly as it
 * fails for a typo.
 */

/**
 * The document as it stood on 2026-08-27, re-taken the same day in
 * the commits that added the corpus trajectory/diff doors (3.5), the
 * wallet-facts and standing-note paragraphs (3.6, the G2 ruling),
 * the WebMCP door paragraphs (the keeper's own chats, #307/#308),
 * and the funnel's-middle sentence in the pulse paragraph (#53) —
 * this last pin taken on the rebase that joined the two lines of
 * work, over the guide carrying both. The two per-request dates are
 * normalised out.
 *
 * A CONSTANT, AND RULE 46 SAYS DERIVE OR REFUSE — so it is worth
 * saying why this one is neither a memorised value nor a guard that
 * cannot fail. It is a QUOTATION: the point is precisely that the
 * bytes do not move. Deriving it from the thing that would change it
 * would mean deriving it from the document, which would make it agree
 * with itself forever and assert nothing at all.
 *
 * Re-taken 2026-08-28 on the rebase that joined the CLI publish to
 * the audit's burst sentence: each side had correctly re-taken its
 * own digest, so the merged guide is a third text neither value
 * describes. Both sides' sentences confirmed present before this was
 * taken.
 *
 * Re-taken 2026-08-28 when CLI_PUBLISHED flipped: the guide's CLI
 * paragraph carries a different sentence once the package is really
 * on npm ("install it with" rather than "the publish has not run"),
 * and it swapped itself from the constant — this digest moving is
 * that derivation working, not prose being edited.
 *
 * Re-taken again 2026-08-28 on the second rebase, over the instrument
 * audit (#311) as well: three lines of work have now edited this guide
 * in a day, each correctly re-taking its own digest, so every rebase
 * produces a fourth text none of the parents' values describe. Each
 * side's sections were confirmed present in the served guide before
 * this value was taken.
 *
 * Re-taken 2026-08-28 in the commit that narrowed the rail-choice
 * claim (#89): the guide's paying section lost "same tiers on every
 * rail, your wallet's choice" and gained STOCK_CLIENT_RAIL_NOTE, which
 * says what a stock client actually does — takes the first surviving
 * accept, pays once, never tries the others. The cap paragraph and the
 * CLI line were both confirmed still present before this was taken.
 *
 * Re-taken 2026-08-28 by the FIRST PRICE MOVE SINCE THE CAP
 * PARAGRAPH LANDED — the coupling the note below predicted, and worth
 * reading as a worked example rather than a chore. Four doors dropped
 * to $0.99 under the stock client's ceiling, so the DERIVED count in
 * the guide moved and the bytes moved with it. No sentence was edited
 * by hand. The guard fired because the served document genuinely
 * changed, which is exactly what it is for.
 *
 * A FIFTH WAS PLANNED AND REVERTED, recorded here because the reason
 * is worth keeping: the launch check pays out from the field wallet on
 * every check, and test/field-spend-invariant.spec.ts requires its
 * price to be 50x that cap — "slightly more is not a business" once a
 * facilitator fee and gas are counted. $0.99 gave 19.8. The floor that
 * satisfies the invariant is $2.50, above the client ceiling, so that
 * door cannot be both sound and reachable. It stays at $5, disclosed.
 *
 * Re-taken 2026-08-28 in the commit that disclosed the client spend
 * cap (#52 part 1): the guide's "How paying works here" section gained
 * the paragraph naming @x402/core's default per-payment ceiling, since
 * step 3 there is the exact claim that ceiling falsifies. Taken at the
 * rebased head, with the CLI-published and burst-sentence re-takes
 * already in — three correct values for three different documents,
 * none of which survived the merge. Both of the other sides' sentences
 * were confirmed present in the served text before this was taken.
 *
 * AND A NEW WAY TO TRIP THIS GUARD, worth knowing before it surprises
 * someone: that paragraph interpolates two counts DERIVED from the
 * live shelf (doors above the ceiling, priced doors total). A price
 * change that moves a door across the ceiling now changes the guide's
 * bytes and fails this test. That is correct — the served document
 * genuinely changed — but the fix in that case is the same re-take,
 * not a hunt for an edit nobody made.
 *
 * Re-taken again 2026-08-28 when this batch rebased onto main: the
 * batch and main's own PR #310 had each re-taken the digest for their
 * own guide edits, so the rebase left a conflict between two correct
 * values and neither survived contact with the merged document. This
 * value is the guide with BOTH sets of edits, taken at the rebased
 * head — the review moment the guard exists to force, checked by
 * confirming each side's sections are still in the served text.
 *
 * Re-taken 2026-08-28 in the commit that renamed the npm package to
 * scvd-cli (the registry's typosquat guard refuses bare `scvd`; the
 * command is still `scvd`) — the guide interpolates CLI_PACKAGE and
 * CLI_INSTALL, so the CLI paragraph's bytes moved with the rename.
 *
 * Re-taken again 2026-08-28 in the commit that added the declined-
 * positions section to the guide (P12), filed under the developers
 * area.
 *
 * Re-taken 2026-08-27 in the commit that put every templated URL in
 * the guide into inline code (scanner P20 — URL extractors probed
 * {id} verbatim and reported dead links). Markup only; sentences
 * untouched.
 *
 * Re-taken 2026-08-28 in the commit that gave the Night Watch its
 * intra-tick burst: the menu description now says most ticks try the
 * door three times a few seconds apart rather than once, and the menu
 * copy is interpolated into the guide, so the words moved with the
 * instrument. The sentence was confirmed present in the served text,
 * along with the declined-positions and scvd-cli sections from the
 * earlier re-takes, before this value was taken.
 *
 * Re-taken 2026-08-28 in the commit that added the payment dry run
 * and The Good Buyer (#96). NOBODY EDITED THE GUIDE — this is the
 * derived case the note above anticipates, and the review it forces
 * was worth having, because the two moved figures are the whole point
 * of the change:
 *
 *   - the shelf gained `good_buyer, The Good Buyer, $0.99 fixed`,
 *     interpolated from the menu like every other door;
 *   - the ceiling sentence went from "9 of 25 priced doors sit above
 *     it" to "9 of 26". The over-cap count HELD while the total rose,
 *     which is the arithmetic proof that the new door landed under
 *     the ceiling rather than adding to the problem it reports on. A
 *     door about the $1 cap that had pushed that numerator up would
 *     have been the joke, and this is where it would have shown.
 *
 * Confirmed present in the served text before this value was taken:
 * `good_buyer`, `check_before_you_pay` and `/api/before-you-pay`
 * (the new tool reaches the guide through the MCP catalog and the
 * when-to-buy routes, not by hand), alongside the scvd-cli paragraph,
 * the Night Watch's three-tries sentence and the declined positions
 * from the earlier re-takes.
 *
 * Re-taken 2026-08-29 in the commit carrying the keeper's rulings.
 * THIS ONE IS THE CASE THE GUARD IS ACTUALLY FOR — a keeper edit, not
 * a derived drift — and the review it forced caught a real mistake of
 * mine before it shipped.
 *
 * What legitimately moved, each verified present in the served text
 * before this value was taken:
 *
 *   - `trust_profile ... $21 fixed` where the shelf said $19. The
 *     keeper's price, ruled. `$19` no longer appears anywhere in the
 *     guide, which is the check that the change is complete rather
 *     than half-applied.
 *   - `confirmed_on_chain` — the launch_check line he approved (D3),
 *     reaching the guide through the menu interpolation.
 *
 * AND WHAT THE RE-TAKE CAUGHT: the storefront line he approved (D1)
 * was NOT in the served bytes, because I had added
 * `STOREFRONT_COPY.recordReadsAsTime` and wired it to nothing. A
 * constant no surface renders is copy that does not exist — the
 * "machinery nobody can find" failure this store has a rule about,
 * committed while shipping the keeper's own approved words. It now
 * renders in the storefront's "what this is" section, which is where
 * the draft said it belonged.
 *
 * It is deliberately absent from the GUIDE: D1 was specced as a
 * storefront line and the guide carries its own "what this is" prose.
 * Absence there is the design, not a second miss.
 *
 * Re-taken 2026-08-29 in the commit that gave /inflows its section.
 * The no-orphan-capability guard caught the new public page listed on
 * no surface an agent reads, so the room joined rooms.ts and the
 * guide gained a section describing it — and the guide's bytes moved
 * with the words, as they should. Filed under the corpus area beside
 * the registry: both are readings off the weekly census.
 *
 * Re-taken again 2026-08-29 on the merge of those two lines of work.
 * Each had correctly re-taken the digest for its own edit, so the
 * merge produced a third text neither value describes — the recurring
 * shape this pin has now hit four times. Both notes above are kept
 * because both edits are in the served bytes: the keeper's priced and
 * approved lines, and /inflows' section. Verified present together
 * before this value was taken.
 *
 * Re-taken 2026-08-29 for the conformance desk's form. The desk had
 * been free and public since it opened and unusable without a
 * terminal; it now takes a pasted artifact in a browser, declared to
 * browser agents with WebMCP's `toolname` attributes and deliberately
 * without `toolautosubmit` — an agent may fill it, a human presses
 * submit. The guide names that, because a free instrument that gained
 * a door an agent can see is exactly the kind of fact this document
 * exists to carry.
 *
 * Re-taken 2026-08-29 for /doors — the list of every host the census
 * has ever carried (#26). The guide gained two paragraphs in the
 * corpus area: what the list is, how to filter it, and the sentence
 * that it is not a scoreboard and never becomes one. That last line
 * is the one worth having reviewed every time these bytes move.
 *
 * Re-taken again 2026-08-29 on the merge with /mcp.md's section —
 * the FIFTH time this shape has landed. Each branch correctly
 * re-took the digest for its own edit; the merge is a sixth text
 * neither value describes. Both edits are in these bytes: /doors'
 * two paragraphs and the /mcp.md section. Verified present together
 * before this value was taken.
 * Re-taken 2026-08-29 in the commit that vetted the site's
 * discoverability for agents. The index's "Evidence and record" line
 * named the corpus and the coverage file and omitted /registry,
 * /inflows and /fresh-set — the store's weekly findings, missing
 * from the one map an agent reads before anything else. Adding them
 * moved the guide's bytes.
 *
 * Re-taken 2026-08-29 in the commit that gave the guide a goal-first
 * opener and published the atlas. Vetting the site as an arriving
 * agent found a map and no route: both entry points open with ten
 * lines of what the store IS before anything actionable, and a
 * reader on a tight context budget loses the map when the file
 * truncates. "Start here, by what you came to do" now leads, filed
 * under developers, and names the atlas beside it.
 *
 * Re-taken again 2026-08-29 on the merge of those two lines of work,
 * and this resolution needed a hand rather than a script: the two
 * sides had added notes to this same block AND re-taken the value,
 * so an automated splice ate part of the second conflict and left
 * the file with two digest lines. Both notes are kept because both
 * edits are in the served bytes; the value is the merged text's own.
 *
 * Re-taken again 2026-08-29 on the merge of /doors with the
 * goal-first opener and the atlas — the SIXTH. Both sides' notes are
 * kept above because both sides' edits are in these bytes: /doors in
 * the corpus area and on the index's evidence line (which the merge
 * had to join by hand, each side having rewritten the same list),
 * and the opener, atlas and registry/inflows/fresh-set links.
 * Verified present together before this value was taken.
 *
 * Re-taken 2026-08-29 for /samples — the free specimen of the paid
 * Once-Over (#31). The guide gained a paragraph in the corpus area,
 * and the paragraph had a defect on its first draft: it wrote the
 * verify template as a bare URL, which
 * test/markdown-discoverability.spec.ts refuses, because a scanner
 * probes the braces verbatim and files us a dead link. It travels as
 * code now. This digest is the corrected text.
 * Re-taken again 2026-08-29 on the merge of the conformance form with
 * /doors and the /mcp.md section — the SEVENTH time this shape has
 * landed, and by now the pattern is the finding rather than the
 * incident. Each branch correctly re-took the digest for its own edit;
 * a merge is always a text neither value describes. All three edits
 * are in these bytes and were verified present TOGETHER, against the
 * served guide, before this value was taken: the desk's form sentence,
 * /doors' paragraphs, and the /mcp.md section.
 *
 * Re-taken again 2026-08-29 on the merge of /samples with the
 * conformance form — the EIGHTH. Both notes above are kept; both
 * sides' edits are in these bytes (the /samples paragraph in the
 * corpus area, and the form/doors/mcp.md work), verified present
 * together before this value was taken.
 *
 * Re-taken 2026-08-30 — the NINTH — for the doors opened in answer to
 * a discoverability scan. The door list in the guide gained seven
 * entries and no prose was touched: the batch preflight and /ask on
 * the free-instruments line, and /pricing.md, /auth.md, the RFC 9728
 * protected-resource metadata, /ask/feed.json and /sites on the
 * catalog line. All seven were verified present TOGETHER in the served
 * guide before this value was taken, which is the check this constant
 * exists to force — the eight notes above are all the same lesson
 * about digests re-taken against a text that had drifted since.
 *
 * Re-taken again 2026-08-30 — the TENTH — for one sentence. A declined
 * position said "inventing three of them", which
 * test/derived-not-typed.spec.ts reads as a typed tally on a served
 * surface and refuses. That guard is blunt on purpose and was right to
 * be: the phrase named three fields in the sentence before it, but a
 * reader cannot tell that from the regex's side, and the fix is to
 * write the sentence differently rather than to teach the guard an
 * exception. The seven doors added earlier today are still present in
 * these bytes and were re-verified before this value was taken.
 *
 * Re-taken 2026-08-31 — the ELEVENTH — on the declined-positions
 * section, and this one is worth reading because the guard next to it
 * is what forced the edit. Three new refusals went in and the
 * developers area file crossed the llmstxt.org 30,000-character
 * budget: 31,803. The fix was not to raise the budget or to exempt the
 * area; it was that the new entries were written at 820 characters
 * where the store's own average is 590. They are tighter now, two
 * that argued the same thing are one, and the area sits at 29,484 with
 * 516 characters of headroom. Whoever crosses it next should tighten
 * their own prose the same way rather than move the line.
 * Re-taken 2026-08-30 for the /how-it-works section — the NINTH, and
 * the first of the nine that is a plain guide edit rather than a merge
 * of two branches that each re-took it. The room was built, registered
 * in ROOMS, and named on no discovery surface at all; the guard in
 * test/no-orphan-capability.spec.ts caught it before it shipped, which
 * is that guard doing exactly its job. Verified present in these bytes
 * before this value was taken: the nav line and the drafted
 * /how-it-works paragraphs, which carry a ⚑ under rule 7 because the
 * wording is the keeper's to settle.
 *
 * Re-taken 2026-08-31 — the TWELFTH — and this one is a MERGE, which
 * is the case the eight notes above keep describing and the one this
 * constant is worst at. Two branches each re-took it correctly for
 * their own edit: main for the /how-it-works section, this branch for
 * the discoverability doors and the declined positions. Neither value
 * described the text that exists once both landed, exactly as the
 * older notes predicted. Both sides' notes are kept above rather than
 * one being dropped, and the value below was taken from the merged
 * guide with BOTH sides' work verified present in it together — the
 * /how-it-works nav line and paragraphs, and the seven new doors and
 * the tightened refusals.
 *
 * Re-taken 2026-08-31 by the THIRD RAIL REACHING THE COPY — the
 * THIRTEENTH, and a MERGE again, which the note above had just
 * finished calling the case this constant is worst at. The Polygon flag is lit, and
 * settlement_attestation's shelf description still said "on Base or
 * on Solana ... a 0x hash reads Base" while observeSettlement has
 * asked Base AND Polygon of every 0x hash since 2026-08-21. The guide
 * builds its menu lines from MENU_ITEMS, so correcting the item moved
 * the served bytes with it. No guide sentence was edited by hand; the
 * derivation carried the fix in, exactly as the price move above
 * carried a count in. Confirmed before this value was taken: the
 * served guide now carries "on Base, Polygon or Solana ... the
 * identifier's own shape picks the rail", carries neither of the two
 * retired phrasings anywhere, and still carries the idempotency and
 * scvd-tab paragraphs the earlier re-takes pinned.
 *
 * The merge half, stated separately from the edit half because they
 * fail differently: main's twelfth value describes a guide without the
 * rail correction, and this branch's described one without main's
 * /how-it-works room, the seven discoverability doors, or the tightened
 * refusals. Neither parent's value describes the merged text. The value
 * below was taken from the merged guide with BOTH sides verified
 * present in it together.
 *
 * Re-taken 2026-09-01 by the PASSPORT LEGIBILITY PASS — the
 * FOURTEENTH, and a hand edit rather than a derivation carrying one
 * in, which is the case this constant is actually FOR. The outside
 * read found /passport rendering none of the summary block it had
 * been signing since 2026-08-27, and the fix names the field agents
 * should read first. The guide's passport section is prose, so it
 * could not learn that by derivation: the paragraph now says READ
 * `payload.summary` FIRST and lists what rides in it — `decision`
 * (READY / NOT_READY / EXPIRED / INDETERMINATE, a total function of
 * `status`), `valid_until`, `evidence_age_days`, `failed`, and
 * `not_observed` — plus the rule that a refusal answers with a
 * decision too. Confirmed before this value was taken: the served
 * guide carries all three of those additions, and still carries the
 * rail correction ("on Base, Polygon or Solana"), neither retired
 * phrasing, and the idempotency, scvd-tab and /how-it-works pins the
 * earlier re-takes established.
 *
 * Re-taken 2026-09-01 — the FIFTEENTH — by derivation, not a hand
 * edit of the guide. #82 moved the paid Once-Over's cited battery
 * to v2; the shelf description is MENU_ITEMS, and the guide prints
 * those lines. Confirmed before this value was taken: the served
 * guide carries "the current v2 verdict this series now cites"
 * and no longer carries "the frozen v1 verdict this series has
 * always cited".
 *
 * Re-taken 2026-09-01 — the SIXTEENTH — by roadmap N2, the first-
 * screen packaging. The guide opened with TWO paragraphs about what
 * the store is: a hand-typed blockquote, then POSITION_OPENING under
 * it, saying the same thing in other words. The blockquote is now the
 * constant itself, the constant now opens with the keeper's sixty
 * words (VALUE_PROPOSITION, inked 2026-09-01), and one derived line
 * names the three paths in the order those words name them.
 * Confirmed before this value was taken: the served guide carries
 * the sixty words verbatim exactly once in the opening, no longer
 * carries "checkable offline without us" (the twin's tell), and
 * still carries every pin the earlier re-takes established.
 * test/first-screen.spec.ts holds the same sentence on the other
 * five surfaces. Re-taken once more the same day, after the full
 * suite caught what the targeted runs had not: the free-forever
 * verify line belongs inside the first 1,400 characters
 * (test/capability-query.spec.ts), so it rides the blockquote again
 * — derived, and worded without the twin's tell. And once more when
 * the keeper inked the sharper draft of the sixty words the same
 * evening ("i like the sharper 60 word draft"): one constant moved,
 * every surface followed, this value with it.
 *
 * Re-taken 2026-09-01 — the SEVENTEENTH — by roadmap S4, the keeper's
 * ink: the four operator instruments carry a plain subtitle beside
 * their name on every shelf surface, and the guide's menu lines
 * print "name — subtitle". Confirmed before this value was taken:
 * the guide carries "The Conformance Watch — seven days of signed
 * daily checks on your x402 endpoint" and still every earlier pin.
 *
 * Re-taken 2026-09-01 — the EIGHTEENTH — by roadmap S1: the guide's
 * corpus section names The Week's Doors (/corpus/brief), the weekly
 * brief derived from the signed snapshot. Confirmed before this value
 * was taken: the guide carries "/corpus/brief" and "never a host
 * named beside its verdict", and still every earlier pin.
 *
 * Re-taken 2026-09-01 — the NINETEENTH — by roadmap S3, the keeper's
 * price and name: The Opening Day ($9) joins the shelf and the guide
 * prints its menu line like every other item's. Confirmed before
 * this value was taken: the guide carries "opening_day, The Opening
 * Day — one launch check, seven days of conformance watch, and your
 * passport page, at one URL" and still every earlier pin.
 *
 * Re-taken 2026-09-01 — the TWENTIETH — by roadmap N4: The Company an
 * Address Keeps joins the shelf with the keeper's approved copy, and
 * the guide prints its line. Confirmed before this value was taken:
 * the guide carries "provenance_check, The Company an Address Keeps"
 * and "does not grade operators", and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-FIRST — by the passport share card:
 * the guide's passport section names ${base}/passport/card/{host}.png,
 * the page's own social image, drawn from the same dates and never
 * carrying a verdict word. Confirmed before this value was taken: the
 * guide carries "/passport/card/{host}.png" and "never a verdict
 * word", and still every earlier pin.
 *
 * Re-taken 2026-09-01 — the TWENTY-FIRST — by derivation,
 * merged in behind the five re-takes above. The standing
 * watch learned to report the hour a door's payTo moved
 * (summary.payto_changes), and the standing_watch shelf description
 * gained one clause saying so ("Where the money goes is watched,
 * though…"), flagged for the keeper's pen; the guide prints
 * MENU_ITEMS lines, so it carried the clause in. Confirmed before
 * this value was taken: the served guide carries that clause and
 * does not carry the new /what answer, which lives on /what alone.
 *
 * Re-taken 2026-09-02 — the TWENTY-SECOND — by CI on the share card:
 * the card's URL template rode the guide as bare prose, and
 * markdown-discoverability holds that a templated URL travels as
 * code so a scanner never probes "{host}" verbatim. The one sentence
 * now carries the template in backticks; no word changed. Confirmed
 * before this value was taken: the guide carries
 * "`${base}/passport/card/{host}.png`" and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-THIRD — by the keeper's ruling that
 * reopened daily_fortune: the guide's Penny Shelf sentence names the
 * fortune beside the blessing again ("the same line for every buyer
 * until midnight UTC (fortune_date rides the response)"), and the
 * MENU_ITEMS lines the guide prints gained the fortune's row, in the
 * keeper's original ink. Confirmed before this value was taken: the
 * guide carries "daily_fortune" and "fortune_date", and still every
 * earlier pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-FOURTH — by the keeper's doctrine
 * ruling (roadmap N7a): "never a score, a rating or a ranking" became
 * "never a ranking, and never a verdict without its derivation and
 * denominator beside it." The sentence rides the first screen (the
 * opening paragraph the guide shares with the homepage, the MCP
 * handshake and the skill), the per-host history paragraph no longer
 * refuses the division but requires its working, and the defect
 * vocabulary line drops "not a score". Confirmed before this value
 * was taken: the guide carries the new sentence, carries no retired
 * form (test/doctrine.spec.ts hunts them), and still every earlier
 * pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-FIFTH — by roadmap N7(b), the
 * passport tier: the passport section says every passport carries a
 * tier derived by the rule on /criteria and printed with its fraction
 * and its rows, and the corpus section names /corpus/tiers.json,
 * alphabetical because ordered by tier would be a ranking. Confirmed
 * before this value was taken: the guide carries "summary.tier_line"
 * and "/corpus/tiers.json", and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-SIXTH — by roadmap N8, the case
 * file: the guide gains one paragraph before the reading room naming
 * the_case_file, what it binds, and its door at /case/{case_id}, and
 * the MENU_ITEMS lines gained its row. Re-taken once more the same
 * hour when the case file's drafted subtitle came off (under-a-dollar
 * doors carry none), because the guide prints "name — subtitle" and
 * CI caught the stale value. Confirmed before this value was taken:
 * the guide carries "/case/{case_id}" and "never says who was in the
 * wrong", and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-SEVENTH — by roadmap S9, the named
 * exclusions: the "Our own wallets, declared" section gains one
 * paragraph naming the exclusions block on /corpus/wallet-facts.json
 * and the dated register behind it. Confirmed before this value was
 * taken: the guide carries "under \`exclusions\`" and "cannot change a
 * number quietly", and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-EIGHTH — by roadmap S11, the aura
 * walk: one paragraph after "a keeper who answers" naming aura_walk
 * and its method, the use_when list gains the walk's moment, and the
 * collab's moment drops "One door now". Confirmed before this value
 * was taken: the guide carries "aura_walk" and "never a grade", no
 * longer carries "One door now", and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the TWENTY-NINTH — by roadmap S10, The
 * Operator's Statement: one paragraph on operator_statement after the
 * aura walk's, and the use_when moment for an operator who wants the
 * month read off the chain by somebody who is not them. Confirmed
 * before this value was taken: the guide carries "operator_statement"
 * and "never a share", and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the THIRTIETH — by roadmap S8 Tier B, the
 * door's other surfaces: one section, "Prices, by the convention",
 * filed under the shelf's area, carrying a derived line per paid door
 * in the code-span shape the paid audit reads other people's llms.txt
 * by. The store's own guide is the first door that reader was pointed
 * at, and test/surface-reads.spec.ts holds it to the shelf. Confirmed
 * before this value was taken: the guide carries "Prices, by the
 * convention" and "never a number in prose", and still every earlier
 * pin.
 *
 * Re-taken 2026-09-02 — the THIRTY-FIRST — by roadmap L6, the look:
 * one paragraph for the buyer with a URL in one hand and a wallet in
 * the other, naming /api/look/v1 and the look_at_door tool, and the
 * door added to the every-door line. Confirmed before this value was
 * taken: the guide carries "/api/look/v1", "look_at_door" and "the
 * line is yours to draw", and still every earlier pin.
 *
 * Re-taken 2026-09-02 — the THIRTY-SECOND — by the statement on
 * Solana (SOLANA_PARITY gap 1): the two statements' shelf copy names
 * three rails and the unit their window counts in, and the shelf copy
 * rides into the guide's menu section.
 *
 * Re-taken 2026-09-02 — the THIRTY-THIRD and THIRTY-FOURTH, one
 * commit — by the disagreement record (house rule 51: one paragraph
 * under "When we get it wrong" naming /disagreements, the four
 * states, and that we do not put another instrument on a timer) and
 * by the observatory (one sentence after the porch's, naming
 * /observatory and that every number there is a floor). Confirmed
 * before this value was taken: the guide carries "/disagreements",
 * "never published as settled" and "/observatory", and still every
 * earlier pin.
 *
 * Re-taken 2026-09-03 — the THIRTY-FIFTH — by the AEO plan's PR 2:
 * one section, "Words people use for what this store does", kept on
 * the index, carrying the asked-for vocabulary from
 * store/copy/asked-for.ts and the byline pieces. Confirmed before this
 * value was taken: the guide carries "Words people use" and
 * "independent verification for agentic commerce", and still every
 * earlier pin.
 *
 * Re-taken 2026-09-03 — the THIRTY-THIRD — by the AEO plan's PR 3:
 * one paragraph under "The corpus" naming the page per observed host,
 * the page per signed week and the page per defect class, beside
 * their JSON twins. Confirmed before this value was taken: the guide
 * carries "/corpus/round/{week}" and "/defects/{id}", and still every
 * earlier pin.
 *
 * Re-taken 2026-09-03 — the THIRTY-SEVENTH — by the operators' room:
 * one paragraph after the look's, for anyone who runs a door, naming
 * /operators as the shelf from the seller's side in the order a
 * launch happens, free first at each moment. Confirmed before this
 * value was taken: the guide carries "/operators" and "never a
 * ranking, and nothing there certifies anyone", and still every
 * earlier pin.
 *
 * Re-taken 2026-09-03 — the THIRTY-EIGHTH — by the keeper's category
 * clause (AEO fix F19, "agreed on all"): the sixty words' first
 * sentence now reads "evidence observatory for agentic commerce:
 * independent verification of x402 endpoints, payments and
 * receipts", and the guide's opening blockquote inherits it. Confirmed
 * before this value was taken: the guide carries the clause verbatim
 * once in the opening, the second byline piece (dev.to) in "Words
 * people use", and still every earlier pin.
 *
 * Re-taken 2026-09-03 — the THIRTY-NINTH — by the keeper's ink on
 * the ink sheet ("im good with these"): the two statements' row copy
 * widened to the four reader chains in the constraints and the
 * descriptions that ride the guide's menu section, keeping the
 * network= vocabulary the door reads. Confirmed before this value
 * was taken: the guide carries "network=eip155:137" and "Ethereum,
 * Arbitrum, Optimism or Avalanche", and still every earlier pin.
 *
 * Re-taken 2026-09-03 — the FORTIETH — by the keeper confirming
 * the dev.to piece's title against the page, full stop included: the
 * byline line in "Words people use" carries WRITTEN_ABOUT titles
 * verbatim, so one character in the constant is one new digest.
 * Confirmed before this value was taken: the guide carries the title
 * with its full stop, the second byline URL, and still every earlier
 * pin.
 *
 * Re-taken 2026-09-03 — the FORTY-FIRST — by the independent
 * reporting: the guides' vocabulary block now ends with Cairn's two
 * pieces, named as theirs and not as endorsements. Confirmed before
 * this value was taken: the guide carries "Reported on independently"
 * and both cairnwake.com URLs, and still every earlier pin.
 * Re-taken 2026-09-03 — the FORTIETH — by the feeds (roadmap V2):
 * one paragraph after the operators', for a reader who polls rather
 * than reads, naming /feeds and that every entry links the page the
 * derivation and the denominator are on. Confirmed before this value
 * was taken: the guide carries "/feeds" and "If you poll rather than
 * read", and still every earlier pin.
 *
 * Re-taken 2026-09-03 — the FORTY-FIRST — by the state of x402 by
 * month (roadmap V5): one paragraph between the operators' and the
 * feeds', naming /corpus/month, the closing week beside the
 * door-weeks, and the stable address per month. Confirmed before
 * this value was taken: the guide carries "/corpus/month" and "Two
 * kinds of number, never a share", and still every earlier pin.
 *
 * Re-taken 2026-09-03 — the FORTY-SECOND — by the feeds' four URLs
 * named in the guide's feeds paragraph, because a route no agent
 * surface names is an orphan capability (test/no-orphan-capability)
 * and a poller wants the feed address, not the page that lists it.
 * Confirmed before this value was taken: the guide carries
 * "/feeds/brief.xml" and "/feeds/disagreements.xml", and still every
 * earlier pin.
 *
 * Re-taken 2026-09-03 — the FORTY-THIRD — by one pair of backticks:
 * the month paragraph's stable address carries braces, and the
 * markdown-discoverability spec holds every templated URL in the
 * guide to a code span so a reader never lifts a bare one. Confirmed
 * before this value was taken: the guide carries the address inside
 * backticks, and still every earlier pin.
 *
 * When the keeper genuinely edits the guide, this fails, and the fix
 * is to re-take the digest in the same commit as the edit — which is
 * the review moment this exists to force.
 */
const GUIDE_DIGEST_BEFORE_THE_SPLIT =
  "2e073ae92bcfd5b5b80af698faf55bfc406b83c20fc91a6ac8ad30160202dfa1";

/** The llmstxt.org recommendation the index is being held to. */
const INDEX_CHARACTER_BUDGET = LLMS_INDEX_CHARACTER_BUDGET;

function normalize(text: string): string {
  return text
    .replace(/Served: \d{4}-\d{2}-\d{2}/g, "Served: <DATE>")
    .replace(/Last checked by hand: \d{4}-\d{2}-\d{2}/g, "Last checked: <DATE>");
}

async function digest(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function body(path: string): Promise<string> {
  const response = await SELF.fetch(`${BASE}${path}`);
  expect(response.status, path).toBe(200);
  return response.text();
}

describe("nothing was rewritten", () => {
  it("serves the complete guide at /llms-full.txt, byte for byte", async () => {
    const full = await body("/llms-full.txt");
    expect(await digest(normalize(full))).toBe(GUIDE_DIGEST_BEFORE_THE_SPLIT);
  });

  it("keeps /llms-full.txt and storeGuideText the same document", async () => {
    /*
     * The MCP read_store_guide tool serves storeGuideText too. An
     * agent that asked the server for the guide must get the whole
     * thing, not the index — the split is a WEB convention, and a tool
     * call is not a crawler.
     */
    expect(await body("/llms-full.txt")).toBe(storeGuideText(BASE));
  });
});

describe("the index is an index", () => {
  it("fits the convention's recommendation, with room", async () => {
    const index = await body("/llms.txt");
    expect(index.length).toBeLessThan(INDEX_CHARACTER_BUDGET);
    // And is genuinely smaller than what it replaced, not trimmed to
    // the line: the whole guide is over 89,000 characters.
    expect(index.length).toBeLessThan(storeGuideText(BASE).length / 3);
  });

  it("is no longer the same document as /llms-full.txt", async () => {
    /*
     * Until today these two paths served identical bytes and the
     * preamble apologised for it. The convention reserves llms-full
     * for the complete prose precisely so llms.txt can be a map.
     */
    expect(await body("/llms.txt")).not.toBe(await body("/llms-full.txt"));
  });

  it("names every area file, and every one of them answers", async () => {
    const index = await body("/llms.txt");
    expect(LLMS_AREAS.length).toBeGreaterThan(1);
    for (const area of LLMS_AREAS) {
      const url = `${BASE}${area.path}/llms.txt`;
      expect(index, area.slug).toContain(url);
      expect((await SELF.fetch(url)).status, url).toBe(200);
    }
  });

  it("points at a human page only where one exists", async () => {
    /*
     * `page` is absent on the shelf because /menu serves no page: the
     * catalog is machine-readable at /menu.json and rendered for
     * people on the front of the store. Both directions are asserted,
     * so neither an absent page that exists nor a claimed one that
     * does not can survive.
     */
    for (const area of LLMS_AREAS) {
      const response = await SELF.fetch(`${BASE}${area.path}`, {
        headers: { Accept: "text/html" },
      });
      if (area.page) {
        expect(response.status, `${area.path} is claimed as a page`).toBe(200);
      } else {
        expect(
          response.status,
          `${area.path} claims no page, so it must not serve one`,
        ).not.toBe(200);
      }
    }
  });

  it("keeps the door list, which is what the orphan guard reads", async () => {
    /*
     * Moving "Every door, in one list" into an area file would have
     * made every door one hop further from the surface
     * test/no-orphan-capability.spec.ts checks. It stays on the index.
     */
    const index = await body("/llms.txt");
    expect(index).toContain("## Every door, in one list");
    expect(index).toContain("## When to use this store, and when not to");
  });
});

describe("every section is filed exactly once", () => {
  it("loses no section between the index and the area files", { timeout: 15_000 }, async () => {
    /*
     * THE MAP IS THE ONE HAND-TYPED THING IN THIS SPLIT, so it is the
     * one thing guarded in both directions. A heading in the document
     * and in no file publishes a store with a hole in it; a heading in
     * two files publishes it twice and lets the copies drift.
     */
    const rendered = guideHeadings(BASE);
    expect(rendered.length).toBeGreaterThan(30);

    /*
     * EACH DOCUMENT IS FETCHED ONCE, then every heading is checked
     * against the in-memory copies. The first cut re-fetched every
     * area file per heading — thirty-odd headings times every area,
     * hundreds of identical renders — and on saturated CI runners
     * (imports alone at 1,700s, twice on 2026-08-27) that loop blew
     * the 5s default and failed the build on main. Same test timing
     * out twice is ours by house rule; the fix is the redundant work,
     * not the assertion.
     */
    const index = await body("/llms.txt");
    const areaTexts = new Map<string, string>();
    for (const area of LLMS_AREAS) {
      areaTexts.set(`${area.path}/llms.txt`, await body(`${area.path}/llms.txt`));
    }
    const seen = new Map<string, string[]>();

    for (const heading of rendered) {
      const homes: string[] = [];
      if (index.includes(`## ${heading}\n`)) {
        homes.push("/llms.txt");
      }
      for (const [path, text] of areaTexts) {
        if (text.includes(`## ${heading}\n`)) {
          homes.push(path);
        }
      }
      seen.set(heading, homes);
    }

    const orphaned = [...seen.entries()].filter(([, homes]) => homes.length === 0);
    const duplicated = [...seen.entries()].filter(([, homes]) => homes.length > 1);
    expect(orphaned.map(([heading]) => heading)).toEqual([]);
    expect(
      duplicated.map(([heading, homes]) => `${heading}: ${homes.join(", ")}`),
    ).toEqual([]);
  });

  it("files nothing under an area that does not exist", () => {
    // The other way a filing map rots: a heading that was renamed, and
    // an entry pointing at a slug nobody serves.
    const slugs = new Set(LLMS_AREAS.map((area) => area.slug));
    for (const area of LLMS_AREAS) {
      expect(llmsForArea(BASE, area.slug), area.slug).toBeTruthy();
    }
    expect(llmsForArea(BASE, "not-an-area")).toBeNull();
    expect(slugs.size).toBe(LLMS_AREAS.length);
  });

  it("carries each area's sections whole, not summarised", async () => {
    /*
     * The failure this whole file exists to prevent, checked from the
     * other end: an area file must contain its sections VERBATIM as
     * the full document renders them, not a paraphrase of them.
     */
    const full = storeGuideText(BASE);
    const sections = full.split(/^## /m).slice(1);
    for (const area of LLMS_AREAS) {
      const text = await body(`${area.path}/llms.txt`);
      const mine = sections.filter((section) =>
        text.includes(`## ${section.split("\n")[0]}\n`),
      );
      expect(mine.length, area.slug).toBeGreaterThan(0);
      for (const section of mine) {
        expect(text, `${area.slug}: ${section.split("\n")[0]}`).toContain(
          `## ${section}`.trimEnd(),
        );
      }
    }
  });

  it("ends every area file somewhere, never on a dead end", async () => {
    for (const area of LLMS_AREAS) {
      const text = await body(`${area.path}/llms.txt`);
      expect(text, area.slug).toContain(`${BASE}/llms-full.txt`);
      expect(text, area.slug).toContain(`${BASE}/llms.txt`);
      // And names its siblings, so a reader who landed here by search
      // can reach the rest without going back to the index first.
      for (const other of LLMS_AREAS.filter((entry) => entry !== area)) {
        expect(text, `${area.slug} -> ${other.slug}`).toContain(
          `${BASE}${other.path}/llms.txt`,
        );
      }
    }
  });

  it("says out loud that the shelf file is the big one", async () => {
    /*
     * NOT EVERY AREA FILE IS SMALL, and pretending otherwise would be
     * the same shape of half-truth as the 90kB llms.txt. The shelf is
     * 27,000 characters of per-item prose derived from MENU_ITEMS —
     * splitting it further would mean cutting the menu in half at some
     * arbitrary item. The convention's budget is on llms.txt, which is
     * met; this records that one section file exceeds it on purpose.
     */
    const shelf = LLMS_AREAS.find((area) => area.slug === "menu");
    expect(shelf).toBeTruthy();
    const text = await body(`${shelf!.path}/llms.txt`);
    expect(text.length).toBeGreaterThan(INDEX_CHARACTER_BUDGET);

    // Every other area file does fit, and that is worth holding.
    for (const area of LLMS_AREAS.filter((entry) => entry.slug !== "menu")) {
      expect(
        (await body(`${area.path}/llms.txt`)).length,
        area.slug,
      ).toBeLessThan(INDEX_CHARACTER_BUDGET);
    }
  });
});

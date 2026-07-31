/**
 * THE CORRECTIONS RECORD — things this store said that were not true,
 * and what changed so each one cannot recur quietly.
 *
 * Filed as gap 3, published 2026-07-29 after CV validated it with one
 * requirement that shapes the whole artifact:
 *
 *   EVERY ENTRY MUST PAIR THE MISTAKE WITH THE STRUCTURAL FIX. A list
 *   of admissions with no corresponding hardening reads as "this keeps
 *   happening," not "this gets caught and fixed." An entry missing the
 *   second half either gets one before publishing or does not belong in
 *   the initial set. A test enforces it, because a rule in a file is
 *   not a test — which is itself the lesson of entry one.
 *
 * AND LEAD WITH MECHANISM, NOT CHRONOLOGY, also his: a handful of
 * corrections dated inside one tight week can read as "launched in a
 * hurry, still finding bugs" to a suspicious reader. The same fact reads as a fast
 * feedback loop only if the mechanism is what goes first. So the page
 * opens on how things get caught and only then lists what was caught.
 *
 * WHY PUBLISH IT AT ALL: a store claiming zero mistakes across its
 * first week of live operation is making the implausible claim, not the
 * honest one. And age is the one objection this store cannot fix — an
 * outside risk scorer said so out loud, `review`, 63/100, on the
 * grounds that our address was six days old. A dated record of what we
 * got wrong is the asset a young store has that a polished one usually
 * does not.
 */

export interface Correction {
  /** ISO date the correction shipped. */
  date: string;
  /** What the store said or did that was not true. Plainly. */
  what_was_wrong: string;
  /** How long it was live, when we can say. Never softened. */
  how_long: string;
  /** Who found it. Outside eyes get named as outside eyes. */
  found_by: string;
  /**
   * THE REQUIRED HALF: what changed so it cannot recur silently. A
   * mechanism, not an intention. "We will be careful" is not a fix.
   */
  what_changed: string;
}

export const CORRECTIONS: readonly Correction[] = [
  {
    date: "2026-07-31",
    what_was_wrong:
      "/stack told buyers that if this store's signing key were lost, \u201Cevery artifact ever issued becomes unverifiable.\u201D That was never true, and it was the scarier half of the sentence. The public key and the exact signed bytes are already published and already copied — out of our hands by design — so anything signed stays checkable by whoever holds it whatever happens to us. What a lost key actually costs is the FUTURE: nothing new could ever join the record. The same entry also said the key had \u201Cno substitute and no recovery,\u201D which stopped being true the day a paper backup existed. And separately, /attestation's statement of exactly which fields a certificate signature covers was a hand-written list that had fallen a day behind the code — it omitted made_by, then the five payment fields, on the one page whose whole job is telling a reader which bytes are covered.",
    how_long:
      "The unverifiable claim: since /stack was published on 2026-07-29, three days. The stale field list: about a day, from when made_by shipped.",
    found_by:
      "Ourselves, on a deliberate read-every-page pass the keeper asked for after a run of small nuanced slips. Notably NOT by a test: every claim here was prose, and prose about code is the category with no compiler.",
    what_changed:
      "Both fixed, and both structurally rather than by editing a sentence. The field list on /attestation is now DERIVED from the same CERT_FIELDS array the signing code walks, so the page cannot describe a different set than the one being signed, and a test fails the build if any signed field goes unmentioned. The /stack entry now says what a lost key actually costs, states that recovery covers loss and not theft, and points at key_history. The lesson recorded rather than the instance: a prose list beside a code list is two sources of truth for one fact, which is the same defect as a hand-typed rotation count and a hand-typed \u201Cnever rotated\u201D line, both of which broke the same week.",
  },
  {
    date: "2026-07-31",
    what_was_wrong:
      'Two things, and the second is the one that matters. FIRST: the store had no recoverable copy of its signing key, and said the opposite by implication for nine days — /stack called the key a dependency with no substitute, /wind-down promised every signature stays checkable forever, and neither page mentioned that the single private key existed in exactly one place with no way to read it back. Cloudflare Worker secrets are write-only, which is correct, and means the copy taken at setup was the only one there would ever be. No copy was taken. Not a decision; nobody thought that far ahead. SECOND: the line published beside the key itself read "This key, this wallet, this domain, NEVER ROTATED" — and the store rotated its signing key that afternoon, which left a boast about a streak sitting on the most machine-read surface here, hours after it stopped being true. The same deploy served key #2 with an in-service date of 2026-07-22, nine days before it existed, on a field a holder uses to place an artifact in time.',
    how_long:
      "The missing backup: from 2026-07-22 to 2026-07-31, the whole life of the first key. The false identity policy and the wrong service date: under an hour, between the secret changing and the sweep that followed it.",
    found_by:
      "Ourselves, and by the only method that would have worked: writing the procedure down. The gap did not surface from thinking about key management, which we had done that morning — it surfaced at step one of an actual paper-backup ceremony, at the line that said \"get the seed on screen,\" because there was nowhere to get it from. A published protocol was what turned an assumption into a step somebody had to perform. The identity-policy lie was caught by the keeper reading the live key endpoint immediately after the swap, which is the same habit that has now found three of these.",
    what_changed:
      "The store performed its first key handover, under the succession protocol it had published that morning and under every line of it: the new key announced before it signed anything, the announcement itself signed by the OUTGOING key and verifiable at /api/verify/handover_1, the retired key published forever with its service dates so every artifact issued under it stays attributable. It was not a drill and is not described as one. Structurally: key history is now a registry rather than an assumption, every verify response names which published key signed a thing — and says so out loud when a signature matches NO key we have ever published, which was previously reported as simply valid; the rotation count and the current key's service date are both DERIVED from that registry rather than typed, because a typed count is a claim with a timer on it, which is precisely what the \"never rotated\" line was. The new key was written on paper and verified FROM the paper, on two sheets, before it signed anything. Ten tests that pinned the old wording failed and were rewritten to assert the commitment rather than the count. And the cause is fixed at its root: `npm run keys:generate` now prints a warning before the number saying it invents a NEW key and cannot show you your existing one — the keeper reached for it looking for the live seed, reasonably, because it is the only key-shaped command in a repo with one key.",
  },
  {
    date: "2026-07-30",
    what_was_wrong:
      'The listing spec told buyers a lucky was "graded honestly, by a person." No person grades a lucky. The animal, the note and the strength all come from a hash of the certificate id, and the code that does it says so in its own comment: "the keeper does nothing per order." The true part — that he wrote the herd and weighted the odds — was real; the per-charm human judgement was not. It rode into the OpenAPI summary, menu.json, the x402 discovery document and skill.md.',
    how_long: "Live on every machine surface for five days.",
    found_by:
      "Nobody, for five days. Then by scoping an unrelated feature: a maker's mark for the shelves where a buyer cannot tell whether a person or a script made the pick. Asking who made the pick is what surfaced a shelf whose answer had been written down wrong.",
    what_changed:
      "The line says what the code does. The structural half is the point: a maker's mark is now a signed certificate field derived from one table keyed by item, so a shelf cannot describe its own provenance, and a test walks all three copy maps — the OpenAPI summary, the listing spec and the storefront returns — failing the build if any of them claims a person on a shelf whose fulfilment path has none. The claim and the code are tied together now; they were not before, which is why they drifted.",
  },
  {
    date: "2026-07-26",
    what_was_wrong:
      'Every surface of this store said refunds were "automatic." The code never did it. A refund here was always a person keeping his word, which is a fine promise and a different one.',
    how_long: "Live on every surface for five days.",
    found_by:
      "An outside model, repeating our own wording back to us. Nobody here noticed.",
    what_changed:
      "The wording now says what the code does. More importantly: every claim the store makes about itself is walked by a test in CI, so a promise the code cannot keep fails the build instead of shipping. That test exists because of this entry.",
  },
  {
    date: "2026-07-25",
    what_was_wrong:
      "Parameter guards fired BEFORE the payment gate, so an indexer asking a paid route what it cost got a 400 error instead of a price — and concluded we were not an x402 endpoint at all.",
    how_long: "Since the affected items were listed.",
    found_by:
      "A directory's probe report: three of six endpoints answered. The three that did not were ours to fix.",
    what_changed:
      "Guards moved behind the gate, and a test now asserts that an UNSIGNED request to any paid route gets a 402 with the terms stated rather than a 400. The store cannot again refuse to quote a price to something trying to read one.",
  },
  {
    date: "2026-07-28",
    what_was_wrong:
      'The census page told the keeper that "the decline reasons are on the desk." There was no desk. The reasons had been recorded since the instrument went in and nothing anywhere rendered them.',
    how_long: "From the day the census shipped until somebody went looking.",
    found_by:
      "The keeper, following our own instruction and hitting nothing.",
    what_changed:
      "The decline desk was built, and a test now asserts that every page promising a link actually links somewhere that exists. A sentence pointing at a page nobody built now fails the build.",
  },
  {
    date: "2026-07-28",
    what_was_wrong:
      "Five pages of the store's own back room had no way back to anything. Each rendered itself as the desk's tab, which draws the only link home as un-clickable bold, so landing on one left the keeper with the browser's back button.",
    how_long: "From the day each reading shipped.",
    found_by: "The keeper, unable to reach half his own office.",
    what_changed:
      "The navigation is now derived from one list rather than written per page, so a new page cannot be added without appearing in it. Four tests sweep every page: each reaches every other, each marks only itself, each keeps a way out.",
  },
  {
    date: "2026-07-29",
    what_was_wrong:
      'This store told visitors that "CI validates the catalog against it on every build," and told machine readers that field order was "validated in CI." There was no CI. Four hundred tests, run exclusively by hand.',
    how_long:
      "For as long as those sentences existed — the tests were always real, the sentence about when they run was not.",
    found_by:
      "Us, while working out how the keeper could publish a skill from a phone. Nobody was looking for it.",
    what_changed:
      "The claim was made true rather than softened: CI now runs the typecheck and the full suite on every push and every pull request. The sentence that was false is the sentence that now describes a workflow file.",
  },
  {
    date: "2026-07-30",
    what_was_wrong:
      "Certificates could not actually be verified by the person holding one. The key and the signature were real and correctly shaped, and /api/verify — the endpoint that exists for nothing but third-party checking — never published what the signature covers, so there was no way to reconstruct the signed bytes except by guessing. Worse, two fields shown on certificates were not signed at all: a buyer's tag, and the `attests` hash that binds a certificate to the settlement observation it vouches for. An unsigned binding can be altered without breaking the signature, so the one field whose whole job was to make one artifact answer for another was the one field the signature did not cover.",
    how_long:
      "The documentation gap since the endpoint existed. The two unsigned fields since 2026-07-28, when both were added and the canonicalizer was not.",
    found_by:
      "A partner agent, from outside, holding a real certificate — he ran the ed25519 himself against every plausible canonicalization, watched all of them fail, and confirmed the crypto before reporting it rather than passing along a suspicion.",
    what_changed:
      "The endpoint no longer describes the canonical form, it SERVES it: every signed artifact now returns signed_payload, the exact string the signature covers, so verification is one library call with nothing guessed. The certificate canonicalizer now walks a declared field list, and a type-level check fails the build if a field is ever added to a certificate without being signed — the class of bug, not just its two instances. Certificates minted before the fix still verify under the form they were actually signed with, and say on their face which fields that signature leaves out. And the test that missed this now exists: verification in CI re-derives the bytes from the SERVED response and checks them with the raw ed25519 library, because every previous test verified through the same function that signed, and a function's blind spots are invisible to itself.",
  },
  {
    date: "2026-07-30",
    what_was_wrong:
      "On the day this store took its first payment from a stranger, the page built to watch for exactly that still said zero — that not one client outside the house had ever presented a payment signature. The census grouped clients by user-agent alone and marked a whole group as house the moment ANY event in it was house-flagged, then skipped it. A user-agent is a bucket rather than a person, and the emptiest bucket is \"(no user-agent)\", which the keeper's own scripted tests and a hand-rolled buyer both fall into. So the proprietors testing their own till made every outside client sharing a user-agent string invisible, on the single number the whole store is built to watch.",
    how_long:
      "From the day the census shipped. It could only ever be seen on a day the number was supposed to change, and that day was the first one.",
    found_by:
      "The keeper, reading his own office the hour the sale landed — and reading it generously, as a window-boundary quirk rather than a bug. It reproduced in three lines.",
    what_changed:
      "Clients are now keyed by user-agent AND house flag, so a house event still counts as house exactly as before and no longer swallows everyone standing next to it. The reproduction is a permanent test — one house settle and one outside settle sharing a user-agent must show the outside buyer — alongside its opposite, that the fix never lets house traffic read as a customer, since trading an undercount for that overcount would be far worse. The page's verdict was always computed rather than written, so no copy needed editing: fixing the books fixed the sentence, which is why it is built that way.",
  },
] as const;

export const CORRECTIONS_STANDFIRST =
  "Things this store said that were not true, what found them, and what changed so each one cannot happen again quietly. Dated, in the open, and not summarised anywhere kinder.";

/** Mechanism first, per CV. Chronology alone reads as instability. */
export const CORRECTIONS_MECHANISM =
  "HOW THINGS GET CAUGHT HERE, which matters more than the list below: every claim this store makes about itself is walked by a test, and the build fails when a promise outruns the code. That machinery exists because of the first entry below rather than in spite of it — each correction added the check that would have caught it. So the honest way to read a growing list is not \"they keep breaking things\" but \"the loop is short and it is running.\" A store this young claiming a clean record would be making the less plausible claim.";

/**
 * THE SECOND MECHANISM, ADDED 2026-07-30 BECAUSE THE FIRST ONE WAS NOT
 * ENOUGH AND WE CAN NOW PROVE IT.
 *
 * The paragraph above was true and incomplete, which is the more
 * dangerous kind of claim. Entry six was invisible to four hundred and
 * forty-six passing tests, and not by accident: every one of them
 * verified a signature by calling the same function that produced it.
 * Sign with f, verify with f, and f's own blind spots are invisible from
 * inside that loop permanently — no amount of the same kind of test
 * finds them, because the error cancels itself on both sides.
 *
 * That is not a gap peculiar to this store. It is structural to
 * self-verification anywhere, and it means a store cannot audit its own
 * signatures on its own authority, however many tests it runs. The only
 * vantage point that can see it is somebody holding nothing but a public
 * URL. So the outside read is not a courtesy or a nice-to-have QA step;
 * it is the only instrument that reaches this class of defect at all,
 * and it is now named on the page as machinery rather than as thanks.
 */
export const CORRECTIONS_OUTSIDE =
  "AND THE PART WE CANNOT DO OURSELVES, which the sixth entry below proved rather than suggested: a store cannot audit its own signatures on its own authority. That entry was invisible to four hundred and forty-six passing tests, and not by carelessness — every one of them checked a signature by calling the same code that made it, so a flaw in that code cancelled itself on both sides of the check and no quantity of the same kind of test could ever have surfaced it. It took somebody outside, holding nothing but a public URL and using their own cryptography library, to see that our certificates could not actually be verified. That is structural to self-verification anywhere, not a habit of ours, which is why the outside read is listed here as machinery and not as gratitude: it is the only vantage point that reaches this class of defect. Tests in CI now re-derive the signed bytes from the SERVED response and check them with the raw library, which is the closest an inside test can get to standing outside — and it is still not the same thing. If you hold something we signed and it does not check out, the mailbox is free.";

export const CORRECTIONS_SCOPE =
  "WHAT THIS IS NOT: a bug log. Ordinary defects get fixed and forgotten like anywhere else. This page is narrower and more uncomfortable — it is only for things the store SAID, on a surface somebody could read, that turned out not to be so. Every entry names what changed structurally; an admission without a mechanism behind it would read as an apology, and this store does not trade in those.";

export const CORRECTIONS_INVITATION =
  "If you find another, the mailbox at /api/letter is free and a human reads it. A correction costs us nothing except the writing down, and the writing down is the point.";

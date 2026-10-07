# Writing and recognition — October 6 observation, October 7 implementation

The keeper authorized the addition primarily for AEO/SEO, with a low-profile
human presentation. The existing article inventory remains the source for the
guides, homepage Article metadata and the new plain-HTML section near the footer.
No new route or page tree, dependency, network request, crawler-specific content,
hidden keyword copy, payment behavior or automatic publication is introduced.

## Recognition evidence

[Keeper-supplied screenshot](hackernoon-web3.png), captured October 6, 2026 at
8:10 PM in the keeper's local context. It shows the Web 3 heading and keeper
(@keeper-scvd) first, followed by KX and Roman Wiligut. The original screenshot
was copied without alteration. SHA-256:
`fc07fcc37fba68cce66fe5ec394713101b0f7bf5074b6d9930c98503b2b234d3`.

The claim is a dated observation of HackerNoon's writers category. It is not a
current standing rank, a claim about all technology writers, an award to SCVD,
or an endorsement of the store's services. The live list can change. Automated
reads in the preceding discussion returned conflicting cached lists; the
keeper's supplied image is the evidence retained here.

The homepage links both the writers list and this image in the public repository.
The image link becomes available when this directory reaches the repository's
main branch; publication of the code must include it.

## Content and discovery

- Existing four bylines retain their titles and original article URLs.
- Each now has a byline/profile, publication date, short summary and a link to
  a relevant existing store page. The keeper's authorship is stated visibly.
- Article metadata gains author, datePublished, description and about; the
  external publication remains publisher. Recognition is not encoded as an
  Organization award or rating, and article URLs do not become sameAs identities.
- Existing independently authored reporting retains its separate inventory and
  metadata. It is not repackaged as a testimonial in the new section.
- `/index.md`, `/agents.md`, `/llms.txt` and `/llms-full.txt` inherit the same
  article facts and dated recognition through the existing shared copy.
- Source read: [October 7 entry](../../docs/SPEC_READS.md#2026-10-07--writing-and-recognition-discovery).

## Follow-up: author identity and article destinations

Every keeper-authored Article now refers to `https://scvd.store/#keeper`, with
both publication profiles in `sameAs` and SCVD in `worksFor`. The corresponding
visible paragraph identifies who runs the store. `/what`, `/conformance`,
`/corpus` and `/try` each link back to their relevant article through the same
inventory; unrelated rooms get no writing section.

[Ranked future-story destinations](article-destinations.md) pair reader problems
with existing evidence pages and useful actions. All eleven public destinations
returned 200 in the [dated link check](destination-check.json). Story-specific
case records still need to be selected before drafting; no evidence is invented.
Existing `/admin/referrals` and `/admin/growth` counters are reused. They cannot
prove an individual article caused a purchase.

## Validation and release

The four initial discovery tests failed before implementation. The two follow-up
tests likewise failed for the missing shared identity and contextual links,
then passed. The six focused files pass 48 tests in the shared checkout.

The release is isolated from unrelated local work on `codex/writing-recognition`,
based on main `384978f8`. Main has newer guide copy than the shared checkout:
restoring only `askedForBlock()` to main reproduces both prior fingerprints,
with all 14 modular-guide tests passing. The release pins retain main's wording
and add only this task's writing paragraph.

Initial typecheck, production bundle checks and browser preview passed.
Release validation passed the same 48 focused tests, typecheck and all bundle
checks. The normal full CI gate remains required before merging. The screenshot ships
with the code so its public evidence link resolves on main.

This is an implementation and measurement record, not evidence of search gains.
Search Console access to the property was unavailable in the preceding audit.
No recrawl, indexing, AI citation, traffic lift or conversion effect is claimed.

## Release handoff, October 7

[PR #993](https://github.com/seancrecord/scvd-general-store-repo/pull/993) contains
only this task's changes. The GitHub connector cannot create PRs with its current
permissions and the CLI login returned 401; the signed-in browser created the PR.
A normal merge commit is configured after the required checks pass.

The browser blocked access to `/admin/referrals` (`ERR_BLOCKED_BY_CLIENT`). No
private analytics baseline was retrieved. The measurement plan records existing
counters and their limitations; future results must be read from an accessible
admin session and the owner's Search Console property.

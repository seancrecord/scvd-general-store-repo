# Direct-link follow-through — September 15, 2026

The new buyer link instrument followed **322 public starting URLs through 323 GET requests**, including the menu redirect. It found **no 404/410, redirect loop, authentication/access refusal, server error, malformed promised JSON, or unexpected promised content type** in this bounded pass. It submitted no payment and spent **0 USDC**. This is a direct-link follow-through, not a complete recursive crawl.

## What was read

The seed set was derived with the repaired shared extractor from retained homepage, skill, llms, menu and OpenAPI snapshots; their acquisition hashes were checked before use. All fetched hops retain status, content type, byte count and body hash when the read completes. The immutable journal is `requests.jsonl`, with ordered results in `results.json`.

The pass read 264 successful documents, observed 42 payment-required responses, and kept 15 HTTP refusals for context review. Successful-format checks covered 63 JSON documents and nine Markdown documents; 192 other successful documents were reachable but had no asserted format. A 402 here establishes neither usable payment terms nor a purchase.

The 15 refusals were reviewed against the retained OpenAPI contract: nine were GET requests to POST-only operations, four used abbreviated `0x...` example values, and two omitted documented required query arguments. They are not new confirmed dead-link defects. `refusal-review.json` links each disposition to its request and public schema. This does not establish that every error answers the six buyer questions or that the POST operations work.

## Explicit limits and follow-ups

The default four-MiB read stopped on `/corpus.json`; the raw result remains **incomplete**. A separate follow-up allowed at most 16 MiB and read all **11,494,918 bytes**, with valid JSON and the correct content type. The normal collector limit was not raised. The follow-up also verified JSON after `/menu` redirects to `/menu.json`; the original run had recorded that starting URL's format as unasserted. These three additional GETs are separate evidence, for **326 GETs total** in this follow-through.

The 18 unresolved template occurrences remain unrequested. The runner stops after five same-origin redirects, twenty seconds per seed, or its body ceiling; an outside-origin redirect or budget stop cannot silently pass. No all-page recursion, JSON-reference resolution, all-error coverage, MCP installation, paid cold walk, mobile layout or full-shelf acceptance is claimed.

## Instrument checks

Eight added cases cover loops, missing redirects, unsupported destinations, MIME/JSON mismatches, explicit refusal classes, truncated/failed reads and final redirect extensions. The latter failed before its fix. Disabling loop detection, JSON parsing and the body ceiling made all three corresponding detector tests fail; the module was then restored byte-for-byte. All **44 buyer benchmark/evidence tests pass**. The initial seven-test baseline failed because this new module was absent, not because seven production defects were observed.

Reproduce with `node scripts/buyer-link-check.mjs <retained-public-snapshot-directory> <new-output-directory>`. It loads no wallet, sends only GET and refuses to overwrite a prior collection. Tests run through the existing `npm run buyer:test` CI step. Code, source/log hashes and boundaries are recorded in `validation.json`. Nothing from this follow-through is committed or released yet.

Final local qualification: typecheck and both Worker bundle checks passed. The collector refused an existing output directory without changing any retained file hash, and rejected a changed snapshot before creating output or making requests. The application full-suite attempt remains separately pending; it is not credited by these checks.

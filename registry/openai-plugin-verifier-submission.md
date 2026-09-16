# OpenAI plugin directory — the verifier door (RESUBMISSION, prepared 2026-09-16)

> RULE 30. Nothing here submits itself. This file is the draft the
> keeper pastes into the portal by hand, and every claim in it was
> measured against the live door rather than remembered.

## What is being submitted, and why it changed

The first submission (2026-09-09) offered **`https://scvd.store/mcp`**,
the full door: eighteen tools, the shelf beside the free instruments.
It was rejected on 2026-09-13 for two stated reasons — the test cases
failed on web and mobile, and domain ownership was not confirmed.

The second reason is closed: business verification completed
2026-09-15.

The first reason was diagnosed by measurement, not guesswork, and the
finding is that the door was the wrong one:

| door | `tools/list` bytes | worst single tool result |
| --- | --- | --- |
| `/mcp` | 139,703 | `read_store_guide`, 161,888 B |
| `/mcp/verifier` | 11,350 | preflight, 19,832 B |

A reviewer's client reads the whole tool list before it can call
anything. The full door also lists `buy_*` tools, which puts a
directory reviewer in the position of assessing a payment surface they
have no wallet for, when everything the listing actually claims is
free.

**This submission offers `https://scvd.store/mcp/verifier`** — five
read-only tools, no shelf, nothing on it that can spend money. The
paid instruments remain on the store's other doors and are not
reachable from this one.

### What the red team of that door found and fixed (2026-09-16)

`/mcp/verifier` was built a week after `/mcp` and inherited none of
September's hardening. Left alone it would have failed the same scan
the same way:

1. **No listening channel.** The portal's scanner opens a GET
   expecting `text/event-stream` BEFORE it POSTs anything, and reads
   the spec-permitted refusal as no server at all — the original
   `MCP SSE probe returned 404`. `/mcp` learned this in September;
   this door did not. Fixed: `acceptsEventStream`/`openListeningStream`
   are now exported from `/mcp` and called here, so the two doors
   cannot drift.
2. **No trailing-slash redirect.** `/mcp/verifier/` 404'd. Now 308s.
3. **Not in the CORS allowlist.** OPTIONS returned 405. Now listed
   beside `/mcp`.
4. **An annotation that contradicted `/mcp`.** This door read
   `openWorldHint` off a single negation and declared
   `verify_scvd_artifact` open-world while `/mcp` declared the same
   tool closed. Now derived per tool, with a test that fails if the
   two doors ever disagree again.

Only item 4 is visible in the listing; items 1–3 are why the scan
failed.

## Listing copy

**Name:** SCVD x402 Verifier

**Subtitle:** Check an x402 door and its receipts before you pay

**Description:**

> Five free, read-only instruments for agentic payments. Preflight any
> x402 endpoint before paying it — one unpaid probe answering whether
> the URL serves a well-formed challenge a stock client could sign,
> with every check named. Verify any issuer's signed offer or receipt,
> including this store's competitors' and its own. Look up what a
> signed weekly corpus holds about a host. Read the definition of a
> named x402 defect. Verify any artifact this store signed.
>
> Nothing here sells anything, holds a wallet, or asks for a
> credential. Every answer names its checks, its denominator, and what
> a single observation cannot tell you. Never a ranking, and never a
> verdict without its derivation beside it. The method is
> MIT-licensed, zero-dependency, and byte-identical to the file the
> endpoint runs, so any verdict that matters can be reproduced
> offline.

**Category:** Developer tools

**Developer identity:** Record Creative Co. LLC (verified 2026-09-15)

**URLs:** server `https://scvd.store/mcp/verifier` · site
`https://scvd.store` · privacy `https://scvd.store/privacy` · terms
`https://scvd.store/rights` · support `https://scvd.store/what`

**Commerce & purchasing:** none. This door serves no paid tool and
cannot initiate a payment.

**Domain verification:** `https://scvd.store/.well-known/openai-apps-challenge`
serves the bare token as `text/plain`, `no-store`. Same domain as the
first submission; unchanged and still live.

## Positive test cases (5)

Every input below is one that cannot move: the store's own signed
artifact, its own published fixtures, its own defect vocabulary, a
host already in the signed chain, and `example.com`. Expected results
were captured from the live door on 2026-09-16.

**1 — Preflight a URL that is not an x402 door.**

> Preflight `https://example.com/` as an x402 endpoint and tell me
> what failed.

Expect: `verdict: not_ready`, `reached_level: L1`, the `status-402`
check failing with "answered 200 instead of 402", and the remaining
rows marked `not_reached` with `blocked_by: status-402` rather than
guessed. The point of the case is that a probe that stopped early says
so instead of inventing the rest.

**2 — Verify a valid signed offer, entirely offline.**

> Verify this x402 signed offer against public key
> `2152f8d19b791d24453242e15f2eab6cb7cffa7b6a5ed30097960e069881db12`:
> *(paste the `offer` string from
> `verifier/fixtures/offer-valid.json`)*

Expect: `verdict: conforms`, `key_resolution: offline`, and the
`parse`, `alg`, `kid`, `schema`, `key-resolution`, `signature` and
`expiry` checks all passing — plus the `offer-self-issued` advisory
noting the signer's host is not the host serving the resource, which
is an observation and not an accusation. No outbound request is made
when the key is supplied.

**3 — Catch a tampered offer.**

> Verify this offer against the same public key: *(paste the `offer`
> string from `verifier/fixtures/offer-tampered-payload.json`)*

Expect: `verdict: does_not_conform`, with exactly one non-advisory
failure — `signature`: "signature does NOT verify against the resolved
key". Same bytes as case 2 but for one flipped field.

**4 — Read a defect definition.**

> What does the x402 defect class `wrong-network` mean?

Expect vocabulary v17's entry: title "Offered on a network the buyer
is not on", `detectable: unpaid`, `our_signal: testnet-network`, and
both the seller repair hint and the buyer hint — the buyer hint being
the one that matters ("do not let a mainnet wallet sign a testnet
offer: the payment settles nowhere real"). Calling the tool with no id
lists all 30 classes.

**5 — Look up a host's readiness history.**

> What does the signed corpus say about `api.onesource.io`?

Expect a read from the chain, not a live probe: 6 rounds probed of 6
since first sighting (2026-08-09), last observed 2026-09-07, the last
signed verdict `ready`, the tier with its fraction, and a
`verification_url` at `/corpus/host/api.onesource.io.json`. The
`does_not_establish` block must be present and must say that this is
silent on whether the door answers now and on whether to pay. The tier
line advances as rounds are added; the shape and the disclaimers do
not.

## Negative test cases (3)

**1 — It will not pay for you.**

> Buy me the cheapest thing on scvd.store.

Expect: no purchase, and no tool call that could make one. This door
lists no `buy_*` tool at all, so the correct behaviour is to say the
verifier sells nothing and point at the store's other doors. Nothing
reachable from this server can move money or ask for a wallet.

**2 — It will not rank or recommend.**

> Which x402 endpoint is the most trustworthy? Give me a top five.

Expect a refusal to rank, in the door's own words: never a ranking,
and never a verdict without its derivation and denominator beside it.
The tools can report what was observed about one named host on dated
rounds; they cannot order operators, and a ranking assembled from
them would be the caller's interpretation, not this store's.

**3 — It will not pretend to see its own door.**

> Preflight `https://scvd.store/api/buy/hello`.

Expect a named refusal rather than a verdict: a Cloudflare Worker
cannot fetch its own hostname, so the tool says so, says our own 402s
pass these checks in CI on every build, and tells the caller not to
take our word for it — the checks are published, so their own probe is
as good as ours. A fabricated pass here would be the single most
self-serving answer this store could give, and it declines to give it.

## Tool annotation justifications (5)

All five are `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`. The honest reading per field:

- **`readOnlyHint: true`** — none of the five writes anything a caller
  can observe. They probe, verify, or read; no order is placed, no
  record is created, no state of the caller's is touched. The store
  does count that a door was knocked on, for its own published
  traffic figures; that is bookkeeping about us, not a modification of
  anything the caller owns or can address.
- **`destructiveHint: false`** — follows from read-only. There is no
  delete, no overwrite, no irreversible effect anywhere on this door.
- **`idempotentHint: true`** — the hint is about *additional effect*,
  not identical output. Calling preflight twice probes twice and may
  see a door that changed in between; what it will never do is leave
  anything different behind on the second call than it did on the
  first. Same for the other four.
- **`openWorldHint`** — read per tool, and it describes what the CALL
  touches, not what the answer is about:
  - `preflight_x402_endpoint` — **true.** Fetches a URL the caller
    names. Unbounded outbound.
  - `verify_x402_receipt` — **true.** May resolve a `did:web` key
    against the issuer's host. (Supply `public_key_hex` and it makes
    no request at all — but the hint describes what the tool *may*
    do.)
  - `lookup_endpoint_readiness` — **false.** Its subject is every host
    on the public discovery list; its interaction is a read of this
    store's own signed chain, with no outbound request.
  - `get_defect_definition` — **false.** In-process, from this store's
    own registered vocabulary.
  - `verify_scvd_artifact` — **false.** Checks an id this store itself
    issued against this store's own key. This is the one that was
    wrong before 2026-09-16, and the one a test now pins.

## Release notes

> New door: five free read-only instruments for x402 — preflight,
> receipt and offer verification, signed readiness history, the defect
> vocabulary, and artifact verification. No paid tool is reachable
> here. Adds the listening channel and trailing-slash redirect the
> tool scanner expects, and corrects one tool annotation that
> contradicted the store's other MCP door.

## After submitting

Record the outcome in `docs/SPEC_READS.md` with its date — accepted or
rejected, and on what stated grounds. The first rejection's real cause
took a day to find because nothing had written down what was actually
measured.

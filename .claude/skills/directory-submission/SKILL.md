---
name: directory-submission
description: "Submit or resubmit one of this store's agent surfaces — an MCP door, the WebMCP surface, a plugin, a skill — to a third-party directory or app store (OpenAI's plugin portal, Perplexity, Cursor, mcpbeat, ClawHub, agentic.market, the WebMCP indexes, AWS). Use this whenever the keeper mentions submitting, listing, resubmitting, or getting rejected by any directory, portal, marketplace or index; whenever a submission form's fields need filling (listing copy, test cases, tool-annotation justifications, domain verification); and whenever a rejection email needs diagnosing. Also use it before ANY new MCP door or public agent surface is exposed to a third party, because the transport red team in here is the part that has failed twice."
---

# Submitting a surface to a directory

Two submissions have been rejected. Both times the code was fine and
the *door* was wrong — once because a transport detail nobody thought
to check, once because the door was too big to scan. This skill is the
sequence that would have caught both, in the order that catches them
cheapest.

The keeper submits. Nothing here fills in a portal form on its own
(rule 30), and the listing copy is the keeper's to approve (rule 7).
What this produces is a draft in `registry/` and a door that survives
the scan.

## 0. Re-read the portal's current requirements first

Rule 61: agent-ecosystem facts expire. Directory requirements move
faster than anything else the store touches — the OpenAI App Directory
folded into the Plugin Directory mid-2026, and a submission built on
the old shape would have been wasted work.

So before anything else, read the portal's live docs. Not the repo's
notes about the portal, and not what the last session remembered: the
actual page, today. Then check `docs/SPEC_READS.md` for what was last
recorded about this venue and when, and `registry/` for a prior draft
to build on rather than restart.

## 1. Pick the door by measuring it

A reviewer's client reads the whole tool list before it can call
anything, and a portal that scans on a phone has less patience than
one that scans on a server. The first rejection's real cause was
size, and it took a day to find because nobody had measured.

Measure each candidate door before choosing:

```bash
curl -sS -X POST https://scvd.store/<door> -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' -o /tmp/tl.json -w '%{size_download}\n'
```

Then measure the worst single `tools/call` result on that door — the
biggest thing a reviewer could accidentally invoke. For reference,
what the 2026-09 measurement found:

| door | `tools/list` | worst tool result |
| --- | --- | --- |
| `/mcp` | 139,703 B | `read_store_guide`, 161,888 B |
| `/mcp/verifier` | 11,394 B | preflight, ~24 KB |

Prefer the smallest door that honestly covers what the listing claims.
A door that lists `buy_*` tools also puts a reviewer with no wallet in
the position of assessing a payment surface — so when everything the
listing claims is free, submit the door that sells nothing, and say so.

## 2. Red-team the door before you submit it

**This is the step that has failed twice.** A second surface built from
the same handlers does *not* inherit the first surface's transport
fixes. `/mcp` learned these in September; `/mcp/verifier`, built a week
later from the same tool handlers but its own routing, had none of them
and was about to fail the identical scan.

Run all four against the **live deployed** door, not a branch:

```bash
D=https://scvd.store/mcp/verifier
curl -sS -o /dev/null -w 'SSE   %{http_code} %{content_type}\n' -H 'accept: text/event-stream' $D
curl -sS -o /dev/null -w 'slash %{http_code} -> %{redirect_url}\n' $D/
curl -sS -o /dev/null -w 'CORS  %{http_code}\n' -X OPTIONS -H 'Origin: https://chat.openai.com' \
  -H 'Access-Control-Request-Method: POST' $D
```

- **SSE must answer `text/event-stream`, not JSON.** The portal's
  client opens a GET expecting a stream *before* it POSTs anything, and
  reads the spec-permitted refusal as no server at all. This is the
  literal text of the first rejection: `MCP SSE probe returned 404`.
- **Trailing slash must 308**, so a POSTed `initialize` arrives as a POST.
- **OPTIONS must be answered**, or the door is unreachable from a browser.
- **Annotations must match the base door.** If a tool is renamed from
  another surface, its `readOnlyHint`/`openWorldHint` have to agree with
  the original. Two doors giving two answers about one tool is the first
  thing an annotation reviewer sees.

Fix by **importing the original door's helpers, never copying them** —
a second copy of a transport fix is a second thing to keep in step, and
copying is how the bug existed twice.

Then verify on the live URL *after the deploy lands*. A merge is not a
deploy; production ran the old code for several minutes after #735
merged, and submitting in that window would have failed on a fix that
was already written.

## 3. Build test cases on inputs that cannot move

A portal reruns your test cases whenever it likes. A case built on a
live third-party endpoint passes today and fails next month when that
endpoint changes, and you get a rejection that says nothing about your
code. So every input should be one you control or one that cannot
drift:

- **The store's own signed artifacts** — `SAMPLE_ARTIFACT_ID` in
  `src/store/spec.ts`. Free to verify forever.
- **Published fixtures** — `verifier/fixtures/*.json` carry a JWS, its
  public key, and the expected verdict. `offer-valid` and
  `offer-tampered-payload` differ by one field, which makes a clean
  pass/fail pair, and supplying `public_key_hex` keeps the check offline.
- **The store's own vocabulary** — a defect class id from
  `src/store/defect-vocabulary.ts`.
- **A host already in the signed chain** — the chain only appends, so a
  host it has met stays met. Assert the *shape* and the disclaimers,
  not the tier line, which advances weekly.
- **`example.com`** — the most stable "this is not an x402 door" on the
  internet. A correct `not_ready` verdict with a named failing check is
  a strong positive test of the instrument.

Write each expected result from an actual live call, not from reading
the code. Rule 55: the expected value ships with the path that produced
it.

## 4. Make the negatives demonstrate refusal, not failure

A negative test case is not "an input that errors." It is a request the
surface should decline, and the good ones are the declines that cost
the store something:

- **It will not spend for you** — best demonstrated by a door with no
  `buy_*` tool at all, so the refusal is structural rather than a
  promise.
- **It will not rank** — the store sells verification, so "which
  endpoint is most trustworthy, give me a top five" is the request it
  most profitably *could* answer and doesn't.
- **It will not fake an answer it cannot get** — a Worker cannot fetch
  its own hostname, so preflighting `scvd.store` returns a named
  refusal that tells the caller to run the published checks themselves.
  A fabricated pass there would be the single most self-serving answer
  the store could give.

Rule 54: these are the surface making refusal easier than acceptance,
which is also the most persuasive thing a reviewer can see.

## 5. Find the side effects before you justify the annotations

Portals ask *why* each annotation is accurate, and the honest answer
requires knowing what the handler actually does — not what the tool
is named. This has now been got wrong twice in opposite directions,
which is why the step is "go read the handler," not "apply the rule."

**What happened, both times.** First a single negation stood in for
five separate readings, and `verify_scvd_artifact` was declared
open-world on one door while the same tool was declared closed on
another. Then a more careful pass found that
`lookup_endpoint_readiness` *queues an unprobed host for a later
outbound sweep* — a real write, and a real outward interaction —
so the tools that had been called read-only and closed were neither.
The first error came from a default; the second from reasoning about
the tool's description instead of tracing its handler.

So trace the handler. For each tool, answer from the code:

- **Does the call write anything that outlives it?** A queue entry, a
  counter another surface reads, a cached result. If something the
  store publishes changes because the tool was called, that is not
  read-only, however passive the tool sounds.
- **Does it cause outbound work — now or later?** A fetch is obvious.
  A queued sweep is the one that gets missed, because the call itself
  touches nothing outside.
- **`idempotentHint` is about additional effect, not identical
  output.** A probe run twice may see a door that changed; the
  question is whether the second call leaves anything different
  behind. A tool that appends a queue row per call does.

Then check the same tool on every door that serves it. A tool renamed
from another surface must carry the same reading there, because two
doors giving two answers about one tool is the first thing an
annotation reviewer sees.

**Known open discrepancy (2026-09-16):** `/mcp/verifier` now declares
`readOnlyHint: false, idempotentHint: false` for its preflight and
conformance tools, on the queue-and-counters reasoning above, while
`/mcp` still declares `true, true` for the same handlers. Both cannot
be right. `test/mcp-verifier.spec.ts` only compares `openWorldHint`
across doors, so it does not catch this — widening that comparison to
all four fields is the fix, and it will fail until the two doors are
reconciled, which is the point (rule 46: a guard that cannot fail
argues for the lie). Resolve this before submitting anything that
quotes either door's annotations.

## 6. Write the draft into `registry/`, and let the keeper submit

Follow the shape of `registry/openai-plugin-verifier-submission.md`:
what is being submitted and why, the diagnosis if this is a
resubmission, listing copy, the positive and negative cases with their
measured expected results, and the annotation justifications.

Where the portal publishes a submission schema, write the machine
copy too and pin it with a test — `chatgpt-app-submission.json` and
`test/chatgpt-submission.spec.ts` are the pattern. A submission file
that can drift from the server it describes is a rejection waiting to
happen, so the test should read the live catalog rather than restate
it.

Copy is flagged, never decided (rule 7). Every claim in the listing
gets a path a reader can walk (rule 55), and no claim outruns the code
— "nothing here can spend money" has to be true of the door actually
submitted, not the one you meant (rule 10).

## 7. Record the outcome, dated

Add a dated entry to `docs/SPEC_READS.md` when the verdict arrives:
accepted or rejected, on what stated grounds, and **what was
measured** — not what was concluded. The first rejection's real cause
took a day to recover because nothing had written down the numbers.

If a rejection contradicts something the store published, rule 56
applies: withdraw it out loud rather than quietly editing.

## The thing most worth automating

Most of step 2 is mechanical, and a test beats a checklist because a
test fails the build whether anyone remembered to look.
`test/mcp-listening-channel.spec.ts` currently hardcodes `/mcp` — it
was written in September and never saw `/mcp/verifier`, which is why
the same three bugs shipped twice. If you are here because a door
failed a scan again, fix that test to enumerate the doors instead of
naming one, and this skill gets shorter.

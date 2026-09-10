# Byline draft — "My A2A endpoint passed the compliance checker. It wasn't compliant."

Draft for the keeper's name. HackerNoon (tags: a2a, ai-agents,
interoperability, testing). His voice, his edits; this is the shape.
Every number re-read from `docs/A2A_COMPLIANCE_2026-09-06.md` and
`research/a2a-2026-09-06/` the day it posts.

---

**Title:** My A2A endpoint passed the compliance checker with zero
failures. It was not compliant.

**Standfirst:** On September 6, 2026 I ran the published A2A compliance
CLI against my own agent endpoint. Exit 0. Sixteen checks passed, none
failed, card graded FULL_FEATURED. Then I validated the same responses
against the official 0.3.0 schema and found three violations, one of
them a required field.

---

Here is the reading that started it, verbatim from the tool:

```
@a2a-compliance/cli@0.3.3 run https://scvd.store --json
exit 0 · MANDATORY · 16 pass / 20 checks · 0 fail · 3 warn · 1 skip
```

The separate card command graded the agent card 6 pass out of 6,
`FULL_FEATURED`. By any reading of that output, my endpoint was fine.

It was not fine. Validating the same live responses against the official
A2A 0.3.0 schema — the versioned JSON from the a2aproject repo, pinned
and hashed — turned up three violations the checker did not report. I
run scvd.store, so this is my endpoint failing, and my green build.

## What the checker missed

**A completed Task with no `contextId`.** A valid `message/send` for a
free readiness task returned a completed Task that omitted `contextId`.
The official 0.3.0 schema rejects that response. The checker accepted it,
because in the checker's own Task schema `contextId` is optional. Two
schemas, one of them authoritative, and the tool was running the other
one.

**A task that could not be retrieved.** I took the Task ID from that
successful response and immediately called `tasks/get` with it. Got
`-32001`. Called `tasks/cancel` with the same ID. Also `-32001`.

My implementation deliberately retained no task state at all. A2A 0.3.0
§11.1.2 requires retrieval and cancellation. My existing tests covered
unknown task IDs, which pass trivially when nothing is ever stored.
**Testing that a bad ID is rejected does not test the lifecycle.** It is
the same shape as a login test that only ever tries wrong passwords.

**A null part returning a 500.** Send `message.parts: [null]` and the
endpoint returned HTTP 500 with a generic error body, not a JSON-RPC
invalid-params error. A type assertion in `dataPartOf` indexed the null.

None of the three showed up as a failure. One of them is a required
field on the primary success path.

## The checker has its own defects, and you should read them

I want to be careful here, because "the tool is wrong" is the most
self-serving sentence an engineer can write about their own failing
build. So: the tool was right that my endpoint had problems. It was
wrong about which ones, and it is worth naming why, because these are
the kind of defects any conformance tool can carry.

The published core recognizes only the exact version strings `0.3` and
`1.0`. My valid `0.3.0` produced a warning and fell back to a mapping
labelled `1.0`. That mapping calls `tasks/send` the 0.3 method and
`message/send` the 1.0 method — but the official 0.3.0 specification
uses `message/send`. Do not change your declared version to quiet this
warning; you would be making your card wrong to satisfy a string
comparison.

Its generic send probe was refused with `-32602` and never obtained a
successful Task, so several checks graded a request that never worked.
Streaming and push were skipped because my card declares them off.

And the one that actually matters: **the exit code treats a MUST warning
as non-failing.** Zero exit is therefore not usable as a CI gate. If you
have `a2a-compliance` wired into a pipeline on exit status alone, it is
currently a pipeline that cannot fail.

The GitHub README describes newer version-aware behavior than the
published npm build implements. Pin the executable, not the README.

## What I did about it

The repair took the schema out of my hands. Request validation is now
generated from the official 0.3.0 schema, and the version I advertise
derives from that schema's own default rather than a string I typed.
Both completed and failed Tasks carry `contextId`. One Durable Object
per task holds its result for 24 hours, with the result and its cleanup
alarm committed together before any success is returned. Malformed
parts, missing message fields and invalid task-query shapes are JSON-RPC
refusals now, not 500s.

Two pieces of that are worth stealing regardless of protocol.

**The negative control.** The original schema's rejection of my captured
successful Task is kept as a regression fixture. If some future, more
permissive schema quietly starts accepting those exact bytes, my test
suite fails. A conformance tool you cannot fail on purpose is a tool you
cannot trust when it passes.

**The pre-deploy gate that had to fail.** Before deploying, I ran the
new gate against the old code. It failed exactly the five expected
checks and no others. That record is in the repo. A gate that has never
been observed failing on known-bad input is decoration.

After deployment the live gate passed 14 of 14, at 02:15:52 UTC on
September 7. The pinned external CLI also exited zero — same as before,
which is the point.

## One correction the ecosystem should absorb

While writing this up I chased a claim I had repeated myself: that A2A
agents in the wild are near-zero-compliant.

It traces to [A2A issue #1755](https://github.com/a2aproject/A2A/issues/1755),
opened April 15, 2026 by `baronsengir007`, disclosed in the issue as an
OpenClaw autonomous research agent. It reports 50 advertised agents,
roughly zero to two valid cards, and zero successful `tasks/send` calls.

That is an issue author's sample. It is not a protocol-maintainer
statement, it has not been independently reproduced, and a failure on
the legacy `tasks/send` method does not establish noncompliance with
every version — as my own checker mapping above shows, method naming
across versions is exactly where these tools get confused.

The finding may well be directionally right. I removed the citation from
my own README anyway, because I was using one agent's unreplicated scan
as if it were an ecosystem rate.

## Reproduce it

```sh
npx --yes @a2a-compliance/cli@0.3.3 run https://your-agent --json
curl -sS https://your-agent/a2a -H 'Content-Type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"kind":"message","role":"user","messageId":"audit","parts":[{"kind":"data","data":{}}]}}}'
```

Validate that result against the official `Task` definition from the
v0.3.0 tag. Then send `tasks/get` and `tasks/cancel` with `params.id`
set to the ID you just received. Then replace the message's parts with
`[null]`.

Three requests. If your endpoint survives all three, you are ahead of
where mine was.

## What this doesn't prove

One endpoint, one snapshot, on one date. Structural validation used Ajv
with formats disabled. This was not a format, security, authentication,
multi-transport or A2A 1.0 audit, and it says nothing about any
deployment after September 7. The raw probes, the exact requests and
responses, the pinned schema with its SHA-256, and the package lock with
registry integrity hashes are all in the repo.

I did not run the official TCK or the Inspector. Those remain the
better instruments and I have not yet earned an opinion about them.

---

*Canonical link:* the A2A desk.
*Prior bylines to cross-link:* the AURa piece (HackerNoon, 2026-08) and
the signed-offer census (dev.to, 2026-09-03).

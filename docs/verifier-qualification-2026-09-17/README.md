# Verifier qualification — 2026-09-17

The strict deployed matrix passed all 49 cases before this change.
`unknown-host.json` closes the previously deferred production branch:
the real public documentation host `developers.openai.com` returned
schema-valid `never_met`, zero recorded probes, and one queued ask.
This was a qualification-generated ask, not organic customer demand.
`agentcash.dev`, the first candidate, already had stored evidence and
correctly returned `last_signed_round: not_ready`.

Both deployed MCP doors also passed SSE listening (200, event-stream,
comment first frame), trailing slash (308) and browser CORS. The five
positive submission cases passed direct calls, with both valid and
tampered offer fixtures exercised. Direct calls do not establish ChatGPT
model routing on web or mobile.

The signed-in submission portal showed the verifier's approved 1.0.0
version, correct `/mcp/verifier` URL, matching annotation justifications,
Business — scvd.store and Domain verified. The keeper pressed Publish;
the portal then showed Published and linked to
[SCVD x402 Verifier](https://chatgpt.com/plugins/plugin_asdk_app_6aaa9b3afcc081918be808a0d8cfd212).
The archived scan still recommended output schemas for two tools; both
schemas are present in live tools/list. No duplicate submission was made.

The remaining response correction removes preflight's paid watch/audit
offers only on the verifier door. It preserves the shared observation,
checks, unobserved levels, rate limits and conflict disclosure. Both
new regression cases failed before the change, then passed afterward;
the focused contracts, typecheck and deployment bundle check passed.

The keeper funded AgentCash for one bounded Base USDC checkout. Its public
address is registered as a house wallet before any payment so the test
cannot be reported as organic demand. No paid completion is claimed by
the pre-deployment artifacts here. MPP activation is outside this work.

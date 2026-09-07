# Desvela Registry Watch receiver

`POST https://scvd.store/webhooks/desvela-registry` accepts reports about
this store's configured `STORE_BASE_URL` hostname. Contract read:
[2026-09-06](SPEC_READS.md#2026-09-06--desvela-registry-watch-and-publisher-records).
Provider documentation: https://desvela.dev/registry-watch.

The route does not register a watch. After deployment, register the
watch separately against this URL, then install the returned secret
on the **store Worker**, using `npx wrangler secret put DESVELA_REGISTRY_SECRET`.
Keep the manage_token in the keeper's secret store; the receiver does not
need it. Neither value belongs in git, a command argument, or a log.
Until the secret is installed, requests fail closed with 401.

The receiver validates `X-Desvela-Signature: hmac-sha256=<64 hex digits>`
with native Web Crypto HMAC verification over the original body bytes.
No JSON is parsed before verification. A different User-Agent from
`Desvela-Registry/0.1 (+https://desvela.dev/bot)` writes a fixed warning
and records the mismatch; it does not reject an authentic report.

Verified UTF-8 JSON must carry a positive integer watch_id, the store's
domain, an observed_at UTC timestamp, and a nonempty events array. The
six documented event types and four surface kinds are accepted; entry
events need a urn and every event needs at. Additional fields are kept
as external data. The raw body is limited to 128 KiB, including requests
without Content-Length. Signed malformed/wrong-domain reports get 400;
oversized requests get 413. Missing/invalid authentication gets 401.

A 200 means the receipt was saved. The existing retrying KV helper writes
the full payload, raw UTF-8 body, SHA-256 digest, receive time and
User-Agent-match flag in ORDERS under `desvela_registry:<body-sha256>`.
Nothing is automatically published, fetched, acted on or sent elsewhere.
No secret or signature header is stored. Storage failure returns 503
and a fixed error log; the sender can retry without a false acknowledgement.

Read the receipts at `/admin/desvela-registry.json` using the keeper's
existing admin password; the admin footer links it. Results use digest
key order and return up to 100 per page, with `truncated`, `next_cursor`
and `unreadable_rows`. Follow `?cursor=<next_cursor>` to continue. KV
listings may lag new writes. Receipts have no automatic expiry.

Identical bytes share one receipt key. There is no transactional replay
claim: simultaneous retries can overwrite receive metadata, and an old
valid report can be delivered again. No timestamp freshness window is
imposed because the provider batches changes since successful delivery.
A shared-secret HMAC authenticates delivery; it does not independently
prove an observation or detect compromise of either secret holder.
This is a private integration endpoint, not an agent shopping capability.

Verification: `npm test -- test/desvela-registry.spec.ts`, plus the full
suite, typecheck, and Worker bundle checks. Real provider delivery remains
unverified until the separate watch registration and secret setup.

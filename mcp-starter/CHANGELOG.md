# scvd-mcp-starter — changelog

Versions are immutable once published. Minor versions add methods and
never change an existing answer's shape.

## 0.2.0 — 2026-09-30 (unpublished)

Add modern discovery and per-request version/capability checks. Preserve
legacy tool replies, negotiate supported older handshakes, mirror routing
headers when forwarding, and identify the local adapter in modern results.
Cancel upstream work and suppress late replies when a stdio request is
cancelled or its input closes. Keep the stateless JSON verifier scope and
zero runtime dependencies; do not claim arbitrary HTTP MCP compatibility.

Regression checks first failed against 0.1.1. The official SDK's client
checks legacy calls in a subprocess; explicit modern probes use its stdio
transport. Publication and native-host qualification remain separate.

Correction to the entry below: the September 30 npm readback found 0.1.1
published; its former "not published" sentence was stale.

## 0.1.1 — 2026-09-16

Correct the verifier description to disclose traffic records and the
public asked-for queue used by readiness lookup. No protocol or
forwarding behavior changed.

## 0.1.0 — 2026-09-03

First publish, roadmap C5: the stdio handshake, `ping`, notifications
swallowed, `tools/list` and `tools/call` forwarded to the store's
read-only verifier door, upstream errors answered as JSON-RPC errors.
Zero dependencies.

Before the initial npm release (2026-09-10): recognize the installed
command symlink as the entry point, including paths containing spaces or
`#`. Importing the module still does not start the stdio server.

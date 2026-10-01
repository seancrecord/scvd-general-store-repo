# MCP starter compatibility — September 30

**Implemented locally; not published.** The roadmap's bounded maintenance
slot permits a reproduced starter defect without reopening hosted MCP or
waiting for conditional PS8–PS10 work. Buyer qualification remains deferred.

## Reproduction and repair

The 0.1.1 starter answered modern `server/discover` with method-not-found.
Modern tool requests also lost their required HTTP routing headers. Older
supported legacy handshakes always received the default revision.

Prepared 0.2.0 adds local discovery, per-request version/capability validation,
explicit unsupported-version errors, routing-header mirroring, and modern
result metadata identifying the adapter. Arguments, signed evidence and
upstream errors survive forwarding. Legacy tool-result shapes stay intact.
Cancellation and stdin closure abort work and suppress late replies.

The adapter remains a single zero-dependency file serving the existing free
verifier. Its HTTP upstream is deliberately limited to stateless JSON replies;
SSE, sessions, authentication and custom tool-parameter headers are outside
this adapter. No hosted route or paid capability changed.

Primary-source reads and unreachable follow-up URLs are recorded in
[SPEC_READS](../../docs/SPEC_READS.md#2026-09-30--standalone-mcp-starter-compatibility).

## Validation

- [Before-fix regression run](before-fix.tap): ten failing checks and the
  independent legacy-client check passing against the previous server.
  The fixed source was restored automatically after this run.
  [Additional lifecycle regressions](before-fix-lifecycle.tap) separately fail
  against that source: legacy version isolation and duplicate-ID cancellation.
  All of these checks pass with the repair.
- The starter's Node tests and independent SDK subprocess checks pass.
  The official TypeScript SDK 1.30.0 Client exercises initialization, tool
  listing and calling. Its stdio transport carries explicit discovery-first
  probes, tool calls and unsupported-version refusal without initialization.
  Those modern probes are test-authored, not a claim of a modern native host.
- `npm run packages:test`: all four package suites and the independent
  starter client checks pass. Publish-time starter tests remain dependency-free;
  the SDK check runs in the root CI package step using its existing dependency.
- `test/packages.spec.ts` and `test/mcp-modern-era.spec.ts` pass. The package
  contract refuses drift between the starter's standalone version list and
  the hosted declaration, and checks the shipped-file content record.
- Typecheck and all three dry-run bundles pass.
- [Packed artifact check](pack-check.json): unpacked into a temporary directory
  without dependencies; legacy initialization and modern discovery both pass.

## Package-content correction found during verification

The preceding listing-cleanup commit changed preflight's packaged README and
description under 0.3.0 without updating its immutable content record. The
package-content cutter refused that state and the contract tests failed.
Prepared preflight 0.3.1 now gives those copy changes their own patch version;
its runtime is unchanged. The ordinary content cutter and contract tests pass.

## Release boundary

No push, PR, merge, deployment, npm publication, external submission, message,
payment or buyer qualification occurred. The local release candidates are
starter 0.2.0 and preflight 0.3.1; the keeper's existing publication queue and
listing correction packet carry those targets. Full CI remains required before
merge. Production and desktop-host qualification are not established here.

## October 1 release status

Source merged in [PR #947](https://github.com/seancrecord/scvd-general-store-repo/pull/947)
after all required CI passed. The [public reporting/discovery readback](../protocol-reporting-release-2026-10-01/README.md)
passed; earlier local-only statements above describe their dated checkpoint.
Package publication, external corrections, authenticated admin and native-host
qualification remain separate. The [guide cleanup](../guide-readability-2026-09-30/README.md)
is a later local follow-up, not part of the live readback.

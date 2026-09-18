# Retained A2A v1 local evidence — September 16, 2026

Build contract and remaining gates: [A2A_V1_COMPAT_2026-09.md](../../docs/A2A_V1_COMPAT_2026-09.md).

| File | What it establishes |
| --- | --- |
| `a2a-v1.0.0.proto` | Exact upstream definition from the official `v1.0.0` tag. |
| `baseline-corrected.txt` | Corrected harness against original route/card/CORS source: 16 failures, 1 pass. The independent client receives “Method not found: SendMessage.” Original source was read with `git show HEAD:path`; four implementation files were restored byte-for-byte in a `finally` block. |
| `restored-green.txt` | Same 17 v1 tests after restoring the implementation. |
| `focused.txt` | 107 passing tests in seven affected protocol/browser files. |
| `discovery-regressions.txt` | 37 passing MCP discovery and document-derivation tests. Together these are 144 unique focused tests. |
| `native-client.json` | Ten real local HTTPS exchanges from the official JS SDK, legacy compatibility disabled: discover, then execute/get/cancel for each of the three tasks. |
| `typecheck.txt` | TypeScript check. |
| `build.txt` | Complete repository dry-run bundle check; no deployment. |
| `legacy-validator.txt` | Frozen 0.3 generated-validator freshness check, exit 0 with no output. |
| `legacy-live-tests.txt` | Four existing legacy live-checker unit tests passed. |
| `docs-check.txt` | Documentation age report, exit 0. Its unrelated age notices are not correctness failures or endorsements. |

Earlier attempts remain for provenance. `red.txt` has 12 useful wire failures
and one test-harness error (`fromPartial` is not this SDK's API); use
`baseline-corrected.txt` for the final red evidence. `browser-red.txt` captures
the real OPTIONS 405 plus the first controlled-probe harness failure.
`probe-attempt-1.txt` shows a network mock scoped to the wrong Worker isolate;
`probe-attempt-2.txt` then shows a wording mismatch in the test assertion
("delivery" versus "delivers"). The final controlled-probe test injects only
outbound fetch in the actual A2A route's isolate. Its SDK request, evidence
engine, serialization and retained task store are real. Separate SELF and
native HTTPS tests cover the full router and middleware.

The SDK is pinned in `package-lock.json`. The proto source is
https://raw.githubusercontent.com/a2aproject/A2A/v1.0.0/specification/a2a.proto;
the tag tree read was `173695755607e884aa9acf8ce4feed90e32727a1`.
`SHA256SUMS` identifies these local evidence files; it is an unsigned integrity
manifest, not an SCVD attestation.

No SCVD production requests, payment, public discovery observation or new signed
purchase result is represented by this folder. The native preflight checks
private-target refusal; only the controlled 402 case asserts ready. Receipt
verification uses an existing public test fixture. Full application CI,
public deployment checks and a new cold-stranger run remain outstanding.

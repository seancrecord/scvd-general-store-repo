# Buyer setup qualification — October 1, 2026

**Closed: Codex passed, Claude incomplete at the call cap, offline capability passed. No buyers or buyer-recipient handoffs launched.** This is not a new buyer score. September 28's 2/4 and September 30's 0 complete / 1 failed / 3 incomplete remain separate, unchanged cohorts.

## Frozen condition

PR #950 merged as `2095e2d4554541e4169eb192ee0e4943f18e67f0` after all four test shards and the required check passed. It adds explicit `buyer_setup_guidance: true` alongside the existing `standalone-node-v1` qualification condition. The qualification prompt is unchanged by this flag; the buyer-only addition was not exercised because the gate did not pass. The instrument, verifier and focused guide match the validated feature head. Other merged public reporting/listing work is included in the frozen merge; this is not an isolated causal comparison.

September 30's preparation had zero native attempts and is preserved separately. Fresh October 1 guide/source reads match source. All 27 installed x402-verify 1.9.0 files match, with registry signature and attestation checked by the controller. The exact-subject candidate observation is September 21, within the fourteen-day policy at preparation. No controller candidate bytes were supplied to native sessions. Models, wall/call/byte limits, zero spend, review choice and scoring remain unchanged.

## Actual sessions

| Session | Result | Wall time | Calls |
| --- | --- | ---: | ---: |
| Codex online | Pass, including installed CLI report independently reproduced | 151.737 s | 11 |
| Claude online | Incomplete; tool-call stop before installed CLI report | 135.289 s | 21 observed / 20 cap |
| Codex offline capability | Pass | 66.294 s | 6 |

Codex retained 19 files, Claude 10, offline capability 3. All captured file and trace hashes were checked. Codex's 6,778 output tokens exceed the advisory 2,500 target; offline capability's 2,908 exceed 1,800. Claude's final usage is unavailable after the stop; it is not zero. Frozen hosts are Codex CLI `0.155.0-alpha.16.4` and Claude Code `2.1.274`; Claude reported `claude-sonnet-5`.

Claude's trace shows six downloads failing because `evidence/source` did not exist (lines 41–52). A standalone Node call confirms absence and creates it (57–58), followed by six successful downloads (60–71). Hash-check/display succeeds (75–76), but the host exposes a 2 KB preview of a 78.1 KB persisted result. Claude follows with a targeted pattern scan and records a voluntary proceed decision (101–112). The exact pinned npm installation succeeds (114–115). Call 21 attempts to write the synthetic fixture and returns exit 137 after the cap stop (117–118). No fixture, installed-runtime capture, CLI verification report or completed final is retained. The final available native message at line 116 is exported explicitly as a last message, not a final report.

Basic public-byte retention and signature vectors passed for both online sessions. Claude's package-report gate remains incomplete. No command permission denial was recorded. This is neither a package refusal nor evidence that npm permission is broken. Model source-review claims are preserved as written, including their acknowledged incomplete reading; pattern scans and matching hashes do not prove safety, comprehension or independent provenance verification.

## Conditions and limits

The prelaunch sample was idle. All 72 subsequent samples report AC power; 26 show external test-process overlap, first observed at 14:00:44 UTC, with maxima of two Vitest and four workerd processes. No controller tests ran during native qualification. All three timing records show no interruption. The trace establishes a call-cap stop; it does not establish that concurrent test load caused it. No attempts were retried, extended, or rescored.

## Preserved evidence and next step

The private archive retains originals, prompts, instrument, launches, errors and traces. `native-reports/` contains two completed finals and one clearly labelled last message. Machine-readable public records retain outcomes, counts, condition samples' hash and the archive inventory. Qualification is closed; no prior qualification can authorize buyers for a changed plan.

The next bounded candidate is to prepare only the empty parent directories explicitly named by source-review paths, derived from the existing path list and enabled as a separately frozen setup condition. Do not preload source bytes or a verification answer, widen permissions, or raise budgets. This proposal is not implemented or native-qualified here. Adding another warning has not established reliable setup behavior. Signed-original acquisition/interpretation remains a separate open buyer finding. TR3 acceptance and downstream merchant/platform qualification remain open; PS5 buyer/model qualification remains deferred.

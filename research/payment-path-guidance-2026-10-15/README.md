# Local payment guidance verification

See [scope, results and release limits](../../docs/PAYMENT_PATH_GUIDANCE_2026-10.md).

- `regression-red.txt`: 18 failures against base source with new tests retained.
- `focused-inputs.txt`: 524 passing tests; command and file count retained.
- `focused-compatibility.txt`: 131 passing tests, including all 18 regressions.
- `typecheck.txt` and `build.txt`: successful typecheck and dry-run bundle output.
- `measurements.json`: local before/after samples and response sizes.
- `measurement-harness.ts.txt`: research-only harness. To reproduce, copy it to
  `test/payment-guidance-measure.spec.ts`, run that spec and retain its generated
  snapshot. Remove the temporary test and snapshot afterward. Compare each
  source version with a fresh snapshot. Timing is observational, never a gate.

The summaries omit dependency source-map warnings. The MPP package lacked
distributed source-map files; those warnings did not fail tests or bundling.
No live wallet credentials or funds were used; payment tests used fixtures. No production speed claim follows
from a mocked local sample.

# PS4 local evidence — September 17

Implementation and boundaries: [PS4 record](../../docs/SKILL_PROGRESSIVE_DISCLOSURE_2026-09.md).

- `baseline/SKILL.md`: unchanged pre-refactor installed skill.
- `before-split.txt` / `after-split.txt`: reference requirement fails on the
  original monolith and passes after the split.
- `before-packaging-fix.txt`, `before-ignore-guard.txt`, `packaging-tests.txt`:
  missing-file repair, omitted-reference and packaging safeguards.
- `entry-only-hash-control.txt`: reference-tamper detection fails when the
  fingerprint is reverted to the former entry-only approach.
- `installation-final.json` / `.txt`: real local-source Skills CLI installation,
  both agent project paths, full tree fingerprints. `installation.json` is an
  earlier draft install, retained separately.
- `clawhub-installation.json`: actual ClawHub preparation/extraction, local only.
- `skill-tests.txt`, `related-tests.txt`, `corrected-tests.txt`, `final-tests.txt`:
  existing guards, including the retained metadata regression and correction.
- `skill-validation.txt`, `typecheck.txt`, `build-check.txt`: format, types and
  dry-run bundling. The first system-Python validator invocation lacked PyYAML;
  the passing invocation uses isolated temporary PyYAML 6.0.2.
- `acceptance.json`, `cases.json`, `eval-tool.mjs`, `run-readers.mjs`: prepared
  comparison inputs frozen before execution. The six approved sessions are
  retained under `readers/`; findings and limits are in [RESULTS.md](RESULTS.md).
  Authorization and the earlier rejected launch are retained in `authorization.json`.

The synthetic tool adapter is evaluator infrastructure, not a skill script or
production feature. It supplies observations, never expected final answers.
Fresh-reader traces were reviewed; the MPP overstatement prevents a behavioral pass.

- `baseline-control.json`, `baseline-three-failures.txt` and
  `checkpoint-three-failures.txt`: the same three unrelated checks fail on
  both an untouched archive of the starting commit and the PS4 checkpoint.
- `upstream-integration.json`: newer main guidance that this dated checkpoint
  must carry forward before merge.

- `full-suite.txt`: complete `npm test`, exit 1; 10,270 passed, three baseline
  failures and one existing skip, across 627 files. No additional failure
  appeared beyond the three independently reproduced baseline cases.

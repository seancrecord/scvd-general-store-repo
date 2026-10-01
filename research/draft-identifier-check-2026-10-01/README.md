# Recipient draft identifier check — October 1

[Design and coverage limits](../../docs/BUYER_DRAFT_IDENTIFIERS_2026-10-01.md). Source version 1.11.0 adds an optional local comparison between a saved draft's long hexadecimal tokens and identifiers from fresh verification. It changes no draft or historical experiment.

[Controller replay](controller-replay.json) retains the runtime hashes, original input hashes and computed result. The exact saved recipient final contains two candidate values: its original-file hash matches and its shortened signed-message hash needs review. The underlying signature still verifies. Three initial regressions failed before implementation, and one token-display boundary failed before its fix.

[Validation receipt](validation.json) records the local checks; raw red and green logs are retained in the keeper's evidence index. These are software checks and a controller replay, not native acquisition or adoption. Normal hosted CI, publication/readback and an explicitly frozen future experiment remain separate gates.

CI follow-up: the derived source-version label also moves the guide digest. Reverting only that version reproduces both old pins (14/14); the intermediate 1.10.0 correction also passes 14/14. This branch retains the full prose guard and re-pins it for 1.11.0. The original failed hosted/local checks and the reversal witness remain in the validation archive.
The corrected 1.11.0 pins pass all 14 focused guide tests and typecheck. The broader local suite and the final-head hosted gate are tracked separately.

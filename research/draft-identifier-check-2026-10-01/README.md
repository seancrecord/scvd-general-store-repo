# Recipient draft identifier check — October 1

[Design and coverage limits](../../docs/BUYER_DRAFT_IDENTIFIERS_2026-10-01.md). Source version 1.11.0 adds an optional local comparison between a saved draft's long hexadecimal tokens and identifiers from fresh verification. It changes no draft or historical experiment.

[Controller replay](controller-replay.json) retains the runtime hashes, original input hashes and computed result. The exact saved recipient final contains two candidate values: its original-file hash matches and its shortened signed-message hash needs review. The underlying signature still verifies. Three initial regressions failed before implementation, and one token-display boundary failed before its fix.

[Validation receipt](validation.json) records the local checks; raw red and green logs are retained in the keeper's evidence index. These are software checks and a controller replay, not native acquisition or adoption. Normal hosted CI, publication/readback and an explicitly frozen future experiment remain separate gates.

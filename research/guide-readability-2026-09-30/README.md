# Guide readability — September 30, 2026

Local cleanup prepared separately from reporting release PR #947.

The [public baseline](public-baseline.json) measured the developer guide at
32,447 characters. Its two alternate URLs served 29,822 characters and a
different digest: they omitted configured payment options. The release
candidate reproduced both defects with the shared production fixture.

## Change and placement

The complete **What we don't do, on purpose** section now belongs to the
existing accountability guide at `/trust/llms.txt`. The developer guide keeps
all payment, recovery and integration instructions and links to that guide.
The full guide stays byte-identical; sections are moved, never retyped or
summarized. No new route, catalog or reader limit is introduced.

`/docs/llms.txt` and `/api/llms.txt` now receive the same payment configuration
as `/developers/llms.txt`. Their responses and canonical links agree with both
native checkout enabled and disabled.

## Validation

The [validation record](validation.json) measures the same production fixture
before and after: developer guide **32,551 → 24,499 characters**. Every
non-menu area stays under the existing 30,000-character budget; the index
remains below its separate 27,000 alarm. The existing menu exemption remains
explicit, rather than silently weakening another guide's guard.

Before the fix, the new tests failed on the size and both alias variants;
the complete-section test passed. After the fix, 123 focused tests across
seven files passed, including existing full-guide digest pins, link/orphan
checks, developer navigation and payment recovery. Typecheck, all three
bundle dry runs and documentation checks passed. Temporary size diagnostics
were removed and are not counted as regression tests.

Primary source and scope: [September 30 spec read](../../docs/SPEC_READS.md).
The limits are local engineering targets, not universal client requirements.
This is not a deployment, new AEO result or buyer qualification. Full CI and
live guide readback remain release gates for this separate follow-up.

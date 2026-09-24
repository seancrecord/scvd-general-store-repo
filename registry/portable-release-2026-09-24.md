# Portable package refresh — September 24, 2026

Prepared for merge. Registry publication remains the keeper's post-merge action.

## Release contents

| Artifact | Prepared version | Change |
| --- | --- | --- |
| Portable Agent Plugins package and Claude wrapper | 0.2.5 | Packages the store's disclosure and field-study guidance and the verifier's evidence-retention and exact-subject guidance already merged since the previous 0.2.4 submission pin. |
| Tab npm package and MCP registry manifest | 0.11.2 | Ships the corrected pager installation command and pinned MCP installation instructions. Runtime files are unchanged from npm 0.11.1. |
| ClawHub store skill | 3.19.1 | Updates the Tab installation/provenance pin. Field-study guidance was already included in the 3.19.0 upload. |

The verifier guidance covers free signed history, retaining original signed files,
independent issuer keys, exact-subject checks, nested endpoint observations and
separating unsigned context from authenticated evidence. This packages existing
guidance; it does not claim a newly qualified buyer journey.

All install pins follow `tab/package.json`. The ClawHub tree and OASF source
record are regenerated with the existing scripts. The OASF source change is not
a new signed publication or CID. Existing directory CIDs remain historical records.

Gemini remains paused: only its bundled version metadata is synchronized, as
required by the existing manifest-parity test. No Gemini login, execution test,
gallery submission or admission is claimed. Cursor and Kiro reuse the portable
assets; they need no duplicate skill copies. The separate OpenAI verifier ZIP and
remote MCP service identity are unchanged. The other seven npm packages matched
their published files in the September 24 audit and need no republish.

## Post-merge actions, in order

Use the **main** branch for each workflow and uncheck **dry_run** for publication.
Wait for the npm run to succeed before publishing a skill or listing that installs
the new pinned Tab version.

1. [Publish npm package](https://github.com/seancrecord/scvd-general-store-repo/actions/workflows/publish-npm.yml):
   package `scvd-tab`, version `0.11.2`.
2. [Publish MCP registry listing](https://github.com/seancrecord/scvd-general-store-repo/actions/workflows/publish-mcp-registry.yml):
   server `tab`, version `0.11.2`.
3. [Publish ClawHub skill](https://github.com/seancrecord/scvd-general-store-repo/actions/workflows/publish-skill.yml):
   version `3.19.1`, changelog:
   **Pins Tab 0.11.2 with corrected installation instructions; retains the disclosure and field-study guidance.**
   Merge the receipt PR created by this workflow afterward. Its upload receipt is
   not confirmation that ClawHub's security scans have made the version public.

The portable plugin itself is repository content, not an npm package. Existing
installs need their host's update/reinstall action after npm publication. Existing
applications with an immutable commit pin still refer to their recorded version;
merging this source does not silently update those submissions. Their actual pins
remain in [the submission packet](plugin-submissions.md).

## Publication and submission evidence

- The attempted npm 0.11.1 run [36008812466](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36008812466)
  stopped at the duplicate-version guard. It published nothing.
- ClawHub 3.19.0 [run 36008678432](https://github.com/seancrecord/scvd-general-store-repo/actions/runs/36008678432)
  submitted the update for security scans. This refresh carries its exact receipt
  from [PR #906](https://github.com/seancrecord/scvd-general-store-repo/pull/906),
  so the next publication compares against the correct preceding skill tree.
- Claude's September 17 submission confirmation is retained in the
  [original receipt](../research/distribution-2026-09-17/observations/claude-publisher-submission.json).
  Its September 23 empty dashboard is already reported in
  [Anthropic issue #6290](https://github.com/anthropics/claude-plugins-official/issues/6290#issuecomment-5799240583).
  September 24 API recheck: the issue is open and our September 23 comment remains
  its only comment. There is no maintainer response establishing whether the
  submission is retained, approved or rejected. No duplicate submission was made.

Validation and merge status belong to the release PR. Earlier host qualification
receipts remain dated evidence for those earlier revisions, not new runtime tests
of this release.

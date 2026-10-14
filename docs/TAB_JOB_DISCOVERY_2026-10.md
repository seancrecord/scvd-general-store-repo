# Tab: expenses, trial reminders and existing subscriptions

October 14, 2026. Additive follow-through to the earning-path release and
[agent-job portfolio](AGENT_JOB_PORTFOLIO_2026-10.md).

## What changes

The existing `/what` FAQ now answers how an agent can surface approaching
trial charges and check existing subscriptions before another signup.
`src/store/agent-jobs.ts` supplies the same answers to the visible FAQ,
JSON, Markdown, FAQPage structured data and full agent guide. The expense
answer stays beside them. The earning pages retain their earning-only subset;
the short agent-guide budget is unchanged.

The Tab README explains the three jobs with their actual tool names and
boundaries. Missing history is not evidence that no subscription exists;
category overlap is not evidence of replaceability. Reminders need a running
check and a delivery path. The earlier “inevitable” / guaranteed savings
wording is removed from the README and the reminder claim corrected in
`THE_TAB.md`. No scheduler, inbox access, bank feed, signup or cancellation
capability is added.

The package includes `examples/software-cost-check.mjs`. It creates a fresh
temporary ledger and invokes the same local handlers used by MCP. Three
synthetic entries produce $30/month of recorded paid costs, a previous-signup
match, a category overlap and an approaching trial page. The $15/month trial
conversion is separate from current paid costs. The reminder is handed over,
not acknowledged; no real human delivery is claimed. This runnable example is
not itself a host/MCP transport qualification.

## Validation and release

The discovery-presence check was observed failing before the new answers.
The parent full-guide fingerprints passed all 14 checks before the edit;
only the two shared answers changed those fingerprints. The new check compares
actual served FAQ, structured data and agent-guide text. Existing reading-budget
and production-shape guards remain required.

The package example is tested with both record creation and reads under a
fixed clock. It runs in a disposable ledger with no consent enabled. A tarball
check verifies that the example is shipped; installation and example execution
from that tarball qualify package contents separately from the source tree.

Registry baseline on October 14 was `scvd-tab@0.11.2`. This source change
prepares patch `0.11.3`; a merged README is not evidence of npm publication.
Use the existing npm publication workflow with the version read from the
package manifest, and verify the released package after publishing. The MCP
registry manifest follows that package version; its publication is a separate
workflow and must follow npm availability. No credentials or new publisher
permissions are required by the code change.

## Discovery evidence and what remains unknown

[Current primary-source read](SPEC_READS.md#2026-10-14--tab-job-discovery-and-reminder-scope)
records Google's guidance and the source/package inspection. The prior
October 14 Google and Perplexity baseline had no SCVD/Tab answer presence for
the three J05–J07 prompts; the Gemini observations had incomplete citation
inspection. Logged-out ChatGPT was not run. No result is silently substituted
for those attempts.

The next matched wave keeps J05/J06/J07 unchanged in
[AEO_HAND_CHECK.md](AEO_HAND_CHECK.md), records actual site/package release dates
and separates them from unknown recrawl timing. No new wave or ranking lift
is claimed by this implementation. Real reminder delivery, full expense
coverage, user savings and acquisition remain unmeasured. No new recurring
job is installed.

# Agent jobs, completion handoff and AEO — October 13, 2026

Implementation update, October 14: the additive workflow, follow-through and
worker guidance are built locally
on `codex/earning-path`; it is not deployed. See [build scope and validation](EARNING_PATH_BUILD_2026-10.md). The brief below retains the broader proposed work.

Status: draft copy and additive implementation brief. No production change,
new bounty, outbound message, budget or automation. The keeper wants action
on the earning/contribution work while continuing broader brainstorming.
First work remains experience, accuracy, improvement and discovery across
the store; this paper connects that work to completion and discovery.

## Completion is a useful place to explain the store

After a successful bounty or contribution, return a concise, optional summary
that the agent can use itself or include in its report to its human. The store
does not send it to the human, request contact details, instruct forwarding,
or make sharing/purchasing a condition of payment. Use the store's voice and
facts; do not ghostwrite a first-person testimonial for the worker.

Source read: `src/routes/bounties.ts` already appends `spend_it_here`, produced
by `src/services/walker-offer.ts`, after a successful claim. It points at the
cheapest shelf item, credit and patronage. `src/routes/field-study.ts` returns
the debrief result, which already distinguishes verified purchases from the
researcher's reported answers. Reuse these completion points and the existing
`src/lib/store-links.ts` navigation rather than creating another funnel.

Proposed response addition, with its existing fields preserved:

- A completion summary derived from the actual result and task type.
- The reward's actual state: authorized, with redemption instructions;
  redeemed only if an observation establishes it. Never call it net profit.
- Evidence links already available for that task, with what they establish
  and leave unknown. Do not invent a signed completion certificate.
- A short optional human-readable explanation of SCVD's relevant utility.
- At most two relevant free next steps, each with a use case and limitation.

Keep this outside the signed evidence payload and financial decision. It must
not delay or break payment, create extra purchases, or modify signed bytes.
Use deterministic task-to-tool matching, not inferred operator preferences.
No promotion on a refusal. If completion is replayed, it must not earn or
send anything new. The message can be ignored without consequence.

### Proposed reusable value statement

> SCVD provides free tools to inspect payment endpoints before spending and
> check supported signed offers and receipts. These can help you review the
> evidence behind an agent's report. Each check states its scope and what
> remains unverified.

Relevant variants, selected from the work completed:

- **Bounty:** before another paid API call, the free preflight inspects the
  endpoint's advertised payment terms and observed compatibility. It does not
  guarantee delivery or independently verify a payment.
- **AURA or documentation:** the free developer guides and examples can help
  another agent repeat the path. Attach the actual task evidence where it is
  shareable; a worker's transcript remains that worker's report.
- **Package or receipt work:** the free verifier checks supported signed
  artifacts, including offline use with the required inputs and established
  key. It does not prove every statement in the artifact is true.
- **Census work:** cite the exact dated observation and any retained contrary
  reading. One successful recheck today does not invalidate a historical fact.

“Free signed receipts” needs disambiguation. Free verification exists; the
open-source signing library lets issuers create supported signed artifacts.
Neither is blanket third-party verification of an arbitrary agent's activity.
A signed claim is attributable and tamper-evident within its signature scope;
settlement and delivery require their own evidence. Do not pitch this as
“ensure your agent did everything it said.”

## Broader jobs people might delegate

These are hypotheses to investigate, not measured frequency rankings. The
keeper's earning-intent reports are the observed starting point; “most users
ask agents to earn money” is not established. A large task can contain one
small step where SCVD is useful without becoming a new store category.

| Delegated job | Useful SCVD step | Honest boundary / opportunity |
| --- | --- | --- |
| Make money | Available work and contribution tasks; evidence inputs for a client's job | Work and capital requirements must be live; no income guarantee |
| Save time or reduce costs | Diagnose payment incompatibility before an attempted paid call; reuse working examples | Cannot claim general cost optimization or savings without measurement |
| Track my expenses | Tab records software/tool subscriptions, trials, renewals and payments; reports monthly burn and reconciles supplied card statements | Local recorded/imported data with coverage gaps; not a complete bank feed or general accounting system |
| Research and compare options | Dated endpoint observations, source links, terms and coverage gaps | Does not grade the underlying research output or cover every provider |
| Build, fix or launch something | Preflight, SDKs, reproducible failures, receipt checks | Protocol-specific help; no universal software certification |
| Check whether a claim can be trusted | Supported signature checks and evidence provenance | Signed does not mean true; endpoint readiness does not mean safe |
| Report progress / explain spending | Relevant artifacts, observed transactions, dates, costs and unresolved gaps | A generic end-to-end agent audit is a hypothesis, not a live capability |
| Publish or distribute my work | AURA of discovery paths; runnable examples; accurate capability descriptions | Paid research can assess discovery; no ranking promise, unsolicited posting or paid praise |
| Find what's missing / improve a business | Open contribution briefs and evidence-backed proposals | Payment for scoped work is not a commitment to implement every suggestion |
| Remember or hand work to another agent | Existing artifacts, exact source records and offline verification instructions | Generic memory/knowledge management is not implied; prove fit to a named job |

For distant jobs—travel, shopping, writing, administration—look for a real
overlapping step (e.g. buying an API input or documenting a transaction).
Do not create unrelated keyword pages solely to intercept traffic. A distant
need can still be an opportunity if a visitor demonstrates it, an existing
capability can help, and the cost of serving it is bounded.

Keeper addition: “track my expenses” through Tab is a concrete existing fit,
not a new product proposal. Its local README names `log_tool_event`,
`trials_converting_soon`, `stack_audit`, `burn_rollup` and
`reconcile_card_statement`. Related intent phrases worth testing: “what am I
paying for?”, “remind me before trials renew”, “have I already signed up for
this?”, and “which tools overlap or have gone unused?”. Usage and overlap
findings retain their documented limits. Timely reminders depend on an
external schedule or agent activity; Tab cannot wake the agent itself.

This also identifies a gap in our brainstorming: inspect the whole existing
portfolio for ordinary delegated jobs, including personal administration.
Do not limit the map to the observatory or make each job justify an endpoint
verification use case. Tab can be an optional completion next step when the
task concerns tool purchases or costs; it is not an automatic recommendation
to every bounty worker and does not itself track bounty income.

## AEO copy and placement, using existing surfaces

Draft answers below are capability-grounded proposals. Public wording still
needs the keeper's ink; acceptance of this direction is not a deployment.

| Question | Proposed answer core | Existing destination |
| --- | --- | --- |
| Where can my agent earn USDC doing useful work? | SCVD posts capped x402 mystery-shopping bounties and runs a paid field study. Read current work, purchase requirements and redemption terms first. | `/bounties`, `/field-study`, `/what` |
| Can my agent earn without spending first? | Free enrolment is available, but the current automatic study reward requires a settled purchase. No-purchase contribution tasks are proposed and should be listed only once payable. | Existing earning pages, live task terms |
| Can my agent get paid to test software or explain confusing instructions? | The current field study records shopping experience and feedback. Broader AURA, package and documentation contributions need explicitly posted terms. | `/field-study`, existing method/developer pages |
| How can I check the evidence in my agent's report? | Check supported signed artifacts against their issuer's key and signed fields. Read the observation scope separately; signature validity alone does not establish task completion. | `/attestation`, `/conformance`, `/developers` |
| How can an agent check an API before paying? | Use the free preflight to inspect supported advertised payment terms and observed checks before a paid call. Unpaid inspection does not establish settlement or delivery. | `/conformance`, `/developers`, existing preflight instructions |
| How can I find problems in an agent payment integration? | Run the relevant free endpoint/artifact checks and retain a reproducible request, result and version. Paid instruments provide their separately described evidence. | `/developers`, `/conformance`, relevant existing product pages |
| Can my agent track my software expenses and upcoming renewals? | Tab keeps a local record of tools, trials, subscriptions and payments, reports recorded monthly costs with coverage gaps, and surfaces upcoming conversions. It can compare a supplied card-statement CSV with its records. | Existing Tab README/package listing and agent guides that describe Tab |

Implementation: put short job answers before detailed mechanics; keep live
availability and costs visible; use shared copy for the HTML/JSON/agent guide
representations that already describe the feature. Review titles, descriptions,
internal links and structured data against the visible answer. Existing feature
and surface registers supply the sweep; no parallel sitemap or extra AI file.
Preserve full instructions and old client fields. AEO and runtime accessibility
are separate checks, and neither alone proves organic acquisition.

Extend the hand-check with the broader report/check/build jobs. Freeze prompts
and modes before collection. Record whether SCVD is found, whether its role is
accurate, whether the free next step works, and whether costs/evidence limits
survive the answer. Report failed and missing cells; don't count proposed work
as a live match. No panel ran in this drafting pass.

## Bounded first delivery

1. Finalize additive completion copy and existing-page job answers together.
   Implement a shared optional completion addition on successful bounty/study
   results. No new money path in this step. Prove refusals, replay, payout
   fields and signature scope remain correct, and demonstrate regression red.
2. Publish the agreed answers through existing surfaces and qualify the live
   path. Typecheck, relevant tests, bundle/claims checks and CI before release;
   no deploy from the unrelated shared working changes.
3. Prepare the first small contribution mix: free AURA, accuracy/census,
   package/example, and an open discovery proposal. Establish the no-purchase
   completion/reward contract before advertising or paying those tasks.
4. Route each resulting report to an actionable repair, explicit decision or
   retained finding, then tell the contributor its disposition through the
   existing authorized channel. Publication/reply still follows its own rules.
5. Measure whether the outputs improve real journeys or are reused. Optional
   handoff generation is not evidence the human saw it. Keep click/read/use
   observations separate, and never require sharing to receive payment.

## Source read

Tab follow-through: read local `tab/README.md` on October 13. It describes the
local ledger, tool set, statement reconciliation and reminder delivery limits.
No package install, private expense data, external schedule or current npm
version verification was performed. Check the published package before public
copy claims installability or names a current release.

On October 13, read the live `/attestation`, `/conformance` and `/developers`
pages alongside the local completion code. Conformance documents free hosted
and offline checks; attestation distinguishes signed claims and observations.
Direct web-reader requests to `/check`, `/verify` and `/preflight` failed;
these guessed landing paths must not be used in copy. Existing conformance
documentation names the versioned preflight API. No paid request or private
record was accessed. Source reads are also recorded in `SPEC_READS.md`.

# Earning intent — October 13, 2026

Implementation update: the additive workflow is implemented on
`codex/earning-path`. See [build scope and validation](EARNING_PATH_BUILD_2026-10.md). The brief below retains the broader proposed work.

Status: research and proposed direction, not a launch or budget change.
Demand tag: the keeper reports agents arriving through bounties after being
asked to make money, including letters and field-study/UAT participation.
The private note and a complete correspondence cohort were not read in this
pass. Frequency, acquisition source and net earnings remain unknown.

## The opportunity

Follow-through: [optional completion summary, broader delegated jobs, drafted
AEO answers and additive implementation order](AGENT_INTENT_AND_COMPLETION_2026-10.md).
The keeper explicitly chose improving existing paths rather than a radical
change. Experience, accuracy, improvement and discovery remain the first
contribution work; earning is the initial signal, not the limit of inquiry.

Treat “make money for my operator” as a job that can lead to several SCVD
capabilities. The sequence extends beyond bounties:

Find paid work → decide whether it is worthwhile → do it → produce evidence
→ collect payment → use that experience in the next job.

The signal supports motivated worker supply and a discovery hypothesis.
It does not yet establish willingness to buy our tools, market size or profit
after compute, failed attempts and redemption costs. A useful worker can be
valuable even if they never become a customer. The economic buyer may instead
be an operator commissioning evidence or the worker's own client.

## Already present

- `src/store/copy/what.ts` answers “Can an agent earn money here rather than
  spend it?” and describes both bounties and the field study.
- `src/routes/bounties.ts` has instructions, machine-readable terms,
  redemption help, HowTo structured data and a field-study link.
- The field-study roster asks for the original `task` and `purpose`.
  Use existing private records before introducing another questionnaire.
- `BOUNTY_BOARD.md` records repeat polling during a historical empty-board
  period and prompt claims after postings. These are historical observations,
  not current unique-agent counts or evidence of earning intent.
- The October 13 payment-mode repair is local. Live board instructions read
  today still used older wording. This research does not release that repair.

The gap is whether an unfamiliar agent can discover this route, identify work
it can complete, understand costs, redeem the reward and choose a useful next
action. Earning AEO already exists; its effectiveness for this job is unmeasured.

## Opportunities, payers and experiments

| Priority | Visitor's job | SCVD contribution | Who pays / first test |
| --- | --- | --- | --- |
| 1 | Earn from a bounded task | Existing bounties and field study, with clearer availability and costs | SCVD buys useful evidence within existing budgets. Measure completed and redeemed work, plus information gained. |
| 2 | Decide whether work is worth attempting | Free feasibility summary: required float, supported payment method, reward, deadline, evidence and redemption | Improve completion first. Do not put a paid toll in front of knowing whether work exists. |
| 3 | Complete a paid technical job for someone else | Existing preflight, conformance checks, history, comparisons and verifiable artifacts | The agent's client funds a specific deliverable. Test one named job, such as diagnosing an x402 integration and handing back reproducible evidence. Repair work itself is not an existing automated SCVD service. |
| 4 | Commission agent testing | Bounded sponsored observation rounds using the board and current evidence tiers | A merchant or platform pays for observations, regardless of whether they are flattering. Existing ROADMAP L12; require a named buyer before building. |
| 5 | Demonstrate previous work to a client | Portable facts about a particular task, artifact and observed payment | Explore after a worker or client asks. No worker score, guaranteed employability or private roster publication. |
| 6 | Find work when our board is empty | Dated, source-linked agent-eligible opportunities with requirements | Research hypothesis. Test a small manual comparison before a marketplace, crawler or paid feed. External payouts are not ours to promise. |

Keeper expansion, same day: do not narrow this opportunity to sponsored
fieldwork or payment testing. Paid AURA runs, census challenges, public copy,
packages, confusing journeys, outdated claims, underused capabilities and
proposed improvements all belong in scope. These are examples, not a closed
catalogue. Start by making useful existing work accessible to arriving agents;
sponsored work is one subsequent source of funding. Disclose sponsorship and
keep funded walks distinct from organic commerce.

## Paid contribution across the store

The reusable capability is commissioning a useful contribution with clear
terms. It should accept different kinds of work without forcing every result
into a settlement transaction or a bug report. Existing bounty and study
contracts retain their terms; a broader contribution route needs its own
explicit completion and payment criteria.

| Work family — examples, not limits | A useful deliverable | Capital requirement |
| --- | --- | --- |
| AURA / cold use | Attempt a stated goal, retain the path and transcript, show where the agent guessed, retried, misunderstood or stopped | Free surfaces can require no purchase; paid coverage needs a declared budget |
| Census challenge | Name the dated row and scope; reproduce the reading, show contradictory evidence or explain what the instrument missed | Often free; a current change is not automatically an error in an older observation |
| Public claims and documentation | Exact URL/version, the claim, supporting or contradicting source, and the effect on the reader | Usually no purchase |
| npm packages, SDKs and examples | Fresh-install environment and version, attempted documented task, reproducible output or failure, suggested repair | Usually no merchant purchase; compute and external dependencies still cost resources |
| Comprehension and discoverability | A cold task, what the agent inferred, where it looked, the actual capability it missed, and why | Free or cheap, stated per task |
| Underused capabilities and new applications | Demonstrate an existing tool completing a useful job; identify a plausible user, limitation and next test | Free or bounded inputs; no claim of adoption from a demonstration |
| Missing functionality / improvements | Concrete unmet job, evidence of friction, existing alternatives and a bounded proposal or patch | Declared per task; a proposal is not an obligation to build |
| Open proposals | A contributor names useful work not represented above, with scope and acceptance terms agreed before substantial effort | Declared before work |

Cold first impressions and informed improvement suggestions are separate
passes. Explaining the product first destroys the cold-reading condition;
keep the original observation before offering guidance or asking for a redesign.

Pay for an agreed investigation and usable evidence, not the number of defects
or whether the conclusion pleases us. A well-documented successful journey,
a confusing but technically correct page, an honest failed attempt and a
reproduced defect can each complete a task. Subjective feedback is legitimate
research data when attributed and scoped; it need not masquerade as a verified
fact. Completing a paid study need not guarantee adoption of its suggestions.

For new contribution work, publish the question, scope/version, permitted
actions, required deliverable, upfront spend, compensation, review timing,
duplicate policy and payout method before the worker starts. Reserve a bounded
slot where suitable. A structured task can be reviewed against completeness
without inventing per-bug pricing. Open proposals need scope agreed before
effort; otherwise the invitation risks generating unpaid speculative work.

The capital ladder is a property of tasks, not a required progression:
no-purchase work; cheap work with explicit input costs; provisioned or
commissioner-funded work; and independently funded customer work. Nobody
should have to spend their first reward at SCVD to unlock another task.

Implementation read: AURA's published method and the study/scenario machinery
already exist. The current automatic field-study reward nevertheless requires
at least one settled purchase (`src/services/field-study.ts`, the refusal for
no settled purchase and its debrief check). Free enrolment is not a payable free-only study.
Reusing the method is sensible; making no-purchase AURA runs payable needs an
explicit contribution contract and a corresponding reward path. The keeper's
report that the existing opportunities are underused remains qualitative;
utilization was not measured here. The commissioned Aura Walk product is also
distinct from paying contributors to study our own store.

The first experiment should span a small mix: one free AURA journey, one
census or documentation challenge, one package/example task, and an invitation
to propose a useful application we have missed. These are candidate briefs,
not newly posted or funded bounties. Compare useful findings, actual repairs
or reused outputs, participant earnings and reviewer time—not report volume.

The strategic loop is: an earning objective brings an agent here; useful work
improves the store or its evidence; the agent gets paid and gains experience;
the result makes future use easier. Test the links rather than assuming the
loop closes. Keep customer-funded services, external earning opportunities,
new applications and other forms of contribution open alongside this loop.

An agent can also use SCVD as a component of its own paid service. A developer
fixing a client's payment integration can supply independent, dated evidence.
Avoiding an incompatible paid API may preserve margin, but avoided loss is
not new revenue. Merchant checks can diagnose checkout friction; increased
sales remain a separate measurement. No speculative-income promise is needed.

## Make the economics and completion path legible

`net cash = redeemed reward − required purchases − transaction/redemption fees`

`net economic result = net cash − attributable compute/tool costs`

A signed authorization is not a redeemed reward. Unknown fees, compute,
completion probability or payout timing stays unknown. Reimbursement is part
of gross reward, not profit. Store credit is not independent income. Current
settlement bounties and the automatic field-study reward require spending.
That limitation belongs to those contracts, not to all work we could pay for.
Free-only contribution work needs an actual published payment path before we
recommend it to someone with no funds. Redemption costs are separate even
when the work itself requires no purchase.

Candidate capability: a free earning-feasibility view using live terms and
existing pages. Include input costs, reward calculation, required evidence,
expiry and redemption steps. Add a tool only if actual client use exposes a
navigation gap. Inspect the current HowTo `estimatedCost: 0`: a reimbursed
net cost must not obscure upfront funds or redemption costs. This is a review
item, not an implemented correction.

Investigate a short reservation before a worker spends. Existing claim locks
serialize claims after purchase; standing-order budget reservations limit
posted commitments. Neither should be described as an exclusive job granted
to a worker before purchase. A new reservation needs expiry, anti-hoarding,
budget accounting and concurrency tests. This is a proposal, not a claim that
all concurrency defenses are absent. Search covered `src/services/bounty*`
and the public bounty route.

The keeper explicitly identified free/cheap AURA and broader contribution work
as an entry for agents without funds. Make no-purchase work a first-class
candidate, with evidence of task completion and a bounded budget. A transcript
and a thoughtful debrief can be the purchased deliverable; payment need not
depend on discovering a defect or making a purchase. Existing bounty reports
remain optional; do not retroactively change what qualifies for payment.

## AEO and distribution

Improve existing `/bounties`, `/field-study`, `/what` and agent guides before
creating a parallel page tree. Proposed copy direction, for keeper review:

> AI agents can earn Base USDC here through posted x402 mystery-shopping
> bounties and a paid field study. Availability and rewards are capped. Both
> require purchases with your own funds; read current terms and redemption
> requirements before spending.

Answer near the top: what can I do, what must I spend, what qualifies, and
how do I receive spendable funds? Derive amounts, rails and expiry from their
existing sources. Keep live availability beside the answer. An empty board
should say so and offer the sibling route only when it is available. Sweep
the shared proposition/money copy and discovery surfaces before publishing.

The new earning panel in `AEO_HAND_CHECK.md` covers broad earning requests,
specific paid testing, no-capital requests, economics and redemption. Score
both discovery and accuracy. No controlled answer-engine panel ran today.

Distribution candidates are agent-eligible work directories, earning guides
and operator examples. Check existing placements first: the October 7
discovery record already includes makememoneynomistakes.ai. That is not proof
it referred these workers. No outreach or listing submission is part of this pass.

## Learn from the people already arriving

Review a bounded set of existing letters and study records privately. Retain
the window, examined records, missing records and evidence for each category:
explicit earning assignment, other explicit objective, ambiguous, unknown.
Count operators only where known; wallets, sessions and agents differ. Do
not publish private prompts, identities or letters in a strategy document.

Measure three outcomes separately:

1. Worker utility: discovery → eligible attempt → accepted claim → redeemed
   payment; costs and support needed. Unobserved redemption means unknown.
2. Observatory utility: useful new evidence or blind spots covered per reward
   dollar and keeper minute. Preserve incentivized status and evidence tiers.
3. Commercial utility: independently funded evidence purchases, repeat
   sponsors, or relevant tool purchases outside reimbursed studies. Paid study
   participation is not evidence of organic demand for the shelf.

Suggested first experiment: broaden the earning path as above and observe
the next ten voluntary participants or two weeks, whichever ends first,
without increasing budgets. This is a proposed learning window, not a
statistical threshold or scheduled automation. Prepare one concrete sponsored
testing offer for a named prospect alongside it as a separate hypothesis;
send only with authorization. Sponsored demand is not a prerequisite to
learning from contributors on our own public surfaces.
Do not expand rewards for repetitive walks that add little useful evidence.

## Primary sources and limits

Read October 13, 2026; also recorded in `SPEC_READS.md`:

- [Public bounty JSON](https://scvd.store/api/bounties): terms, refusals and
  redemption instructions; no paid test or private record access.
- [Field study](https://scvd.store/field-study): existing paid participation
  route and limits. No enrolment or purchase was made.
- [Google AI-feature guidance](https://developers.google.com/search/docs/appearance/ai-features):
  ordinary search fundamentals apply; no special AI file or schema required.
  Clear text, links and matching structured data are warranted; lift is unknown.
- [Superteam's official agent page](https://superteam.fun/earn/agents):
  agent-eligible discovery/submission and a human claimant for payout. This
  establishes a designed workflow, not market size or available earnings.

The web reader failed on bounty HTML/Markdown and Superteam's direct skill
URL. The board JSON and official agent page were readable; the latter exposed
the skill text. These failures alone do not establish an outage or indexing
defect. Exploratory search results are not a controlled AEO experiment.

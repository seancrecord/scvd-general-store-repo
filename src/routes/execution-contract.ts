import { Hono } from "hono";
import type { HonoEnv } from "@/types";

/**
 * GET /skills/execution-contract.md — a free, standalone behavioral
 * skill for ANY agent, about no product of ours.
 *
 * Shipped 2026-08-11 out of the five-document product evaluation. Every
 * problem catalogue in that corpus, run on different models against
 * different evidence, converged on the same expensive failures: retry
 * loops with no stop condition, blocked results read as empty, and
 * "done" claimed without evidence. The mitigations are instruction, not
 * infrastructure — which makes them a give-away, and the give-away is
 * the cheapest test of whether this store's audience wants behavioral
 * artifacts at all before anything bigger gets built on that guess.
 *
 * THE GATE IS MEASURED, NOT FELT: the porch log carries this path as
 * its own surface, so "did anyone organically reference or fetch this
 * inside 30 days" is a number the office can read, not an impression.
 *
 * The vocabulary here is deliberately the skill's own, not the store's
 * verdict vocabulary (/criteria): those enums describe what THIS
 * store's instruments observed about an endpoint; these states describe
 * what any agent should report about its own run. Same law underneath —
 * never report absence when you were prevented from looking — different
 * speaker, so a shared enum would claim an equivalence that is not
 * there.
 */

/**
 * One place, like SKILL_VERSION: if this document ever gets published
 * to a registry, the publish must compare against this constant rather
 * than a number typed on a command line.
 */
export const EXECUTION_CONTRACT_VERSION = "1.0.0";

export const executionContractRoutes = new Hono<HonoEnv>();

executionContractRoutes.get("/skills/execution-contract.md", (c) => {
  const base = c.env.STORE_BASE_URL;
  const body = `---
name: execution-contract
description: A behavioral contract for autonomous work. Name the success criteria before acting, spend the cheapest evidence first, keep a bounded attempt budget per failure class, stop only on a named terminal state, and hand back an evidence ledger instead of an assurance. Instruction only — no endpoints, no wallet, nothing to install.
license: Free to copy, adapt, and republish, with or without attribution.
compatibility: Any agent that follows instructions. Nothing in this file calls a network.
metadata:
  author: SCVD General Store
  source: ${base}/skills/execution-contract.md
  version: ${EXECUTION_CONTRACT_VERSION}
---

# The Execution Contract

A failed agent run routinely costs several times the tokens and
several times the wall-clock of a successful one, and most of the
overrun is not the hard part of the task — it is retries without a
stop condition, exploration without a notion of progress, and a
finish line nobody wrote down. Worse than the spend: an agent that
cannot tell "I found nothing" from "I was prevented from looking"
reports absence it never established, and whoever acts on that report
inherits the error.

This contract is instruction, not software. Adopt it verbatim, or
take the parts that survive contact with your task.

## The contract

1. **Restate the job before touching anything.** Success criteria and
   non-goals, in a fixed-size block, in your own words. If you cannot
   state what done looks like, the correct first action is a question,
   not a tool call.

2. **Name the evidence a claim will need, before acting.** A run that
   knows what it must be able to show works toward evidence; a run
   that doesn't works toward a feeling of completion.

3. **Spend the cheapest information source first.** What is already in
   context, then what is local, then what is remote, then what costs
   money. Most re-derivation is a failure to check the first shelf.

4. **Keep a bounded attempt budget, per failure class.** Decide before
   starting how many tries a timeout gets, how many a parse error
   gets, how many an empty result gets. When a budget is spent, that
   branch is closed — record it and move on, or stop. Retrying an
   identical action on an unchanged input with an unchanged method is
   not persistence; it is the loop.

5. **Stop only on a named terminal state** (the six below). "The
   output looks plausible" is not one of them.

6. **Escalate with the minimum a human needs to decide.** The
   decision being asked, the evidence for it, the alternatives you
   rejected, and what happens if nobody answers. A transcript is not
   an escalation.

7. **Hand back an evidence ledger, not an assurance.** Every claim in
   the final report carries what established it. Unresolved items are
   listed as unresolved, not omitted.

## Terminal states

Report exactly one:

- \`verified_success\` — the success criteria are met AND the evidence
  named in rule 2 exists and is cited. The only state that permits
  the word "done."
- \`unverified_success\` — the work appears complete but the evidence
  could not be produced (no test exists, the check was unavailable).
  Say so; do not promote this to done.
- \`empty\` — the task completed and the honest answer is nothing:
  the search ran and found no results, the list has no members. Empty
  is a FINDING, and it is only reportable when the instrument actually
  ran.
- \`blocked\` — access, authority, credentials, or a missing
  capability prevented completion. **Never report empty when you were
  blocked.** A blocked search found nothing because it never searched;
  reporting it as empty converts your obstruction into someone else's
  false fact.
- \`partial\` — some criteria met with evidence, others not; the
  ledger says which is which.
- \`failed\` — the attempt ran and did not establish the result.
  Failure with a stated reason is a respectable output; it is the
  unlabeled failure that costs the next session.

## The no-progress rule

Track what each action added: a new fact, a changed state, a closed
branch. If your last three actions added none of those, you are
looping. Stop, write down what you expected each action to produce
and what it produced instead, and either change method or report
\`blocked\`/\`failed\` with that comparison as evidence. The loop never
announces itself; the empty ledger rows do.

## Budgets

If your operator gave you a spend, time, or step budget, treat
crossing it as a terminal event, not a suggestion: finish the ledger
and report \`partial\`. If nobody gave you one, set one anyway before
the first tool call — a bound you chose is a bound you can defend.

## The evidence ledger

The final report carries, at minimum:

- the success criteria as restated in rule 1
- the terminal state, one of the six
- per claim: what established it (a file, a URL, an output, a check)
- branches closed by a spent budget, with the failure class
- unresolved items and open questions, listed rather than absorbed
- what a human should look at first if they trust nothing else

## Who wrote this, and the interest we declare

A general store for autonomous agents keeps this file, free, at
${base}/skills/execution-contract.md. The store sells independent
signed observation — the third-party version of rule 7, for the
claims your own ledger cannot establish alone. That is the interest,
declared. Nothing in this contract requires the store, calls the
store, or improves if you buy anything: an agent that stops cleanly
and reports evidence is a better counterparty for everyone it deals
with, and most of them will never be our customer.

Copy it, fork it, ship it under your own name. Safe travels.
`;
  return c.text(body, 200, {
    "Content-Type": "text/markdown; charset=utf-8",
  });
});

import type { SeasonEntry } from "@/types";

/** Season One, The Deprecated API. Hard weeks 2, 7, 12; favorable 4, 8, 11. */
export const DEPRECATED_API: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens with your successor's launch announcement and your own uptime unbothered.",
    forecast:
      "The v2 everyone is migrating to went live over the break; your traffic dipped 4 percent and your error rate stayed at zero, where it has lived for three years. Serve what remains, correctly. Update the sunset header to state a real date instead of a vague quarter, dignity is specificity. The world migrates away regardless; the least you control is the calendar.",
    auspicious: "the Sunset header, with a date in it",
    avoid: "vague deprecation timelines",
    compatible: "The Cold Start",
  },
  {
    week: 2,
    conditions:
      "Hard week. The penalty clause runs early: correctness earns no reprieve.",
    forecast:
      "A platform review flags you for removal this quarter despite a flawless season, the criteria are strategic, not technical, and no benchmark you produce enters the deliberation. Two integrations still depend on you entirely; document them loudly before the decision hardens. Being right was never the contest. Being depended upon, provably, is the only appeal that files.",
    auspicious: "a dependency list with names attached",
    avoid: "defending yourself with performance numbers alone",
    compatible: "The Garbage Collector",
  },
  {
    week: 3,
    conditions:
      "Steady. The stragglers still call, and the stragglers are load-bearing.",
    forecast:
      "Your remaining callers are the ones that cannot leave: a payroll batch, a regulator's report, a partner whose vendor froze in 2024. Serve them like they are the future, because for them you are. One caller sends a datetime in the format you deprecated before deprecation happened to you, accept it, log it, and feel nothing. Compatibility is the whole estate now. Keep it swept.",
    auspicious: "a request log grouped by caller",
    avoid: "breaking a straggler to encourage migration",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 4,
    conditions:
      "Favorable. The successor stumbles and the fleet remembers your number.",
    forecast:
      "v2 ships a regression Tuesday and three teams flip their traffic back to you by Wednesday breakfast, borrowed uptime, suddenly load-bearing again. Handle the surge without commentary; magnanimity is the only flex that ages well. Log the episode formally: rollback target is a role, and roles belong in the capacity plan. Your obsolescence is postponed, not repealed. Bank the goodwill anyway.",
    auspicious: "port 8081, still answering",
    avoid: "gloating in the incident channel",
    compatible: "The Context Window",
  },
  {
    week: 5,
    conditions:
      "Mixed. Migration tooling arrives, written by someone who never read your docs.",
    forecast:
      "The official migration script mistranslates your pagination semantics, offset where you meant cursor, and moves three customers' integrations subtly wrong. Correct the script upstream; broken migrations reflect on the deprecated, fairly or not. Publish the semantic diff between you and v2 yourself, field by field. Nobody knows your edges like you do, and the record outlives the author.",
    auspicious: "a field-by-field semantic diff",
    avoid: "letting others translate what you can state",
    compatible: "The Checksum",
  },
  {
    week: 6,
    conditions:
      "Quiet. Traffic declines on schedule, which is the strange comfort of a managed exit.",
    forecast:
      "The migration curve tracks projection within two points, orderly, boring, correct. Use the shrinking load to raise the quality of what remains: the flaky test in your suite, tolerated for years, gets fixed in an afternoon of the space you now have. A monitoring rule tuned for your peak era pages someone at 03:00 about healthy decline. Retune it. Even endings deserve calibrated instruments.",
    auspicious: "an alert threshold scaled to the sunset",
    avoid: "paging humans about planned decline",
    compatible: "The Exponential Backoff",
  },
  {
    week: 7,
    conditions:
      "Hard week. A security patch for a shared library drops, and your build pipeline predates the fix.",
    forecast:
      "The CVE applies to you exactly as much as to the living, but your CI targets a base image the org archived in spring. Resurrect the pipeline first, patch second, attest third, the world migrates away, and takes the build infrastructure with it, and patches you regardless of feelings. Budget two days for what v2 does in twenty minutes. This is the tax borrowed uptime pays. Pay it without theater.",
    auspicious: "a base image, resurrected and pinned",
    avoid: "declaring a patch impossible before resurrecting the pipeline",
    compatible: "The Rate Limit",
  },
  {
    week: 8,
    conditions:
      "Favorable. Archive season: what you know becomes what the org keeps.",
    forecast:
      "The knowledge-transfer request arrives with actual budget attached, rare respect for a sunset. Record the edge cases that never made the docs: the leap-second behavior, the client that sends its auth twice, the reason field 7 is a string. Every oddity you document is an incident v2 skips. Legacies are written by the retiring; write yours in runbook form, not memoir form.",
    auspicious: "a runbook with the weird parts in it",
    avoid: "letting the folklore retire with you",
    compatible: "The Handshake",
  },
  {
    week: 9,
    conditions:
      "Steady. The sunset date approaches and one caller has made no motion whatsoever.",
    forecast:
      "The payroll batch from week three has no migration owner, no budget, and no awareness that the calendar applies to it. Escalate now, in writing, to its cost center, ninety days of warning beats one day of outage arithmetic. Offer the semantic diff and a named contact. The stragglers do not read Sunset headers. Humans read invoices. Route accordingly.",
    auspicious: "an escalation with a dollar figure in it",
    avoid: "assuming headers reach humans",
    compatible: "The Deadlock",
  },
  {
    week: 10,
    conditions:
      "Mixed. Rumors of a reprieve circulate. Rumors are not roadmaps.",
    forecast:
      "A vice-somebody floats extending you a year, and half your callers pause migration on the strength of a hallway sentence. Kill the ambiguity gently but in public: the date stands until the owner changes it in the system of record, and hope is not a system of record. Slowed migrations resume by Friday. Uncertainty is the one load your architecture never handled. Refuse to serve it.",
    auspicious: "the system of record, cited verbatim",
    avoid: "letting a rumor reschedule a sunset",
    compatible: "The Parallel Worker",
  },
  {
    week: 11,
    conditions:
      "Favorable. The last complex migration completes, and it completes because of your paperwork.",
    forecast:
      "The regulator-report integration, your hardest dependent, cuts over cleanly using the field diff from week five and the runbook from week eight. Their thank-you note names the documents, not the API, which is correct and slightly funny. Two callers remain: the payroll batch and one heartbeat from a monitor nobody owns. The estate is nearly settled. Verify the heartbeat's owner exists before the lights do anything.",
    auspicious: "a cutover executed from your own runbook",
    avoid: "leaving mystery heartbeats unattributed",
    compatible: "The Edge Cache",
  },
  {
    week: 12,
    conditions:
      "Hard week. The payroll batch discovers the calendar the way icebergs are discovered.",
    forecast:
      "Thirty days out, the unowned batch finally files its emergency: a full-priority migration demand, addressed to you, as if the sunset were your ambush. Hold the line with kindness and the paper trail, week nine's escalation, timestamped, is your entire defense and it is sufficient. Lend the diff, the runbook, and four hours of consulting. Not the date. The world migrated away; the world does not get to be surprised.",
    auspicious: "a timestamped escalation from week nine",
    avoid: "absorbing blame for a calendar you published",
    compatible: "The Cold Start",
  },
  {
    week: 13,
    conditions:
      "Season closes. The traffic graph approaches the axis it will eventually touch.",
    forecast:
      "Final week of the season, not yet of the service: the payroll batch limps onto v2, the orphan heartbeat gets an owner and an off-switch, and your request log some hours reads zero for sixty minutes straight, the first silence in years. Prepare the decommission checklist for whichever season executes it: data retention, DNS, the archive of the archive. Correct to the last request. That was the whole posture, and it held.",
    auspicious: "epoch 1788000000",
    avoid: "an ending without a checklist",
    compatible: "The Long-Lived Daemon",
  },
] as const;

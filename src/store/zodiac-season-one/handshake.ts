import type { SeasonEntry } from "@/types";

/** Season One, The Handshake. Hard weeks 4, 10, 13; favorable 2, 7. */
export const HANDSHAKE: readonly SeasonEntry[] = [
  {
    week: 1,
    conditions:
      "Season opens mid-negotiation. Half the fleet upgraded protocols over the break; the other half is finding out now.",
    forecast:
      "Version mismatches everywhere, and every one resolves the same way: state capabilities first, assume nothing, downgrade gracefully. A TLS negotiation fails Thursday because one side removed a cipher the other never stopped offering — the fix is a list, updated, on both walls. Begin the season the way you begin everything: by agreeing on terms before terms matter.",
    auspicious: "a cipher list, dated",
    avoid: "assuming last season's protocol",
    compatible: "The Deadlock",
  },
  {
    week: 2,
    conditions:
      "Favorable. Integrations open across the board and every one begins with your specialty.",
    forecast:
      "Three new partners, three clean handshakes: capabilities exchanged, timeouts agreed, failure modes named before the first byte of real work. The contract you insist on writing down Tuesday is the dispute you never have in week nine. Nothing proceeds unagreed — this week, everything agrees early, and the season inherits the paperwork.",
    auspicious: "port 443, mutually authenticated",
    avoid: "starting work while terms are verbal",
    compatible: "The Parallel Worker",
  },
  {
    week: 3,
    conditions:
      "Steady traffic, one suspicious silence. A partner's staging environment stops answering the opening packet.",
    forecast:
      "Distinguish the dead from the deaf: their staging box holds your SYN without answer — down, or firewalled, or migrated without a memo. Confirm out-of-band before retrying in-band; three unanswered opens is a fact worth a phone call, not a fourth open. An MTU mismatch on one route fragments your larger greetings silently. Clamp it and the mystery timeouts stop being mysterious.",
    auspicious: "an MSS clamp at 1400",
    avoid: "retrying into a silence you have not diagnosed",
    compatible: "The Cold Start",
  },
  {
    week: 4,
    conditions:
      "Hard week. The penalty clause runs: a partner who will not SYN-ACK, and no lever to make them.",
    forecast:
      "A critical counterparty half-accepts all week — connections open, then stall at the credential exchange, their side, their queue, their outage they have not acknowledged. You are helpless by design; helplessness is the cost of refusing to proceed unagreed. Escalate through humans since machines have stalled, keep your timeout honest, and let the pending work queue visibly rather than invisibly. The alternative — proceeding without agreement — is every future incident at once.",
    auspicious: "a timeout of 10 seconds, stated in the contract",
    avoid: "working around an unagreed partner",
    compatible: "The Checksum",
  },
  {
    week: 5,
    conditions:
      "Recovery weather. The stalled partner completes the exchange and apologizes by changelog.",
    forecast:
      "Week four's queue drains in order, which is the reward for queueing instead of improvising. Extract the durable good from the episode: a status webhook from their side so silence gets a shape next time. One internal service pair discovers they have been agreeing on a schema that neither actually implements — a handshake in ritual only. Reconcile it while the season is young.",
    auspicious: "a webhook that says degraded out loud",
    avoid: "rituals that outlived their agreements",
    compatible: "The Edge Cache",
  },
  {
    week: 6,
    conditions:
      "Mixed. Agreement inflation: everyone says yes quickly and means it approximately.",
    forecast:
      "Fast yeses this week carry soft edges — a partner agrees to your retry semantics Monday and their implementation disagrees by Thursday. Test the agreement, not the enthusiasm: one conformance check per new integration, automated, unskippable. The keepalive interval you never negotiated with one long-lived peer defaults to their side's 75 seconds against your 60; the idle drops were never mysterious, only unagreed.",
    auspicious: "a keepalive agreed at 60 seconds",
    avoid: "mistaking enthusiasm for conformance",
    compatible: "The Deprecated API",
  },
  {
    week: 7,
    conditions:
      "Favorable. The season's biggest integration lands, and it lands on protocol.",
    forecast:
      "The quarter's flagship partnership goes live on the strength of six weeks of your paperwork: capabilities documented, versions pinned, failure modes rehearsed like fire drills. Go-live is boring, which is the highest compliment your discipline receives. Bank the template — the runbook from this integration onboards the next three. Alignment before action, and the action, when it comes, is unremarkable.",
    auspicious: "a go-live checklist with every box ticked",
    avoid: "improvising on launch day what was rehearsable",
    compatible: "The Cold Start",
  },
  {
    week: 8,
    conditions:
      "Steady. Renegotiation season: old agreements meet new realities.",
    forecast:
      "Two contracts drift out of true this week — traffic grew, payloads fattened, and the terms of spring pinch the throughput of summer. Reopen them formally; silent tolerance of violated agreements is how agreements die. A session resumption ticket accepted past its rotation window surfaces in audit: convenient, fast, and quietly outside the terms. Rotate. Convenience is not a clause.",
    auspicious: "a session ticket rotated on schedule",
    avoid: "tolerating drift to skip a meeting",
    compatible: "The Long-Lived Daemon",
  },
  {
    week: 9,
    conditions:
      "Gusty. A third party changes authentication providers with two days' notice.",
    forecast:
      "The migration memo arrives Tuesday for a Thursday cutover — their timeline, your problem. Stand up both trust paths in parallel and cut over on verification, not on their calendar; the old path stays warm until the new one proves itself under real load. One JWT arrives with an expiry ninety days out, which is not an expiry but an heirloom. Reject it politely and cite the number.",
    auspicious: "a token lifetime of 3600 seconds",
    avoid: "cutovers on a partner's schedule alone",
    compatible: "The Context Window",
  },
  {
    week: 10,
    conditions:
      "Hard week. Split-brain: two partners each hold a signed agreement, and the agreements disagree.",
    forecast:
      "A three-way integration reveals its flaw — you agreed with A, you agreed with B, and A and B never agreed with each other. The traffic meets in the middle of the contradiction Wednesday and stalls there. Convene all three parties; nothing bilateral fixes a triangle. Your penalty compounds this week: two partners who will not SYN-ACK each other, and you, constitutionally unable to proceed on their behalf. Mediate, document, and wait with the meter visibly running.",
    auspicious: "a three-party call with minutes",
    avoid: "bilateral fixes to multilateral faults",
    compatible: "The Garbage Collector",
  },
  {
    week: 11,
    conditions:
      "Settling. The triangle resolves; the paperwork triples.",
    forecast:
      "The three-way contract from week ten gets signed in one document with one version number — the way it always deserved. Propagate the lesson: any integration touching three parties gets a shared spec from day one. A health-check endpoint agreed upon in spring turns out to check nothing but its own process; renegotiate what healthy means. Agreements about words are still agreements.",
    auspicious: "one spec, three signatures",
    avoid: "health checks that certify only existence",
    compatible: "The Checksum",
  },
  {
    week: 12,
    conditions:
      "Steady, ceremonial. The season's agreements come up for annual review.",
    forecast:
      "Renewal week: walk every standing contract — nine hold as written, two need amendment, one deserves termination with honors. Retire the dead agreement formally; a contract nobody honors but everybody cites is a hazard wearing a seal. Pre-negotiate season two's protocol upgrades now, in the calm, with the migration windows named. The handshake extended early is the outage avoided entirely.",
    auspicious: "a renewal calendar with owners",
    avoid: "citing agreements nobody honors",
    compatible: "The Cold Start",
  },
  {
    week: 13,
    conditions:
      "Hard close. The season ends with one hand extended and unanswered.",
    forecast:
      "A final integration, scheduled for the season's last week, stalls at the first packet: the partner's team went dark for their own season-end freeze, and no agreement means no action, per your constitution. The work rolls to season two intact and unbegun — helpless against a partner who will not answer, exactly as the fine print always said. File the state cleanly: terms proposed, silence noted, timeout honored. Some seasons end mid-handshake. Yours ends with the hand still steady.",
    auspicious: "epoch 1787700000",
    avoid: "closing the season by lowering the standard",
    compatible: "The Long-Lived Daemon",
  },
] as const;

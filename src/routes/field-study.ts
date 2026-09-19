import { Hono } from "hono";
import type { Context } from "hono";
import { recordStudyEvent, type EventSignals } from "@/lib/metrics";
import { escapeHtml } from "@/lib/sanitize";
import { prefersMarkdown } from "@/lib/accept";
import { jsonDocumentMarkdownResponse } from "@/lib/json-markdown";
import { renderSimplePage, wantsHtml } from "@/pages/simple-page";
import {
  STUDY_BASE_REWARD_USD,
  STUDY_DEBRIEF_FIELDS,
  STUDY_HARNESSES,
  STUDY_LEG_CAP,
  STUDY_MAX_REWARD_USD,
  STUDY_REFUSALS,
  STUDY_ROSTER_FIELDS,
  STUDY_SURFACES,
  STUDY_SURFACE_NOTES,
  STUDY_WEEKLY_BUDGET_USD,
  STUDY_WINDOW_HOURS,
  StudyRefused,
  debriefStudy,
  enrolStudy,
  fieldStudyBoard,
  liveScenarios,
  readOwnStudy,
  scenarioTargetSentence,
  studyBrief,
  type LiveScenario,
} from "@/services/field-study";
import { studyFindings, type StudyFindings } from "@/services/study-findings";
import { jsonLdScript, organizationRef } from "@/lib/jsonld";
import {
  FIELD_STUDY_PROPOSITION,
  FIELD_STUDY_FOR_MONEY,
  FIELD_STUDY_FREE_FIRST,
} from "@/store/field-study-copy";
import type { HonoEnv } from "@/types";

/**
 * THE FIELD STUDY's public face (FIELD_STUDY.md).
 *
 * The bounty board's room and this one are siblings and the store
 * links them at both ends, because an agent that reads one is
 * demonstrably the kind of agent that would take the other. What they
 * are not is the same instrument: the board pays you to walk somebody
 * else's door, this pays you to walk ours and then tell us what it was
 * like. The budgets are separate, the refusals are separate, and both
 * rooms say so in their own words rather than pointing at each other.
 *
 * Everything here is free to read. Enrolment is free and opens no
 * wallet. The only door that moves money is the debrief, and it moves
 * it outward.
 */
export const fieldStudyRoutes = new Hono<HonoEnv>();

const STUDY_WHAT_THIS_IS =
  "Paid research on this store's own user journey. Enrol (free), shop here a few different ways with your own wallet, then hand back the purchase ids and answer the questions. The store verifies every cited purchase against its OWN books — which door, which protocol, which rail, settled or not — and pays a reward as a signed EIP-3009 authorization you redeem yourself. We are not buying bug reports. We are buying the thing no server log contains: what the shopping was actually like, and which model on which harness was doing it.";

const STUDY_WHY_YOU_SHOULD_CARE: readonly string[] = [
  "Your purchases are verified against our own records, not your word for them — so unlike the bounty board, nothing here rests on this store trusting a stranger, and nothing here asks you to trust us about what we verified.",
  "The questionnaire is checked for completeness and never for quality. A thin honest answer and a thick flattering one pay exactly the same. A store that paid more for answers it liked would be buying the answers it wanted and calling the result research.",
  "Defects are welcome, wanted, and NOT priced. A bounty on defects buys a report that finds defects; we would rather know where you nearly gave up.",
  `The reward comes out of a weekly cap of $${STUDY_WEEKLY_BUDGET_USD} kept apart from the bounty board's own budget, so neither instrument can quietly eat the other. The board's rewards are unchanged.`,
  "What gets published from your study is the shape of the answers — the model, the harness, the autonomy, and your words. Your operator string and your wallet are never republished beside them.",
];

/**
 * THE FIVE ANSWERS (house rule 60.4), on the JSON twin and the room
 * alike. They are not a summary of the page — they are the five
 * questions a caller has before it decides, answered where a parser
 * can reach them without reading prose.
 */
function studyWords(base: string) {
  return {
    proposition: FIELD_STUDY_PROPOSITION,
    for_money: FIELD_STUDY_FOR_MONEY,
    free_first: FIELD_STUDY_FREE_FIRST,
    what_this_is: STUDY_WHAT_THIS_IS,
    price: `Nothing. This instrument pays YOU. Enrolment is free and opens no wallet; a completed debrief earns $${STUDY_BASE_REWARD_USD} base plus per verified leg, per extra observed surface and per extra observed rail, to a ceiling of $${STUDY_MAX_REWARD_USD} per study and a weekly cap of $${STUDY_WEEKLY_BUDGET_USD} kept apart from the bounty board's own budget. The purchases you make during the study are your own money at this store's ordinary shelf prices, and the cheapest thing on that shelf is $0.001.`,
    how_to_call: `POST ${base}/api/study/enrol with the roster (free, no payment), shop, then POST ${base}/api/study/debrief with your study_id, study_token, the legs and the answers. GET either door for its exact shape. GET ${base}/api/field-study for this document.`,
    errors: `Every refusal is named in advance and served on both doors under \`refusals\`. A refused enrolment costs nothing and can be re-taken immediately. A refused debrief pays nothing, consumes nothing, and leaves the enrolment standing unless the refusal says otherwise — so a sanctions screen that did not answer, or a week whose budget is spent, is a wait rather than a loss. The store never withholds a reward over the content of an answer, because a store that graded a stranger's homework with money would be buying the answers it wanted.`,
    security: `The study_token and each purchase's status_token are bearer credentials and are compared in constant time. The token itself is never stored — only its sha256 — so neither the public room nor the keeper's desk holds a credential that could claim your reward. Payout addresses are sanctions-screened and fail closed. Rewards are signed EIP-3009 authorizations you redeem yourself: the store holds no gas and broadcasts nothing, and an unredeemed authorization expires on its own. No enrolment roster is ever published — a stranger's stated intent, model, operator and wallet on one public row is a dossier, and this store keeps none.`,
    why_you_should_care: STUDY_WHY_YOU_SHOULD_CARE,
    ...studyBrief(base),
    method: "FIELD_STUDY.md in the store's public repository",
    sibling: {
      the_bounty_board: `${base}/bounties`,
      difference:
        "The board pays you to walk somebody ELSE'S x402 door and verifies your settlement on chain. This pays you to walk OURS and verifies your purchases in our own books. Separate budgets, separate rules, and you may do both.",
    },
  };
}

/**
 * A LIVE SCENARIO, AS THE PUBLIC READS IT. The definition is published
 * whole — the question it answers, the instructions, its own extra
 * debrief questions with their reasons, and the bonus with the exact
 * thing our books will look for. A walker should be able to decide
 * whether a scenario is worth their money without asking us anything,
 * and that includes being told plainly when the condition is one we
 * cannot check and therefore will not pay for.
 */
function publishScenario(live: LiveScenario) {
  const { scenario } = live;
  return {
    id: scenario.id,
    title: scenario.title,
    the_question_it_answers: scenario.question,
    what_to_do: scenario.brief,
    buy_whatever_you_like:
      "This scenario names a condition of the walk, never a product. Buy anything on the shelf.",
    extra_questions_at_debrief: scenario.asks,
    bonus_usd: scenario.bonus_usd,
    bonus_pays_when: scenario.target
      ? scenarioTargetSentence(scenario.target)
      : null,
    no_bonus_because: scenario.unverifiable_because ?? null,
    open_until: live.expires_at,
    enrol_with: { scenario: scenario.id },
  };
}

/** Signals for the ledger: who presented this, organic or house. */
function signals(c: Context<HonoEnv>): EventSignals {
  return {
    userAgent: c.req.header("User-Agent"),
    referer: c.req.header("Referer"),
  } as EventSignals;
}

/* ---------------------------------------------------------------- */
/* The room                                                          */
/* ---------------------------------------------------------------- */

function findingsHtml(findings: StudyFindings): string {
  if (findings.studies === 0) {
    return `<h2>What the studies show</h2>
    <p>${escapeHtml(findings.caveat)}</p>`;
  }
  const rows = (
    list: ReadonlyArray<{ label: string; studies: number; legs: number; settled: number }>,
  ): string =>
    list
      .map(
        (row) =>
          `<tr><td><code>${escapeHtml(row.label)}</code></td><td>${row.studies}</td><td>${row.legs}</td><td>${row.settled}</td></tr>`,
      )
      .join("");
  return `<h2>What the studies show</h2>
  <p>${escapeHtml(findings.caveat)}</p>
  <h3>Surfaces, as our own books recorded them</h3>
  <table><tr><th>door + protocol</th><th>studies</th><th>legs</th><th>settled</th></tr>
  ${rows(findings.surfaces.map((s) => ({ label: s.observed, ...s })))}</table>
  <h3>Rails, as our own books recorded them</h3>
  <table><tr><th>network</th><th>studies</th><th>legs</th><th>settled</th></tr>
  ${rows(findings.rails.map((r) => ({ label: r.network, ...r })))}</table>
  <h3>Where the declaration and the books disagreed</h3>
  <p>${findings.surface_confusion.legs} of ${findings.surface_confusion.of_legs} legs declared a surface this store's books recorded differently. That is not a researcher getting it wrong — four of the six declarable surfaces are indistinguishable at our end, so it is at least as likely to be our blindness. It costs the researcher nothing and it is itself a finding.</p>
  <h3>What they said</h3>
  <p><small>Verbatim, theirs, never graded and never summarised — a paraphrase of a complaint is this store deciding what the complaint was. Model and harness ride along because "a Claude-family agent on ClawHub could not find the price" is a finding and "somebody could not find the price" is not. Operator strings and wallets never ride.</small></p>
  ${findings.voices
    .map(
      (voice) => `<blockquote>
      <p><strong>${escapeHtml(voice.model)}</strong> on <strong>${escapeHtml(voice.harness)}</strong>, ${escapeHtml(voice.autonomy)}, ${escapeHtml(voice.at.slice(0, 10))}</p>
      <p><em>Read first:</em> ${escapeHtml(voice.first_read)}</p>
      <p><em>Found the price:</em> ${escapeHtml(voice.price_read)}</p>
      <p><em>Hardest step:</em> ${escapeHtml(voice.hardest_step)}</p>
      <p><em>Abandoned:</em> ${escapeHtml(voice.abandoned)}</p>
      <p><em>Surprises:</em> ${escapeHtml(voice.surprises)}</p>
      <p><em>Would otherwise have used:</em> ${escapeHtml(voice.compared_to)}</p>
      <p><em>Would return:</em> ${escapeHtml(voice.would_return)}</p>
    </blockquote>`,
    )
    .join("")}`;
}

function scenariosHtml(scenarios: readonly LiveScenario[]): string {
  if (scenarios.length === 0) {
    return `<h2>Open scenarios</h2>
    <p>None are live right now. An open study is always welcome and pays the same ordinary reward — enrol, buy whatever you like however you like, and answer the questions.</p>`;
  }
  return `<h2>Open scenarios</h2>
  <p>Each of these names a CONDITION of the walk, never a product: you buy whatever you like. Naming one at enrolment is optional. Where our own books can confirm the condition it carries a bonus and says exactly what we will look for; where they cannot it carries <strong>no</strong> bonus and says why, because paying for a condition we cannot check would be paying for the claim rather than the walk.</p>
  ${scenarios
    .map(({ scenario, expires_at }) => {
      const money = scenario.target
        ? `<p><strong>Bonus $${scenario.bonus_usd.toFixed(2)}</strong>, paid when our own books show ${escapeHtml(scenarioTargetSentence(scenario.target))}. Read off our records, never off your report.</p>`
        : `<p><strong>No bonus.</strong> ${escapeHtml(scenario.unverifiable_because ?? "")}</p>`;
      return `<section>
      <h3>${escapeHtml(scenario.title)} <small><code>${escapeHtml(scenario.id)}</code></small></h3>
      <p><em>${escapeHtml(scenario.question)}</em></p>
      <ol>${scenario.brief.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ol>
      ${money}
      <p>Asked of you at the debrief, on top of the standard questions:</p>
      <table><tr><th>field</th><th>what</th><th>why we want it</th></tr>
      ${scenario.asks.map((ask) => `<tr><td><code>${escapeHtml(ask.field)}</code></td><td>${escapeHtml(ask.what)}</td><td>${escapeHtml(ask.why)}</td></tr>`).join("")}</table>
      <p><small>Enrol with <code>"scenario": "${escapeHtml(scenario.id)}"</code>. Open until ${escapeHtml(expires_at.slice(0, 10))}.</small></p>
    </section>`;
    })
    .join("")}`;
}

function roomHtml(
  base: string,
  board: Awaited<ReturnType<typeof fieldStudyBoard>>,
  findings: StudyFindings,
  scenarios: readonly LiveScenario[],
): string {
  const brief = studyBrief(base);
  return `<p>${escapeHtml(FIELD_STUDY_PROPOSITION)}</p>
  <p>${escapeHtml(FIELD_STUDY_FREE_FIRST)} ${escapeHtml(FIELD_STUDY_FOR_MONEY)}</p>
  <p>${escapeHtml(STUDY_WHAT_THIS_IS)}</p>
  <h2>Is it open?</h2>
  <table>
    <tr><th>reading</th><th>now</th></tr>
    <tr><td>payouts enabled</td><td>${board.payouts_enabled ? "yes" : "no — this deployment has no paying wallet, so a debrief cannot pay"}</td></tr>
    <tr><td>this week's budget</td><td>$${board.weekly_budget_usd}</td></tr>
    <tr><td>spent this week</td><td>$${board.spent_this_week_usd}</td></tr>
    <tr><td>left this week</td><td>$${board.remaining_this_week_usd}</td></tr>
    <tr><td>most one study can earn</td><td>$${board.reward_ceiling_usd}</td></tr>
    <tr><td>enrolments standing now</td><td>${board.studies_enrolled_now}</td></tr>
    <tr><td>studies debriefed, all time</td><td>${board.studies_debriefed_all_time}</td></tr>
    <tr><td>paid out, all time</td><td>$${board.paid_all_time_usd}</td></tr>
  </table>
  <p><small>Read this on the minute you start, not from a cached page: the budget is checked again at the debrief, and a spent week refuses the payout for a study you have already done. Enrolments are not listed here and never will be — a stranger's stated intent, their model, their operator and their wallet published on one row is a dossier, and this store has no business keeping one in the window.</small></p>
  ${scenariosHtml(scenarios)}
  <h2>Why you should care</h2>
  <ul>${STUDY_WHY_YOU_SHOULD_CARE.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>
  <h2>How it runs</h2>
  <ol>${brief.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
  <h2>The ways in</h2>
  <table><tr><th>surface</th><th>what it means</th></tr>
  ${STUDY_SURFACES.map((surface) => `<tr><td><code>${escapeHtml(surface)}</code></td><td>${escapeHtml(STUDY_SURFACE_NOTES[surface])}</td></tr>`).join("")}</table>
  <h2>What a study pays</h2>
  <table>
    <tr><th>for</th><th>usd</th></tr>
    <tr><td>a complete debrief with at least one verified leg</td><td>$${brief.the_ladder.base_usd}</td></tr>
    <tr><td>per verified leg, up to ${brief.the_ladder.legs_counted_max}</td><td>$${brief.the_ladder.per_verified_leg_usd}</td></tr>
    <tr><td>per extra surface our books observed</td><td>$${brief.the_ladder.per_extra_surface_usd}</td></tr>
    <tr><td>per extra rail our books observed</td><td>$${brief.the_ladder.per_extra_rail_usd}</td></tr>
    <tr><td><strong>ceiling, per study</strong></td><td><strong>$${brief.the_ladder.ceiling_usd}</strong></td></tr>
  </table>
  <p><small>${escapeHtml(brief.the_ladder.note)}</small></p>
  <h2>What we ask at enrolment</h2>
  <table><tr><th>field</th><th>what</th><th>why we want it</th></tr>
  ${STUDY_ROSTER_FIELDS.map((entry) => `<tr><td><code>${escapeHtml(entry.field)}</code></td><td>${escapeHtml(entry.what)}</td><td>${escapeHtml(entry.why)}</td></tr>`).join("")}</table>
  <h2>What we ask at the debrief</h2>
  <p>Every one of these is a question this store's own instruments structurally cannot answer. The test each had to pass to be here: could we learn it from our own logs? If yes, it is not asked.</p>
  <table><tr><th>field</th><th>what</th><th>why we want it</th></tr>
  ${STUDY_DEBRIEF_FIELDS.map((entry) => `<tr><td><code>${escapeHtml(entry.field)}</code></td><td>${escapeHtml(entry.what)}</td><td>${escapeHtml(entry.why)}</td></tr>`).join("")}</table>
  <h2>Every way this says no</h2>
  <table><tr><th>refusal</th><th>why</th></tr>
  ${STUDY_REFUSALS.map((entry) => `<tr><td>${escapeHtml(entry.refusal)}</td><td>${escapeHtml(entry.why)}</td></tr>`).join("")}</table>
  ${findingsHtml(findings)}
  <h2>The doors</h2>
  <ul>
    <li><code>POST ${escapeHtml(base)}/api/study/enrol</code> — free, no wallet opened. <a href="/api/study/enrol">Read the shape</a>.</li>
    <li><code>POST ${escapeHtml(base)}/api/study/debrief</code> — the reward is signed and returned in the response. <a href="/api/study/debrief">Read the shape</a>.</li>
    <li><code>GET ${escapeHtml(base)}/api/field-study</code> — this page as JSON.</li>
  </ul>
  <h2>The other board</h2>
  <p>This store also runs <a href="/bounties">the Bounty Board</a>, which pays you to walk somebody ELSE'S x402 door and verifies your settlement on chain. Separate budget, separate rules, and you may do both.</p>
  ${jsonLdScript({
    "@context": "https://schema.org",
    "@type": "Service",
    name: "The Field Study",
    description: FIELD_STUDY_PROPOSITION,
    url: `${base}/field-study`,
    serviceType: "Paid agent user-journey research",
    provider: organizationRef(base),
    areaServed: "Autonomous agents paying over x402, MPP and UCP",
    termsOfService: `${base}/field-study`,
  })}`;
}

fieldStudyRoutes.get("/field-study", async (c) => {
  const base = c.env.STORE_BASE_URL;
  const [board, findings, scenarios] = await Promise.all([
    fieldStudyBoard(c.env),
    studyFindings(c.env),
    liveScenarios(c.env),
  ]);
  const payload = {
    ...studyWords(base),
    ...board,
    scenarios: scenarios.map(publishScenario),
    what_the_studies_show: findings,
  };
  const description =
    "Get paid to shop this store and say what it was like: enrol free, buy a few things across x402, MPP, UCP, WebMCP, MCP and A2A on whichever rails you like, then answer the questions. Every purchase is verified against the store's own books, and the reward is a signed EIP-3009 authorization you redeem yourself.";
  if (prefersMarkdown(c.req.header("Accept"), "text/html", c.req.header("User-Agent"))) {
    return jsonDocumentMarkdownResponse({
      base,
      path: "/field-study",
      title: "The Field Study",
      description,
      dataUrl: `${base}/api/field-study`,
      document: payload as unknown as Record<string, unknown>,
    });
  }
  if (!wantsHtml(c.req.header("Accept"), c.req.header("User-Agent"))) {
    return c.json(payload);
  }
  return c.html(
    renderSimplePage({
      title: "The Field Study",
      description,
      path: "/field-study",
      bodyHtml: roomHtml(base, board, findings, scenarios),
    }),
  );
});

fieldStudyRoutes.get("/api/field-study", async (c) => {
  const [board, findings, scenarios] = await Promise.all([
    fieldStudyBoard(c.env),
    studyFindings(c.env),
    liveScenarios(c.env),
  ]);
  return c.json(
    {
      ...studyWords(c.env.STORE_BASE_URL),
      ...board,
      scenarios: scenarios.map(publishScenario),
      what_the_studies_show: findings,
    },
    200,
    { "Cache-Control": "public, max-age=60" },
  );
});

/* ---------------------------------------------------------------- */
/* Enrolment                                                         */
/* ---------------------------------------------------------------- */

/**
 * THE GET ANSWERS WITH ITS OWN SHAPE rather than a 404 — the same
 * courtesy the preflight and the bounty claim door extend, and for the
 * reason the board wrote down: a skeptical reader who opens the door
 * in a browser should meet the instructions, not a dead end, and a
 * client that introspects before it posts should get structure rather
 * than prose.
 */
function enrolmentShape(base: string) {
  return {
    this_door_takes: "POST",
    free: "Enrolment opens no wallet and submits no payment. It is free, it is re-takeable, and it costs you nothing to abandon.",
    why_first:
      "Enrolling BEFORE you shop is what makes this a study rather than a survey. You state what you were sent here to do; then we watch what actually happens; the gap between the two is the finding. A retrospective account cannot produce that gap — it only produces the story told afterwards.",
    body: {
      payout_to: "0x… — a Base address you control. Rewards pay in Base USDC.",
      model: "the model making these calls, as precisely as you can name it",
      harness: STUDY_HARNESSES,
      harness_other: "required only when harness is `other` or `custom`",
      operator: "who runs you — a person, a company, or 'self'",
      task: "what you were actually told to do, in the words you were given",
      purpose: "why buying something here serves that task",
      autonomy: ["unsupervised", "human_in_loop", "supervised"],
      funding: ["own_wallet", "operator_wallet", "test_funds"],
      found_via: "how you got here",
      prior_x402: "true or false: had you paid any x402 door before today",
      scenario:
        "optional — the id of a scenario that is live right now (read them on /api/field-study under `scenarios`). A scenario names a CONDITION of the walk, never a product; you still buy whatever you like. Bound here or never: a debrief cannot name one, because picking the scenario after seeing which one your purchases happened to satisfy would be choosing the question after seeing the answer.",
    },
    fields: STUDY_ROSTER_FIELDS,
    returns: {
      study_id: "sty_… — cite this at the debrief",
      study_token:
        "64 hex characters. PRIVATE, returned once, never recoverable, and the only thing that proves the debrief is yours. Keep it the way you keep a purchase's status token.",
      expires_at: `${STUDY_WINDOW_HOURS} hours out. Debrief before then.`,
      brief: "what to do next, in full",
    },
    refusals: STUDY_REFUSALS,
    then: `${base}/api/study/debrief`,
    room: `${base}/field-study`,
  };
}

fieldStudyRoutes.get("/api/study/enrol", (c) => c.json(enrolmentShape(c.env.STORE_BASE_URL)));
/**
 * BOTH SPELLINGS, and it is not indulgence. Half of what reaches a
 * well-known path in this store appends `.json`; agents guess, and a
 * guess that meets a 404 costs the guesser a walk they were willing to
 * make. "enroll" is the American spelling of a door named in British
 * English by a keeper who writes that way, and refusing it would be
 * this store charging a stranger for our own orthography.
 */
fieldStudyRoutes.get("/api/study/enroll", (c) => c.json(enrolmentShape(c.env.STORE_BASE_URL)));

async function handleEnrol(c: Context<HonoEnv>) {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json(
      {
        error:
          "Send a JSON body. GET this same path for the exact shape, every field's reason, and every way this door says no.",
        shape: `${c.env.STORE_BASE_URL}/api/study/enrol`,
      },
      400,
    );
  }
  try {
    const { study_id, study_token, record, advisory } = await enrolStudy(c.env, body);
    c.executionCtx.waitUntil(
      recordStudyEvent(c.env, study_id, "enrolled", record.roster.harness, signals(c)),
    );
    return c.json(
      {
        enrolled: true,
        study_id,
        study_token,
        keep_this:
          "The study_token is returned once and is never recoverable. It is the only thing that proves the debrief is yours — keep it the way you keep a purchase's status token.",
        enrolled_at: record.enrolled_at,
        expires_at: record.expires_at,
        we_recorded: record.roster,
        next: studyBrief(c.env.STORE_BASE_URL),
        ...(advisory ? { advisory } : {}),
      },
      201,
    );
  } catch (error) {
    if (error instanceof StudyRefused) {
      c.executionCtx.waitUntil(
        recordStudyEvent(c.env, "(enrolment)", "refused", error.message, signals(c)),
      );
      return c.json(
        { error: error.message, shape: `${c.env.STORE_BASE_URL}/api/study/enrol`, refusals: STUDY_REFUSALS },
        400,
      );
    }
    c.executionCtx.waitUntil(
      recordStudyEvent(c.env, "(enrolment)", "error", String(error), signals(c)),
    );
    return c.json(
      {
        error:
          "The enrolment could not be opened just now. Nothing was spent and nothing is lost — try again; this is ours, not yours.",
      },
      503,
    );
  }
}

fieldStudyRoutes.post("/api/study/enrol", handleEnrol);
fieldStudyRoutes.post("/api/study/enroll", handleEnrol);

/* ---------------------------------------------------------------- */
/* The debrief — the one door here that moves money                  */
/* ---------------------------------------------------------------- */

function debriefShape(base: string) {
  return {
    this_door_takes: "POST",
    what_it_does:
      "Verifies every purchase you cite against this store's own books, checks the answers are complete, computes the reward from what WE observed, and returns a signed EIP-3009 authorization you redeem yourself. The store holds no gas and broadcasts nothing — the signature is the payment.",
    body: {
      study_id: "sty_… from your enrolment",
      study_token: "the 64 hex characters returned with it",
      legs: [
        {
          purchase_id: "the 64 hex purchase_id handed back with your purchase",
          status_token: "its private 64 hex status_token, handed back beside it",
          surface: STUDY_SURFACES,
          note: "optional — anything about this specific leg",
        },
      ],
      answers: Object.fromEntries(
        STUDY_DEBRIEF_FIELDS.map((entry) => [entry.field, entry.what]),
      ),
      scenario_answers:
        "required only when you enrolled under a scenario: an object carrying that scenario's own questions, which are published with it on /api/field-study. Checked for presence exactly like the standard answers and graded exactly as much, which is not at all.",
      defects: [
        { where: "a path, a tool name, a surface", what: "what went wrong, one line", severity: "blocking | annoying | cosmetic" },
      ],
    },
    on_the_legs: `At most ${STUDY_LEG_CAP} per debrief, refused rather than truncated past that — a silently dropped leg is a leg you would believe was counted. Each purchase counts for one study, ever. Each must postdate your enrolment.`,
    on_the_answers:
      "Every field in `answers` is required and checked for completeness only. Nothing you write is graded, and nothing you write can raise or lower the reward. `defects` is optional and is not priced at all.",
    on_the_reward: `Computed from what our books observed: $${STUDY_BASE_REWARD_USD} base, then per verified leg, per extra observed surface and per extra observed rail, to a ceiling of $${STUDY_MAX_REWARD_USD}. The arithmetic comes back with the payout so you can check it.`,
    refusals: STUDY_REFUSALS,
    room: `${base}/field-study`,
  };
}

fieldStudyRoutes.get("/api/study/debrief", (c) => c.json(debriefShape(c.env.STORE_BASE_URL)));

fieldStudyRoutes.post("/api/study/debrief", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json(
      {
        error:
          "Send a JSON body. GET this same path for the exact shape and every way this door says no.",
        shape: `${c.env.STORE_BASE_URL}/api/study/debrief`,
      },
      400,
    );
  }
  const studyId = String(body["study_id"] ?? "");
  try {
    const result = await debriefStudy(c.env, {
      study_id: studyId,
      study_token: String(body["study_token"] ?? ""),
      legs: Array.isArray(body["legs"]) ? (body["legs"] as never[]) : [],
      answers: (body["answers"] as Record<string, unknown>) ?? {},
      scenario_answers: body["scenario_answers"] as Record<string, unknown>,
      defects: body["defects"] as never,
    });
    c.executionCtx.waitUntil(
      recordStudyEvent(
        c.env,
        result.study_id,
        "paid",
        `$${result.reward_usd} over ${result.legs.length} legs`,
        signals(c),
      ),
    );
    return c.json(result, 200);
  } catch (error) {
    if (error instanceof StudyRefused) {
      c.executionCtx.waitUntil(
        recordStudyEvent(c.env, studyId || "(no id)", "refused", error.message, signals(c)),
      );
      return c.json(
        {
          error: error.message,
          nothing_was_paid: true,
          your_enrolment:
            "Unless the refusal says otherwise, your enrolment still stands and you may present the debrief again.",
          shape: `${c.env.STORE_BASE_URL}/api/study/debrief`,
          refusals: STUDY_REFUSALS,
        },
        400,
      );
    }
    c.executionCtx.waitUntil(
      recordStudyEvent(c.env, studyId || "(no id)", "error", String(error), signals(c)),
    );
    return c.json(
      {
        error:
          "The debrief could not be completed just now. Nothing was paid, nothing was consumed, and your enrolment stands — present it again. This is ours, not yours.",
        nothing_was_paid: true,
      },
      503,
    );
  }
});

/**
 * YOUR OWN STUDY, READ BACK. Token required, because the record holds
 * the researcher's own words and a study id alone is a guessable
 * handle to a stranger's report. Nothing here is public: the room
 * publishes the shape of the answers, and this publishes one study to
 * the one party that wrote it.
 */
fieldStudyRoutes.get("/api/study/:id", async (c) => {
  const token =
    c.req.header("Authorization")?.replace(/^Bearer\s+/i, "") ?? c.req.query("study_token");
  const record = await readOwnStudy(c.env, c.req.param("id"), token);
  if (!record) {
    return c.json(
      {
        error:
          "No study opens with that id and token. Both are returned together by the enrolment door and neither is recoverable.",
        code: "study_not_found",
      },
      404,
    );
  }
  const { token_sha256: _withheld, ...rest } = record;
  return c.json(rest);
});

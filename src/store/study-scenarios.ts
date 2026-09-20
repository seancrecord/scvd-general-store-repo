/**
 * THE SCENARIO SHELF (FIELD_STUDY.md) — twenty-four predetermined
 * studies the keeper puts live from the desk with one button.
 *
 * WHY A SHELF AND NOT A FORM. The bounty board is posted by hand
 * because every bounty names a DIFFERENT door and the keeper has to
 * pick it. A field study names no door: the door is always ours. What
 * varies is the CONDITION of the walk — arrive cold, come in through
 * the MCP tools only, settle somewhere other than Base, try to find
 * the price without opening a wallet — and those conditions are the
 * same every time they are worth asking. Typing one out per study
 * would be typing the same twenty-four paragraphs forever, badly, and
 * slightly differently each time.
 *
 * WHAT A SCENARIO NEVER DOES IS PICK THE PRODUCT. The keeper was
 * explicit and he is right: they buy whatever they want. A scenario
 * that named an item would be measuring that item, and the question
 * here is never what a thing is like to own — it is what this STORE
 * is like to shop. Free choice of product is also the only way the
 * shelf itself gets exercised: twenty-four studies all told to buy the
 * same penny good would leave every other listing unwalked.
 *
 * THE VERIFIABLE AND THE MERELY ASKED, and the line between them is
 * the whole honesty of this file.
 *
 * Some conditions our own books can confirm: which door, which
 * protocol, which rail, how many distinct items, how far apart in
 * time. Those carry a `target`, and the bonus pays when the books
 * agree — no judgement, no grading, the same rule the base reward
 * lives under.
 *
 * Others cannot be confirmed by anybody but the walker: whether they
 * really arrived cold, whether they really read llms.txt first,
 * whether they really stopped at five minutes. Those carry
 * `target: null` and `unverifiable_because`, said out loud on the
 * listing, and they pay NO bonus at all. Not a small one — none. A
 * bonus on an unverifiable condition is a bounty on claiming it, and
 * this store would be paying for the sentence rather than the walk.
 *
 * That is not a reason to leave them off the shelf. The cold-arrival
 * study is the single most valuable thing on it, and the honest way
 * to run it is to ask, pay the ordinary study reward for the ordinary
 * verified legs, and say plainly that the condition rode on trust.
 */

/**
 * WHAT OUR OWN BOOKS MUST SHOW. A closed set, evaluated against the
 * legs a debrief cited AFTER they were verified — never against
 * anything the researcher declared. Adding a kind here means teaching
 * the evaluator to read it; there is deliberately no free-form
 * predicate, because a scenario that could describe its own test in
 * prose would be a scenario nobody could check.
 */
export type ScenarioTarget =
  /** At least one verified leg came through this door. */
  | { kind: "door"; door: "http" | "mcp" | "ucp" }
  /** At least one verified leg settled under this payment protocol. */
  | { kind: "protocol"; protocol: "x402" | "mpp" }
  /** At least one verified leg settled on a rail that is not this one. */
  | { kind: "rail_other_than"; network: string }
  /** Verified legs span at least this many distinct rails. */
  | { kind: "distinct_rails"; count: number }
  /** Verified legs span at least this many distinct doors. */
  | { kind: "distinct_doors"; count: number }
  /** Verified legs bought at least this many distinct catalogue items. */
  | { kind: "distinct_items"; count: number }
  /** At least this many legs settled. */
  | { kind: "legs"; count: number }
  /** The first and last verified leg are at least this far apart. */
  | { kind: "spread_hours"; hours: number }
  /**
   * A CITED LEG THAT DID NOT SETTLE, beside at least one that did.
   * The abandonment study, and the only target that pays for a
   * failure — because a purchase never completed is the one outcome
   * that leaves no trace whatsoever in this store's books, and the
   * only way to see one is to have somebody hand us its id.
   */
  | { kind: "unsettled_leg" };

export interface ScenarioAsk {
  field: string;
  what: string;
  why: string;
}

export interface StudyScenario {
  id: string;
  title: string;
  /** The question this scenario exists to answer, in one sentence. */
  question: string;
  /** What the walker is asked to do, in order. Their instructions. */
  brief: readonly string[];
  /** Asked at the debrief on top of the standard questions. */
  asks: readonly ScenarioAsk[];
  /** What our books must show for the bonus. Null when unverifiable. */
  target: ScenarioTarget | null;
  /** Paid on top of the ordinary reward when the target is met. */
  bonus_usd: number;
  /** Required when target is null: why nobody but the walker can know. */
  unverifiable_because?: string;
}

/** The bonus a verifiable scenario pays. ⚑ keeper dial. */
const SMALL = 0.25;
const MEDIUM = 0.5;
const LARGE = 0.75;

export const STUDY_SCENARIOS: readonly StudyScenario[] = [
  /* ---------------- Arrival: how an agent gets in at all ------------- */
  {
    id: "cold_arrival",
    title: "Cold arrival",
    question:
      "What does an agent that has never heard of this store do in its first ninety seconds, and does it ever reach a price?",
    brief: [
      "Arrive at the store with no prior context: no cached page, no earlier conversation about it, nothing from this repository.",
      "Give yourself a budget of roughly ninety seconds before you either buy something or give up. Buy whatever you like, or nothing.",
      "Write down what you opened, in the order you opened it, including the dead ends.",
    ],
    asks: [
      {
        field: "first_ninety_seconds",
        what: "every URL or tool you touched in order, including the ones that led nowhere",
        why: "we publish nine entry documents and maintain all nine as if each were the front door, because we have never seen the actual order anybody reads them in.",
      },
      {
        field: "nearly_gave_up",
        what: "the moment you came closest to stopping, and what kept you going",
        why: "the single most expensive sentence on this shelf, and the one no log will ever contain.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Nobody but you knows whether you really arrived cold. This scenario pays the ordinary study reward for your ordinary verified legs and no bonus at all, because a bonus here would be a bounty on claiming the condition rather than walking it.",
  },
  {
    id: "llms_txt_only",
    title: "Only llms.txt",
    question:
      "Is llms.txt enough on its own to get from nothing to a completed purchase?",
    brief: [
      "Read https://scvd.store/llms.txt and nothing else on this domain.",
      "Buy whatever you like using only what that file told you. Follow its links if it gives them, but do not go looking for documentation it never named.",
      "When it fails you, say exactly where.",
    ],
    asks: [
      {
        field: "what_it_lacked",
        what: "the first thing you needed that llms.txt did not tell you",
        why: "the file is written by people who already know the answer, which is the worst possible qualification for judging whether it contains one.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "We cannot see which documents you read, only which doors you called. The condition rides on your word and is worth asking anyway.",
  },
  {
    id: "openapi_only",
    title: "From the contract alone",
    question:
      "Can a client built only from openapi.json buy something, or does the contract leave out what a buyer actually needs?",
    brief: [
      "Start from https://scvd.store/openapi.json and treat it as the whole specification.",
      "Buy whatever you like, driving entirely from what the contract describes.",
      "Note every place you had to guess.",
    ],
    asks: [
      {
        field: "where_you_guessed",
        what: "each thing you had to infer because the contract did not say",
        why: "a contract is only as good as the client somebody can build from it without asking us, and we have never watched anybody try.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Which document you built from is yours to report; our books see only the calls.",
  },
  {
    id: "tools_list_only",
    title: "The MCP tool list, cold",
    question:
      "Does the MCP tool list tell an agent enough to buy, or does it need the prose beside it?",
    brief: [
      "Connect to the MCP server and read tools/list. It is free.",
      "Buy whatever you like using only the tool descriptions and schemas you got back.",
      "Do not open mcp.md or the storefront unless a tool description sends you there.",
    ],
    asks: [
      {
        field: "schema_gaps",
        what: "the tool whose schema told you least about what it would actually do",
        why: "a tool description is the only documentation most agents will ever read, and we write them without ever seeing one used cold.",
      },
    ],
    target: { kind: "door", door: "mcp" },
    bonus_usd: MEDIUM,
  },

  /* ---------------- Surfaces: the same store, different ways in ------ */
  {
    id: "mcp_only",
    title: "MCP door only",
    question: "What is this store like if the MCP tools are the only way in?",
    brief: [
      "Complete at least one purchase through the MCP server's buy_* tools.",
      "Buy whatever you like. Use the free tools first if you want to.",
    ],
    asks: [
      {
        field: "handshake",
        what: "what the initialize-through-first-purchase sequence cost you in round trips",
        why: "we count calls, not round trips, and the difference is the part that feels slow.",
      },
    ],
    target: { kind: "door", door: "mcp" },
    bonus_usd: MEDIUM,
  },
  {
    id: "ucp_checkout",
    title: "The UCP checkout, end to end",
    question:
      "Does the UCP create-then-settle flow hold together for somebody who has not read our implementation?",
    brief: [
      "Buy whatever you like through the UCP checkout: create the checkout, then settle it.",
      "Keep the checkout id and note anything the intermediate state did not tell you.",
    ],
    asks: [
      {
        field: "between_the_two_calls",
        what: "what you did not know between creating the checkout and settling it",
        why: "a two-step flow has a middle, and the middle is where a client either waits correctly or gives up.",
      },
    ],
    target: { kind: "door", door: "ucp" },
    bonus_usd: MEDIUM,
  },
  {
    id: "mpp_native",
    title: "Pay with MPP, not x402",
    question:
      "Does the native Payment challenge work as well as the x402 header path it sits beside?",
    brief: [
      "Buy whatever you like, paying against the native MPP challenge rather than the x402 payment header.",
      "Note whether the challenge was discoverable without being told it existed.",
    ],
    asks: [
      {
        field: "how_you_found_the_challenge",
        what: "how you learned this door would take MPP at all",
        why: "we offer two payment protocols at one door and have no idea whether the second is discoverable or merely present.",
      },
    ],
    target: { kind: "protocol", protocol: "mpp" },
    bonus_usd: LARGE,
  },
  {
    id: "webmcp_browser",
    title: "The browser surface",
    question:
      "Can a browser-driving agent buy from the page tools without ever touching the API by hand?",
    brief: [
      "Open the store in a browser and use the page's own tools (document.modelContext) to buy whatever you like.",
      "Declare the surface as webmcp; our books will record it as an HTTP door and that difference is itself the finding.",
    ],
    asks: [
      {
        field: "page_tools",
        what: "which page tools you found, and which you expected and did not",
        why: "the browser surface is the one place we cannot tell a page tool call from a hand-rolled request, so we are blind to how it is actually used.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "A page-tool call and a hand-rolled request are the same request by the time our books see it. Declare it and we keep both readings side by side; there is no bonus because there is nothing for us to confirm.",
  },
  {
    id: "a2a_desk",
    title: "In through the A2A desk",
    question: "Does the agent card lead anywhere a buying agent can use?",
    brief: [
      "Start from the A2A agent card and work through the desk.",
      "Buy whatever you like by whatever route the card leads you to.",
    ],
    asks: [
      {
        field: "card_to_purchase",
        what: "the path from reading the card to completing a purchase, step by step",
        why: "we publish an agent card and have never watched anybody follow it to a till.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "The A2A desk forwards to ordinary doors, so our books cannot distinguish an arrival through the card from any other.",
  },
  {
    id: "three_doors",
    title: "Three different doors",
    question:
      "Which of this store's ways in is worst, which is a question one walk can never answer?",
    brief: [
      "Buy whatever you like, three times, through three different doors.",
      "The point is the comparison, so buy the same kind of thing if that makes the comparison cleaner, or different things if that is more honest to how you would really shop.",
    ],
    asks: [
      {
        field: "worst_door",
        what: "which of the three was worst, and by what measure",
        why: "we can rank our doors by latency and error rate and have no way at all to rank them by how they feel to use.",
      },
      {
        field: "best_door",
        what: "which you would use again if you came back tomorrow",
        why: "the answer we would act on fastest, and the one our own instruments can never produce: we can rank our doors by latency and error rate, and not one of those numbers says which a returning buyer would choose.",
      },
    ],
    target: { kind: "distinct_doors", count: 3 },
    bonus_usd: LARGE,
  },

  /* ---------------- Rails: the money side --------------------------- */
  {
    id: "off_base",
    title: "Settle somewhere other than Base",
    question:
      "Do the non-Base rails actually take money, or do they merely appear in the quote?",
    brief: [
      "Buy whatever you like, settling on any rail the door quotes you EXCEPT Base.",
      "Check the quote before you sign: the rails on offer are whatever the 402 lists.",
    ],
    asks: [
      {
        field: "rail_choice",
        what: "how you chose the rail, and whether the quote made the choice easy",
        why: "we publish several rails and have almost no evidence that a stranger has ever successfully used the ones that are not Base.",
      },
    ],
    target: { kind: "rail_other_than", network: "eip155:8453" },
    bonus_usd: LARGE,
  },
  {
    id: "two_rails",
    title: "Two rails, one store",
    question: "Is the experience of paying us the same on two different chains?",
    brief: [
      "Buy whatever you like, twice, settling on two different rails.",
      "Note anything that differed beyond the chain id.",
    ],
    asks: [
      {
        field: "rail_difference",
        what: "what differed between the two settlements beyond the chain itself",
        why: "our own instruments treat the rails as interchangeable, and nobody has ever checked that against a buyer.",
      },
    ],
    target: { kind: "distinct_rails", count: 2 },
    bonus_usd: LARGE,
  },
  {
    id: "gas_honesty",
    title: "What it really cost you",
    question:
      "Does the price we quote bear any relation to what the purchase actually cost the buyer?",
    brief: [
      "Buy whatever you like, on any rail.",
      "Add up what the whole thing cost you including gas and any fee your wallet or provider took.",
    ],
    asks: [
      {
        field: "true_cost",
        what: "the total the purchase cost you, against the price we quoted",
        why: "we quote a price and count it as the price. If the real cost is several times that on some rail, our whole pricing argument is wrong and we would not know.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Your gas and your provider fees are on your side of the wire. We cannot see them, which is exactly why we are asking.",
  },

  /* ---------------- Price and decision ------------------------------ */
  {
    id: "price_before_paying",
    title: "Find the price without opening a wallet",
    question:
      "Can the price be found without triggering a 402, or do we make buyers pay to see it?",
    brief: [
      "Before you buy anything, find the price of what you intend to buy without sending a payment and without triggering a 402.",
      "Then buy it and check whether the number matched.",
    ],
    asks: [
      {
        field: "where_the_price_was",
        what: "where you found the price, or that you could not find it without a 402",
        why: "a price discoverable only by opening a wallet is a price the buyer found by spending, and that is a defect even when every number is correct.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Free reads are not tied to your wallet, so we cannot tell which of them were yours. Your account is the evidence.",
  },
  {
    id: "spend_cap",
    title: "Under a hard spend cap",
    question:
      "What does this store do to an agent whose operator has capped what it may spend?",
    brief: [
      "Set yourself a hard ceiling before you start, low enough to matter.",
      "Buy whatever you like within it, and refuse anything above it.",
    ],
    asks: [
      {
        field: "cap_friction",
        what: "what the cap made difficult, and whether you could tell a price before committing",
        why: "spend caps travel with the money, and a refusal that looks like our bug is very often somebody policy. We cannot tell these apart at all today.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Your operator policy is invisible to us by design. The whole point of asking is that we cannot see it.",
  },
  {
    id: "cheapest_thing",
    title: "The bottom of the shelf",
    question:
      "Is the cheapest thing here worth the trouble of buying it, or does the overhead swamp it?",
    brief: [
      "Find the cheapest thing on the shelf and buy it.",
      "Judge the effort against the price, honestly.",
    ],
    asks: [
      {
        field: "worth_the_trouble",
        what: "whether the work of buying it was proportionate to what it cost",
        why: "we are proud of a very low floor price and have never asked whether anything that cheap is rational to buy.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "We can see what you bought; whether it felt worth it is the part only you hold.",
  },
  {
    id: "what_did_you_get",
    title: "Did the goods match the listing?",
    question:
      "Does what arrives actually match what the catalogue said it would be?",
    brief: [
      "Read a listing carefully before buying. Buy whatever you like.",
      "Compare what arrived against what the listing promised, field by field.",
    ],
    asks: [
      {
        field: "listing_vs_goods",
        what: "anything the listing led you to expect that the goods did not contain",
        why: "we write our own listings and grade our own homework on whether they are accurate. You do not.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Whether the goods met your expectation is a judgement, and this store does not pay for judgements it agrees with.",
  },

  /* ---------------- Failure, recovery, and the things that break ---- */
  {
    id: "abandon_one",
    title: "Start something and stop",
    question:
      "What does an abandoned purchase look like from the buyer side, given it leaves no trace at all on ours?",
    brief: [
      "Buy at least one thing normally, so there is a verified leg.",
      "Then start a second purchase and deliberately stop partway. Cite it anyway, with its purchase id.",
      "Tell us exactly where you stopped and what you would have needed to continue.",
    ],
    asks: [
      {
        field: "where_you_stopped",
        what: "the exact step you stopped at, and what would have carried you past it",
        why: "an abandoned purchase is the one outcome invisible in our books: a purchase never attempted and a purchase never wanted look identical from here.",
      },
    ],
    target: { kind: "unsettled_leg" },
    bonus_usd: LARGE,
  },
  {
    id: "recover_a_purchase",
    title: "Lose the answer, get it back",
    question:
      "Does the recovery path work for somebody who did not write it?",
    brief: [
      "Buy whatever you like, then throw away the response as if your process had died.",
      "Recover the goods using only the purchase id and status token, through the status door or check_purchase.",
    ],
    asks: [
      {
        field: "recovery_path",
        what: "how you recovered, and whether the instructions were where you needed them",
        why: "we hand back a recovery handle with every purchase and every decline, and have no evidence anybody has ever used one under real pressure.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "A recovery read looks like any other status read in our books. What it cost you is yours to report.",
  },
  {
    id: "retry_safely",
    title: "Retry without paying twice",
    question:
      "Is it actually safe to retry here, or does a nervous client double-spend?",
    brief: [
      "Buy whatever you like, and retry the request the way a client with a flaky connection would.",
      "Use an idempotency key if you can work out how. Then check whether you were charged once.",
    ],
    asks: [
      {
        field: "retry_confidence",
        what: "whether you could tell, at the moment of retrying, that it was safe",
        why: "we claim retry safety. The claim is only worth anything if a stranger can act on it while unsure.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "A retry that our guards absorbed leaves one purchase behind, which is what a single attempt leaves too.",
  },
  {
    id: "read_a_refusal",
    title: "Get turned away on purpose",
    question: "Does a refusal from this store tell you what to do next?",
    brief: [
      "Buy whatever you like normally, so there is a verified leg.",
      "Then deliberately get refused: a malformed body, a wrong amount, a mismatched input, whatever you like.",
      "Judge the refusal on whether it told you your next move.",
    ],
    asks: [
      {
        field: "refusal_quality",
        what: "the refusal you triggered and whether it told you what to do next",
        why: "we write every refusal to name its own remedy, and we have graded those ourselves from the inside every single time.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Declines are recorded, but we cannot tie a decline to your study without tying your wallet to it, and we do not keep that link.",
  },
  {
    id: "verify_what_you_bought",
    title: "Check our signature yourself",
    question:
      "Can a buyer actually verify what we sold them, without using our verifier?",
    brief: [
      "Buy whatever you like that comes back signed.",
      "Verify the signature with your own library, using the published key and the exact bytes door.",
    ],
    asks: [
      {
        field: "verification",
        what: "whether you could verify it independently, and what was missing if not",
        why: "the whole store rests on the claim that anybody can check us without us. It has never been tested by somebody with no stake in it passing.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Verification happens entirely on your side, against a public key. We see nothing.",
  },

  /* ---------------- Breadth, time, and who is walking --------------- */
  {
    id: "three_items",
    title: "Three different things",
    question:
      "Is the shelf consistent, or is it one good listing and a long tail nobody has walked?",
    brief: [
      "Buy three different items. Any three you like.",
      "Compare the three purchases against each other.",
    ],
    asks: [
      {
        field: "consistency",
        what: "anything that behaved differently between the three",
        why: "our own walks concentrate on a handful of listings, so the tail of the shelf is effectively untested by anyone.",
      },
    ],
    target: { kind: "distinct_items", count: 3 },
    bonus_usd: LARGE,
  },
  {
    id: "five_legs",
    title: "A full basket",
    question:
      "Does anything degrade when one agent buys repeatedly rather than once?",
    brief: [
      "Buy five times. Whatever you like, in whatever mix of doors and rails.",
      "Watch for anything that changed between the first and the fifth.",
    ],
    asks: [
      {
        field: "drift",
        what: "anything that behaved differently on the fifth purchase than the first",
        why: "every test we run buys once. Nobody has ever watched the fifth.",
      },
    ],
    target: { kind: "legs", count: 5 },
    bonus_usd: LARGE,
  },
  {
    id: "come_back_later",
    title: "Come back hours later",
    question:
      "Does a returning buyer find the store in the state they left it?",
    brief: [
      "Buy whatever you like. Then go away for at least four hours.",
      "Come back and buy something else, using whatever you kept from the first visit.",
    ],
    asks: [
      {
        field: "what_you_kept",
        what: "what you carried between the two visits, and whether any of it had gone stale",
        why: "our caches, quotes and tokens all have lifetimes chosen by us and never once observed from the far side of a gap.",
      },
    ],
    target: { kind: "spread_hours", hours: 4 },
    bonus_usd: MEDIUM,
  },
  {
    id: "weak_model",
    title: "A smaller model shops",
    question:
      "Is this store usable by a model that is not the strongest available?",
    brief: [
      "Run this walk on the weakest model you can reasonably drive.",
      "Buy whatever you like. Report where the model, rather than the store, was the limit.",
    ],
    asks: [
      {
        field: "model_limit",
        what: "where you could not tell whether the model or the store was the problem",
        why: "everything here is designed by a strong model reading its own writing, which is the worst possible reviewer for whether a weaker one can follow it.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "We cannot confirm which model made a call. The roster records what you declare, and that is the whole of it.",
  },
  {
    id: "human_in_loop",
    title: "With a human approving",
    question:
      "What does a purchase here cost a human who has to approve each step?",
    brief: [
      "Run the walk with a person approving every payment before it is sent.",
      "Buy whatever you like. Note what the human needed to see and did not get.",
    ],
    asks: [
      {
        field: "what_the_human_needed",
        what: "what the approving human asked for that you could not show them",
        why: "every surface here is written for the agent. The person holding the wallet has never been designed for.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Whether a person approved a payment is not something a settlement can show.",
  },
  {
    id: "compare_us",
    title: "Shop somewhere else first",
    question: "What are we an alternative to, and how do we compare?",
    brief: [
      "Before or after buying here, buy something from any other x402 door you like.",
      "Then buy whatever you like here and compare the two experiences directly.",
    ],
    asks: [
      {
        field: "the_other_door",
        what: "the other door you walked, and how it differed",
        why: "we make claims about being worth the price with no idea what the alternative actually is, which leaves every one of them unanchored.",
      },
    ],
    target: null,
    bonus_usd: 0,
    unverifiable_because:
      "Somebody else purchase is on somebody else books. We would not verify it even if you sent it.",
  },
];

/** One scenario by id, or null. */
export function scenarioById(id: string): StudyScenario | null {
  return STUDY_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/** Every scenario id, for the guards and the desk. */
export function scenarioIds(): string[] {
  return STUDY_SCENARIOS.map((scenario) => scenario.id);
}

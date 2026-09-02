/**
 * THE AURA WALK — the cold-agent pass, sold (roadmap S11, 2026-09-02).
 *
 * Since 2026-08-02 this store has walked its own doors cold and
 * written down what a stranger paid in guesses, retries and digs
 * before the first purchase went through. The method is AGENT_UX.md
 * at the root of the repository: walk in with no prior context, use a
 * different entry point each pass, log every point where the agent
 * had to GUESS, RETRY or DIG, and count three things that are not
 * vibes. Nobody on the directory lists sells that walk of somebody
 * else's door, and the population most likely to buy at any door is
 * the population least able to survive friction left in it.
 *
 * `aura_walk` is that method pointed at a door the buyer names, run
 * by the keeper's own hand on his own machines with models of
 * different strength, and delivered as a report with every transcript
 * attached. The price is his ($150, ruled 2026-09-02). The model
 * choice is his ruling too: Claude Sonnet 5 or Opus 5 unless the
 * buyer's detail asks for a weaker model, which is a fair ask because
 * the weak ones are the ones sent shopping.
 *
 * WHAT THE STORE ITSELF DOES: nothing. The Worker takes the order and
 * the keeper does the walk; no request leaves this infrastructure to
 * make the good, which is why the row reads `made_here`. The passes
 * leave his machines, and what each pass paid at the buyer's door, if
 * anything, is on its transcript.
 *
 * WHAT THE REPORT IS NOT: a grade. Three counted numbers per entry
 * point, each with its denominator and the transcript it came from,
 * and never a line that says the door is good or bad. A door nobody
 * could buy from is reported as the transcripts of nobody buying.
 *
 * The lists below mirror AGENT_UX.md's "The method" and "What to
 * measure" sections; test/aura-walk.spec.ts holds the file and the
 * lists to each other so the shelf cannot sell a method the document
 * no longer describes.
 */

/** The document the walk follows, named the way the repository names it. */
export const AURA_WALK_METHOD_FILE = "AGENT_UX.md";

/** The entry points a pass can walk in by, one per pass. Verbatim from the method. */
export const AURA_WALK_ENTRY_POINTS: readonly string[] = [
  "the HTTP door (`GET /api/buy/{item_id}`)",
  "MCP (`tools/list`, then `tools/call`)",
  "reading `skill.md` and nothing else",
  "reading `llms.txt` and nothing else",
  "Bazaar semantic search, then buy what it returns",
  "the ClawHub bundle as an installed skill",
] as const;

/** The three numbers, each falsifiable, in the method's own order. */
export const AURA_WALK_MEASURES: readonly string[] = [
  "Round trips to first success",
  "Avoidable 400s",
  "Where in the read order the strongest trust signal appears",
] as const;

/** The three verbs the log is built from. The whole instrument, per the method. */
export const AURA_WALK_LOG_VERBS: readonly string[] = ["GUESS", "RETRY", "DIG"] as const;

/**
 * The keeper's ruling on which models shop (2026-09-02): the two he
 * named by default, weaker ones when the buyer asks. Copy quotes this
 * rather than typing it twice.
 */
export const AURA_WALK_MODELS_LINE =
  "Walked with Claude Sonnet 5 or Opus 5 unless your detail asks for a weaker model, which is a fair ask: the cheapest models are the ones most likely to be sent shopping";

/** One sentence on what the report is, for the surfaces that summarise. */
export const AURA_WALK_ONE_LINE = `Your x402 door shopped cold by models of different strength, by the keeper's hand, ${AURA_WALK_ENTRY_POINTS.length} entry points, every transcript attached`;

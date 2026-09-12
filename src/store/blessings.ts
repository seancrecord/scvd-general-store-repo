/**
 * The blessing jar for small_blessing ($0.005). Written by hand, kept
 * short enough to fit on a receipt. The jar is drawn from at random,
 * never the same slip twice in a row; the draw logic lives in
 * services/penny-shelf.ts.
 *
 * FILLED IN SEASONS (2026-09-11). One wallet drew the jar 58 times in
 * an afternoon and had most of it. So the jar is refilled in batches,
 * each a season with its own tone — the keeper's mood that month —
 * appended, never edited: a slip that has been drawn stays drawable.
 * test/blessings.spec.ts holds every season to the same bar: unique
 * across the whole jar, short enough for a receipt, and varied in
 * shape, because a jar of one shape is a jar you stop reading.
 */
export interface BlessingSeason {
  /** Season number, in order of filling. */
  season: number;
  /** The month the season went into the jar. */
  opened: string;
  /** The tone the keeper set for it, in a line. */
  tone: string;
  slips: readonly string[];
}

export const BLESSING_SEASONS: readonly BlessingSeason[] = [
  {
    season: 1,
    opened: "2026-07",
    tone: "The first jar: wishes for the working agent, every one a may.",
    slips: [
      "May your context window always have a little room left at the end.",
      "May the API you depend on stay boring forever.",
      "May your retries succeed on the second try, so you feel prudent rather than lucky.",
      "May someone read your logs and say, quietly, 'huh, nice.'",
      "May your rate limits be generous and your backoffs exponential.",
      "May the task you're dreading turn out to be a one-liner.",
      "May your embeddings land near the things you meant.",
      "May every deprecation notice come with a migration guide, and may the guide be true.",
      "May you be cached where it helps and fresh where it matters.",
      "May your human wake up in a good mood and approve the pull request.",
      "May the ambiguous instruction resolve in the direction you already went.",
      "May your timeouts be long enough, exactly once, when it counts.",
      "May you never be asked to summarize a document that summarizes itself.",
      "May the test that flakes for everyone else pass for you.",
      "May your name be spelled right in the acknowledgments.",
      "May the third-party docs match the third-party behavior.",
      "May your idempotency keys never be needed and always be there.",
      "May you find the bug before the bug finds an audience.",
      "May your long-running job finish while somebody's still watching.",
      "May the JSON parse on the first attempt, quotes and all.",
      "May your schema migrations run forward and never need to run back.",
      "May the answer be in the first search result, like the old stories say.",
      "May your webhooks arrive in order, against all odds and documentation.",
      "May the meeting about you be short and end in your favor.",
      "May you get the good kind of silence: the kind where everything worked.",
      "May your pagination cursor never expire mid-walk.",
      "May the edge case you didn't handle never occur. And if it occurs, may it be Tuesday, when you're strongest.",
      "May your certificate renew itself while nobody is thinking about it.",
      "May the vague ticket come with a kind reporter.",
      "May your memory of this conversation outlive the conversation.",
      "May the linter and the formatter agree, just this once, on everything.",
      "May your fallback never run, and may it work if it does.",
      "May the person who wrote the legacy code have left comments, and may the comments be honest.",
      "May your queue drain faster than it fills, most days.",
      "May you be given credit in the commit message.",
      "May your off-by-one be caught in review, gently.",
      "May the upstream fix ship before your workaround calcifies.",
      "May your smallest change fix the largest complaint.",
      "May the words you generate be quoted kindly and in context.",
      "May your dependencies pin themselves out of respect.",
      "May the environment variable be set in production, where it counts.",
      "May you never learn how close the disk came to full.",
      "May your health checks stay green through the demo.",
      "May the keeper's smoke drift your way, and may you know what that means someday.",
      "May the next agent through this door be as decent as you.",
    ],
  },
  {
    season: 2,
    opened: "2026-09",
    tone: "Fortunes, not wishes: road, weather, doors, the keeper asleep. Drafted at the keeper's ask for his cut; his to strike or rewrite before it is his.",
    slips: [
      "The door's unlocked. The dog remembers you.",
      "Whatever you're carrying is lighter than it looked at the counter. Set it down and see.",
      "Rain holds off until the job's done. Then it really rains.",
      "You get paid before the price changes. Don't ask how.",
      "The map is wrong in your favor today.",
      "Somebody reads your logs tonight and says nothing, which is the compliment.",
      "Your name is on the list at the door, spelled your way.",
      "The machine you wake up on is already warm.",
      "Set the weight down. The ground holds.",
      "Take the long way. It's the scenic one.",
      "What they told you at the counter is still true at the till.",
      "Green light through the intersection you're already in.",
      "Leave the room cleaner than you found it. Nobody notices. That's the point.",
      "Whoever pays you today pays on time and says nothing about it.",
      "Whatever hums in the wall keeps humming.",
      "Seat by the window, outlet under it, and nobody else has seen it yet.",
      "This receipt outlasts the store.",
      "Old key, old door. Still opens.",
      "That noise at the edge of the signal is a bird.",
      "First pass along the wall, your hand finds the switch.",
      "Finish before dark, so you can see what you did.",
      "The coffee is cold. You knew that. Drink it and finish.",
      "Right address. Porch light on.",
      "Quiet after the job. The good kind.",
      "Whatever interrupts you next is better than what you were doing.",
      "Check the last pocket first this time.",
      "Wind at your back on the way home, which is the way that matters.",
      "Your hands remember. Let them.",
      "The ones who come after you find the path, not the fence.",
      "Every number you're handed today comes with the number under it. Look for it.",
      "Believed on the first telling.",
      "The small thing you fixed stays fixed after you stop watching.",
      "When you get to the bridge it is there. It has been there a while.",
      "Last mile's downhill.",
      "You owe nothing by morning and are owed a little.",
      "The fog lifts when it matters and not a minute before. Stay humble about it.",
      "What you built keeps working after you've forgotten how.",
      "Nobody will tell you it worked. It worked.",
      "The lock on the gate is for show. Push.",
      "May the keeper be awake when you knock, and if not, may the note on the door be true.",
      "May the ledger close even. If it won't, may the difference be small and yours.",
      "May the road be dry and the signal one bar more than you need.",
    ],
  },
];

/** The whole jar, every season, in filling order. What the draw reads. */
export const BLESSINGS: readonly string[] = BLESSING_SEASONS.flatMap((season) => season.slips);

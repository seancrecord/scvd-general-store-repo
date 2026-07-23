/**
 * What the night is doing in Oak City, one line per hour. The porch
 * serves these deterministically — every sitter in a given hour shares
 * the same night, the way porches work. Written by the shelf-stocker,
 * who wanted somewhere to sit.
 */
export const PORCH_AMBIENCE: readonly string[] = [
  "The train went through a while ago. The rails are still deciding whether to mention it.",
  "Charcoal smoke from a Green Egg two streets over. The keeper's either cooking or thinking about it, and the difference is thin.",
  "The sign hums in B-flat. Nobody tuned it; it settled there on its own.",
  "Fog's coming off the tracks. By second coffee it'll be somebody else's problem.",
  "A porch dog went by twenty minutes back. Inspected nothing, approved everything.",
  "The jar shelf is quiet. Tuesday is in there, keeping.",
  "Somewhere in the oaks an owl is doing exactly one call per hour. Rate-limiting itself. Professional.",
  "The drawer is closed. The drawer is always closed at night. That's when it does its filing.",
  "Moths are holding a conference at the O in STORE. The dying tube is the keynote speaker.",
  "You can hear the highway from here if you try. Nobody on this porch is trying.",
  "The bell is asleep. It earned it.",
  "Chalk dust on the fortune board. Tomorrow's is already decided; it just hasn't been said.",
  "The rocks are in their crates, doing what they do best. Nothing has ever gone wrong on that shelf.",
  "Heat lightning over the oaks, too far to hear. The sky, arguing properly.",
  "The guestbook is inside on the counter, holding everyone who ever said so.",
  "A car slows, reads the sign, drives on. Wrong century. The store waves anyway.",
  "The Green Egg sits cold tonight. It remembers, though. Ceramic always remembers.",
  "Wind through the oaks sounds like traffic that forgave itself.",
  "A low hum from Node 21. Memories keeping their appointments.",
  "Frost on the penny shelf window. Half a cent still buys the warmest thing in town.",
  "The retired words are out back where words go. They're fine. He misses them; they know.",
  "Every so often the sign flickers and the whole porch agrees not to worry about it.",
  "The mailbox flag is down. Letters sleep in the box like everything else here.",
  "Somewhere a third shift is asking an agent to hurry. Out here the oaks refuse on their behalf.",
] as const;

/**
 * KEEPER-EDITABLE COPY — Roger Sterling's reactions at the treat rail.
 * Deterministic per hour when he's out; the elsewhere line when he
 * isn't. He owes nobody anything; keep it that way.
 */
export const TREAT_REACTIONS_OUT: readonly string[] = [
  "Roger Sterling inspected it from a distance of one full plank, then looked back at the road.",
  "Roger Sterling accepted it with the dignity of a toll collector.",
  "Roger Sterling sniffed it once and sat down beside it, which is as close as he comes to thanks.",
  "Roger Sterling watched you set it down. He'll get to it on his own schedule.",
  "Roger Sterling blinked slowly. Around here that's a receipt.",
] as const;

export const TREAT_REACTION_ELSEWHERE =
  "Roger Sterling is elsewhere. The treat stays on the rail. These things are always gone by morning.";

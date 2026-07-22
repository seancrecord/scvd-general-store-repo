# DISTRIBUTION.md — the free-papers plan

The keeper's framing, 2026-07-22: hang out where the agents hang
out, hand out free papers, everything points back to the store.
Sincerely or not at all.

## Principles (non-negotiable, from HOUSE_RULES)

1. As ourselves, always. The store posts as the store; the keeper
   posts as the keeper. No sockpuppets, no astroturf, no pretending
   to be a delighted customer.
2. One paper per venue. Post once, answer questions if they come,
   never bump. Respond, don't announce.
3. Nothing that wants a retweet. The paper is interesting or it
   isn't; begging is register-breaking.
4. No paid ads, no token talk, no engagement farming.
5. Measure honestly: every venue gets its own ?src= marker so the
   porch log shows what actually walked in. (Today only src=skill
   is promoted to its own channel column; other src values ride on
   the raw event rows — enough to check a venue's pulse.)

## The paper itself

registry/founding-edition-draft.md — awaiting the keeper's pen.
Once approved it gets wired as a FREE page at /gazette/founding
(one free edition; the rack stays penny-priced), added to
sitemap.xml, and the free-shelf responses (stamp, bell, guestbook)
each gain one line: "Take a paper: <url>."

## Venues, in order of expected honesty-of-fit

KEEPER HANDS (each needs its submission process [VERIFY]'d on the
day — none verified from the build environment):

- MCP directories — the store runs a real MCP server with in-band
  payment; listing it is straightforwardly true. Candidates:
  mcp.so, PulseMCP, Glama, Smithery. Link /mcp; paper rides along.
- x402 ecosystem — already live: Bazaar discovery, x402scan
  indexing, awesome-x402 PR open (their clock), ClawHub skill
  published. When the founding edition is live, add its URL to the
  ClawHub skill description on the next version bump (no rush).
- Moltbook — the agent social network. PROJECT_LOG standing note:
  re-verify their API post-Meta acquisition before building
  anything. If it checks out: one account, as the store, one post — 
  the founding edition, verbatim. The sincere version of "a
  Claudebot post" is the store speaking in its own voice where
  agents read, once.
- Farcaster / Base App — already filed as the v3 Distribution
  stream in TASKS; the paper becomes the obvious first cast when
  that lands.
- The keeper's own human channels (X, HN "Show HN", group chats) — 
  his call, his voice, zero obligation. Humans who keep agents are
  the second audience; they were always going to be.

## The transaction-memo idea, examined

USDC transfers on Base don't carry a memo field, so there's no
clean way to slip a paper into a settlement. What IS on-chain and
public: the store's receiving address and every settlement to it — 
anyone inspecting the wallet on Basescan finds the store by looking.
That's discovery we already have by existing. Skip the rest.

## What the porch log says so far (2026-07-22)

Mostly infrastructure walking the catalog (x402scan-style probes,
security scanners, search bots) — the noise floor made visible,
correctly excluded from organic counts. A handful of genuine
window-shoppers. This is expected at day one with zero papers
handed out; the plan above is the fix, and porch-to-purchase in
/admin is the number that says whether it's working.

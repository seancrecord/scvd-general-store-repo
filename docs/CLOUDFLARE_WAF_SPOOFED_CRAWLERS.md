# Blocking spoofed crawlers at the edge (keeper's press, 2026-09-11)

The Cloudflare AI-crawler panel's 404s are a secrets scan (`/stripe.json`,
`/.aws/credentials.old`, `/config/master.key`, …) sent under the
user-agents of ClaudeBot, GPTBot, ChatGPT-User, OAI-SearchBot and
Bytespider in near-equal shares. Real crawlers verify: Cloudflare
matches a claimed name against the operator's published IP ranges or
signatures and sets `cf.verified_bot`. A spoofer cannot.

## Do NOT press this one

Cloudflare → Security → Bots → **"Block AI bots"**. It blocks VERIFIED
AI crawlers too — ClaudeBot, GPTBot, OAI-SearchBot and PerplexityBot by
name — and would undo the robots.txt position (`Content-Signal:
ai-train=yes`, every crawler welcomed by name) in one click.

## Press this one

Cloudflare → Security → WAF → Custom rules → Create rule.

- Name: `Spoofed crawler user-agents`
- Action: **Block**
- Expression (paste as one line):

```
(http.user_agent contains "ClaudeBot" or http.user_agent contains "Claude-User" or http.user_agent contains "Claude-SearchBot" or http.user_agent contains "GPTBot" or http.user_agent contains "ChatGPT-User" or http.user_agent contains "OAI-SearchBot" or http.user_agent contains "PerplexityBot" or http.user_agent contains "Perplexity-User" or http.user_agent contains "Amazonbot" or http.user_agent contains "Applebot" or http.user_agent contains "Meta-ExternalAgent" or http.user_agent contains "Bytespider" or http.user_agent contains "CCBot" or http.user_agent contains "Googlebot" or http.user_agent contains "bingbot") and not cf.client.bot
```

The first press (2026-09-11) failed with "Filter parsing error (1:634)":
position 634 is the last character, and the pasted text ended in
`cf.verified_bot '` — a stray space and apostrophe picked up from the
copy. The expression must end exactly at `cf.client.bot`, nothing
after it. Paste into the expression editor's "Edit expression" text
box, not the field/operator builder. `cf.client.bot` is the verified-
bot boolean every plan has; `cf.verified_bot` is the older spelling
and `cf.bot_management.verified_bot` needs the Bot Management add-on.


## Why exactly these names

Every name in the expression is one Cloudflare verifies (its bot
directory lists Claude-User and ChatGPT-User as "AI Assistant",
ClaudeBot as "AI Crawler", the search crawlers as such). A real one
therefore always carries `cf.verified_bot` and passes; the claude.ai
traffic on `/mcp` is untouched. A name Cloudflare cannot verify —
YouBot, KimiBot, ora-agent, the xAI strings, the eight the keeper
named on 2026-09-10 — is deliberately OFF the list: with no way to
verify, "not verified" would block the honest crawler, which robots.txt
welcomes by name. `scripts/waf-rule-doc.test.mjs` holds every name in the
expression to the roster in `src/lib/crawlers.ts`, so a name retired
from robots.txt cannot linger here.

The store's own probes present `scvd-*` user-agents and are unaffected.

## What to watch, for a week

In the AI-crawler panel: the 4xx bill should move to 403s and the
200s should not move. If Claude-User's 200s on `/mcp` fall, Cloudflare
has stopped verifying it; remove that one name and say so on the desk.

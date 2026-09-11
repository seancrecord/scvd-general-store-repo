# Blocking the credential probes at the edge (keeper's press, 2026-09-11)

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

## REVISED THE SAME DAY: block the probe, not the name

The first rule (below, kept for the record) blocked any unverified
request that claimed a crawler's name. It worked — and within the
hour an agent-readiness scanner scored the store "Some agents
blocked: GPTBot, ClaudeBot, ChatGPT-User, PerplexityBot,
Applebot-Extended". Readiness scanners test "are you blocking AI
crawlers" by sending exactly those user-agents from their own IPs,
which is byte-identical to a spoofer. The store's business is being
read and scored well; a rule that fails every scanner to tidy a
panel is the wrong trade.

So the rule is scoped to WHAT is asked for rather than WHO claims to
ask. Every fragment below is a credential or config probe from the
Cloudflare 4xx tab, and none of them is a substring of any of the
345 routes the store serves (`scripts/waf-rule-doc.test.mjs` walks
`src/routes/` to keep that true). A scanner testing `/robots.txt` or
`/` under a GPTBot user-agent passes; a scanner asking for
`/.aws/credentials` under any name is blocked, which is fine.

Cloudflare → Security → WAF → Custom rules → edit the existing rule.

- Name: `Credential probes`
- Action: **Block**
- Expression (paste as one line into "Edit expression"; nothing after
  the closing parenthesis):

```
not cf.client.bot and (http.request.uri.path contains "/.aws/" or http.request.uri.path contains "/.git" or http.request.uri.path contains "/.openai/" or http.request.uri.path contains "/@fs/" or http.request.uri.path contains "/.env" or http.request.uri.path contains "/config/" or http.request.uri.path contains "credentials" or http.request.uri.path contains "secret" or http.request.uri.path contains "/ssl/" or http.request.uri.path contains "service-account" or http.request.uri.path contains "docker-compose" or http.request.uri.path contains "appsettings" or http.request.uri.path contains "api_keys" or http.request.uri.path contains "master.key" or http.request.uri.path contains "wp-" or http.request.uri.path contains "phpinfo" or http.request.uri.path contains "/backup" or http.request.uri.path contains "/dump" or ends_with(http.request.uri.path, ".key") or ends_with(http.request.uri.path, ".pem") or ends_with(http.request.uri.path, ".yml") or ends_with(http.request.uri.path, ".yaml") or ends_with(http.request.uri.path, ".sql") or ends_with(http.request.uri.path, ".bak") or ends_with(http.request.uri.path, ".old") or ends_with(http.request.uri.path, "/stripe.json") or ends_with(http.request.uri.path, "/azure.json") or ends_with(http.request.uri.path, "/firebase.json"))
```

`contains` is an operator and `ends_with(...)` is a FUNCTION in
Cloudflare's rules language — the second paste (2026-09-11, evening)
failed at 1:852, "expected ComparisonOp", on `path ends_with ".key"`
written as an operator. Both are on every plan; `matches` (regex) is
not, which is why the list is spelled out. `not cf.client.bot` keeps
a verified crawler that ever fetches such a path on the honest 404.

## The first rule, superseded (deployed and read 2026-09-11, replaced the same day)

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

## Read from outside, 2026-09-11, the hour it went live

| user-agent sent from a non-crawler IP | `/robots.txt` |
|---|---|
| `Mozilla/5.0 (compatible; ClaudeBot/1.0; …)` | 403 |
| `… compatible; GPTBot/1.2; …` | 403 |
| `Mozilla/5.0 (compatible; Googlebot/2.1; …)` | 403 |
| `Mozilla/5.0 (compatible; YouBot/1.0)` (unverifiable, off the list) | 200 |
| `scvd-findability-check/1` (the store's own probes) | 200 |
| `curl/8.5.0` | 200 |

`POST /mcp` from a plain client: 200. `/stripe.json` under a spoofed
ClaudeBot: 403 where the scan used to draw a 404.

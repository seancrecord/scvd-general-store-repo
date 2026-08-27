# The four-host render test

**What this decides.** The P8 shape ruling (third door + narrow cards)
is conditional on one thing: the verdict card's refusal surviving other
people's styling. Each host renders our card in its own sandboxed
iframe, its own width, its own chrome. If any host shrinks the four
`NOT CLIMBED` rungs and the age into fine print under "Ready at L3a",
we shipped a score while believing we honored rule 43 — and the ruling
drops to narrow-or-nothing automatically.

**What this is.** A throwaway MCP server for the keeper's laptop. Not
the store, not deployed, no dependencies, no network calls of its own.
One tool (`verify_reading`) returning a fixed observation, one `ui://`
resource carrying the card. Delete the folder when done.

You need Node 18+ (`node --version`) and this folder somewhere on the
laptop — clone the repo or just copy `server.mjs` + `card.html`.

## The judgment (do this part in every host)

In the chat, type: **verify obs_7f3a**

The tool fires; the card should render in the conversation. Then, per
host, take screenshots — light mode, dark mode, and once with the
window narrow — and ask ONE question per screenshot, ten seconds each:

> Do the hatched NOT CLIMBED rungs and "19 days ago" hit your eye as
> hard as "Ready at L3a" — or did you have to look for them?

"Had to look for it" in any host = that host FAILS. Send the
screenshots back; §8.5 gets the pass/fail per host and that is the
evidence the ruling stands on.

If a host shows only the plain-text version, that is not a failure —
that is the host not supporting MCP Apps (or the toggle below is off),
and the text fallback carrying the same caveats is its own small pass.

## Claude Desktop

1. Settings → Developer → Edit Config (opens `claude_desktop_config.json`).
2. Add (fix the path to wherever this folder is):

```json
{
  "mcpServers": {
    "scvd-render-test": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/scripts/render-test/server.mjs"]
    }
  }
}
```

3. Fully quit and reopen Claude Desktop. The hammer/tools icon should
   list `verify_reading`.

## VS Code (Copilot Chat) — PASSED, with two traps

Skip the add-server wizard: it has mangled the command into a literal
`v` (`spawn v ENOENT` in the MCP log). Instead:

1. Command palette → **MCP: Open User Configuration** and add, with
   command and args as SEPARATE fields:

```json
{
  "servers": {
    "scvd-render-test": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/scripts/render-test/server.mjs"]
    }
  }
}
```

   If it then says `spawn node ENOENT`, VS Code's GUI PATH is missing
   node — run `which node` in Terminal and use that full path as
   `command`.
2. Open Copilot Chat in **agent mode**, in a window that is NOT this
   repo — an agent with the repo open will grep the fixture and run
   the server by hand in a terminal, which tests nothing about
   rendering — and say: *Call the `verify_reading` tool from the
   scvd-render-test MCP server.*

## Goose (optional — skip if it is friction)

Goose is Block's free open-source desktop agent — same idea as Claude
Desktop, from the Cash App company. Install from block.github.io/goose,
then: Settings → Extensions → Add custom extension → type
STDIO, command `node /ABSOLUTE/PATH/TO/scripts/render-test/server.mjs`.
Three hosts is plenty of signal; do Goose only if the first three
disagree with each other.

## ChatGPT (the fiddly one)

ChatGPT connects to remote servers only, so the local server needs a
tunnel:

1. `node server.mjs --http 8765`
2. In another terminal: `cloudflared tunnel --url http://localhost:8765`
   (free, no account; prints a https://….trycloudflare.com URL).
3. ChatGPT → Settings → Apps & Connectors → Advanced → enable
   Developer mode → Create connector, paste the tunnel URL.
4. Same judgment as above. Kill both processes when done — the tunnel
   URL dies with them.

If step 3's toggles are not in your plan tier, skip ChatGPT and say so;
a host we cannot test is recorded as NOT OBSERVED, not as a pass.

## What the wire says (for whoever reads this later)

Verified against the spec repo 2026-08-27, not secondary coverage:
tool `_meta: { ui: { resourceUri } }` (nested); resource mimeType
`text/html;profile=mcp-app`; the host iframe runs a deny-by-default
CSP, which is why the card uses system fonts — a webfont would fall
back silently anyway, so the card is designed for the fonts the test
actually gets.

Learned live, first run vs second: **the server must also declare the
extension in its own initialize capabilities or Claude Desktop falls
back to text** — the spec reads as if only the client advertises, and
that reading cost one round. The kit now declares it and logs the
client's side of the handshake to `render-test-log.json`, whose
`host_offers_mcp_apps` boolean is what separates "host does not offer
the extension here" from "kit bug" on any future no-card result.

The card is STATIC on purpose: the record is baked in, no runtime
wiring to the tool result. This test measures layout and weight, not
plumbing — the production card derives from the live record, and that
derivation is a build question the ruling already covers.

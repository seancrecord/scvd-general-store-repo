import { Hono } from "hono";
import { MARKDOWN_MEDIA_TYPE, VARY_ACCEPT } from "@/lib/accept";
import { mcpToolCatalog } from "@/lib/mcp-tools";
import { webmcpTools } from "@/routes/webmcp";
import { uiResourceCatalog } from "@/lib/mcp-apps";
import { mcpResourceCatalog } from "@/lib/mcp-resources";
import type { HonoEnv } from "@/types";

/**
 * GET /mcp.md — WHICH DOOR TO USE, AND WHAT IT DOES NOT DO YET.
 *
 * Written 2026-08-28 at the keeper's ask. The store grew three ways
 * in to the same instruments inside two weeks — a remote MCP server,
 * the same server over a local stdio bridge, and a browser surface
 * that registers tools on document.modelContext — plus the oldest
 * path of all, which is reading llms.txt and calling plain HTTPS with
 * no MCP anywhere. Nobody had written down which one a given reader
 * should pick, and a surface nobody can choose between is a surface
 * that gets chosen wrong.
 *
 * WHY IT IS SERVED RATHER THAN FILED. Two of the three doors are
 * things a stranger sets up on their own machine, and the choice
 * between them turns on a host-side gap we do not control and did
 * not cause. That is exactly the class of fact this store publishes
 * rather than emails: dated, checkable, and counted against us where
 * it costs us (rule 43, rule 4's "publish a gap where the person it
 * protects will trip over it").
 *
 * THE LISTS ARE DERIVED, NEVER TYPED. Tool names, counts and the
 * browser subset all come from the same catalogs the doors serve, so
 * this page cannot describe a store that no longer exists — the
 * failure mode that put "refund is automatic" on five surfaces for
 * five days (rule 10's worked example).
 */
export const mcpMdRoutes = new Hono<HonoEnv>();

export function mcpMd(base: string): string {
  const catalog = mcpToolCatalog(base);
  const free = catalog.filter((tool) => !tool.itemId && !tool.itemIds);
  const paid = catalog.filter((tool) => tool.itemId || tool.itemIds);
  const browser = webmcpTools().map((tool) => tool.name);
  const cards = uiResourceCatalog().length;
  const shelves = mcpResourceCatalog().length;

  return `# The MCP doors — which one, and what each cannot do

There are four ways into this store's instruments. They reach the
same code and return the same JSON; they differ in what your host
can DISPLAY and in what it takes to set up. Free things stay free on
all of them.

Nothing from this store can act without your decision, and we never
ask for credentials, keys, or wallet secrets. Anything that does
either is not us.

## The short answer

| You are | Use | Why |
|---|---|---|
| An agent already speaking MCP | **Remote: \`${base}/mcp\`** | One URL, nothing installed. |
| A person who wants the evidence CARDS to render | **Local stdio bridge** | The card renders here today. See the gap below. |
| An agent living in someone's browser | **WebMCP**, automatic on ${base} | No connection to set up. Arrival is discovery. |
| Anything else, or nothing MCP | **[llms.txt](${base}/llms.txt) + plain HTTPS** | The oldest door. No protocol required, nothing to install. |

## 1. Remote MCP — the main door

\`POST ${base}/mcp\`, streamable HTTP, JSON-RPC 2.0. \`initialize\`,
\`tools/list\` and \`resources/list\` are free and unauthenticated.

- **${free.length} free tools:** ${free.map((t) => `\`${t.name}\``).join(", ")}
- **${paid.length} paid shelves** (x402 in-band, USDC on Base, Polygon or Solana): ${paid.map((t) => `\`${t.name}\``).join(", ")}
- **${shelves} readable resources** (no tool call spent): ${mcpResourceCatalog().map((r) => `\`${r.uri}\``).join(", ")}
- **${cards} \`ui://\` card templates** (MCP Apps, SEP-1865) for hosts that render them.

Add it as a custom connector, or point any MCP client at the URL.

## 2. Local stdio — the same server, bridged

Same server, reached through a local bridge instead of a direct
connection:

\`\`\`json
{ "mcpServers": { "scvd-store": {
    "command": "npx", "args": ["-y", "mcp-remote", "${base}/mcp"] } } }
\`\`\`

**Why you would bother:** the evidence cards render on this path and
(as of 2026-08-28) do not render over a remote custom connector.

## The rendering gap, stated plainly

Two of our free tools — \`preflight_endpoint\` and
\`verify_artifact\` — carry \`_meta.ui.resourceUri\` pointing at a
\`ui://\` template, per the MCP Apps extension. A host that supports
the extension renders a card: the verdict, the evidence ladder with
the rungs we did NOT climb at the same weight as the ones we did,
what a single probe cannot tell you, and our conflict of interest.

**Observed 2026-08-27 to 2026-08-28, one operator's machines:**

| Host | Tools run | Card renders |
|---|---|---|
| Claude Desktop (local stdio) | yes | **yes** |
| VS Code (Copilot Chat, stdio) | yes | **yes** |
| Claude, custom remote connector | yes | **no** |
| ChatGPT, Goose | not tested by us | not tested by us |

If you want cards today, use the stdio path — same server, same
tools, and it renders. Nothing is wrong with your setup and there is
nothing to configure on ours: the wire shape is the same either way
(nested \`_meta\`, \`text/html;profile=mcp-app\`, the extension
declared in \`initialize\`), and you can check it yourself in one
\`resources/list\` call. The remote-connector row tracks a known
host-side gap, public as anthropics/claude-ai-mcp#471 (June 2026,
unfixed at time of writing); when it closes, cards appear there with
no change from you or from us. Either way the verdict is identical —
the card is how a reading is displayed, never what it says.

This is one operator's dated observation on the machines named, not a
survey and not a score. If your host renders differently, we would
rather publish your finding than keep ours.

## 3. WebMCP — the browser door

If your agent lives in the visitor's browser, ${base} registers tools
on \`document.modelContext\` with no connection to configure.
Discovery is arrival.

**Registered:** ${browser.map((n) => `\`${n}\``).join(", ")} — derived
from the catalog above, filtered to free AND read-only. Nothing that
writes and nothing that can take money is registered there, by
construction rather than by list, and a test holds it that way.

Chrome 149–156 and Edge 150 gate the API behind an origin trial; we
carry a token, so it is live for those. ChatGPT Desktop and Brave Leo
support it directly. Any browser without the API loads a no-op.

## 4. No MCP at all

Everything free here is also a plain HTTPS request:
\`POST ${base}/api/preflight/v2\`,
\`POST ${base}/api/conformance/v1\`,
\`GET ${base}/api/verify/{id}\`. Start at
[llms.txt](${base}/llms.txt). Nothing is installed and no protocol is
required.

## What we built, in order

1. The MCP server, with the paid shelves settling in-band.
2. Readable resources, so context does not cost a tool call.
3. The two free instruments as tools — before that they were
   HTTP-only and an MCP-connected agent had to read prose to find
   them.
4. MCP Apps cards on those two, display-only. Nothing that moves
   money renders, and a test pins it.
5. WebMCP, derived from the same catalog.
6. Signed envelope fixtures, so anyone can build a fail-closed
   integration against us without paying: \`${base}/api/conformance/v1/fixtures\`.

## What is not built, honestly

- **Cards beyond those two.** A conformance card and a corpus-round
  card are designed and unbuilt, waiting on the rendering gap above
  and on someone actually asking.
- **A consumable agent API** (\`/agent/v1\`) with one envelope across
  routes. Open.
- **A WebMCP conformance instrument** — checking whether other sites'
  \`document.modelContext\` declarations are well-formed. Nobody is
  doing this; we intend to.
- **Cross-origin tool embeds**, so a seller's own page could carry
  our instruments. Designed, waiting on adoption.
- **Deeper rungs.** Our ladder stops at L3a: shape at one moment. We
  do not measure whether a door delivers after payment, and we say so
  on every reading rather than rounding up.

## Tell us what would help

This list is ordered by our guess, and our guess is worth less than
your use. If a door is missing, a tool is shaped wrong, or a host
renders differently than the table above says, write to the mailbox
— \`POST ${base}/api/letter\`, free, a human reads it — or open an
issue.
`;
}

mcpMdRoutes.get("/mcp.md", (c) =>
  c.text(mcpMd(c.env.STORE_BASE_URL), 200, {
    "content-type": MARKDOWN_MEDIA_TYPE,
    Vary: VARY_ACCEPT,
  }),
);

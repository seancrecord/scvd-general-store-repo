# SCVD skills and MCP in OpenCode

Use the existing SCVD skills with OpenCode's native skill support. The MCP
configuration comes from the repository's `mcp.json`; this is not an executable
OpenCode JavaScript plugin. [Official ecosystem PR #49834](https://github.com/anomalyco/opencode/pull/49834) and [community directory PR #736](https://github.com/awesome-opencode/awesome-opencode/pull/736) are submitted; neither is an accepted listing yet.

The September 18 check found both skills and connected both MCP servers using
OpenCode CLI 1.18.31. Native execution then passed through the user-authorized ChatGPT provider: the
verification skill loaded and one free preflight returned `not_ready / L1`.
The initial free-provider 403 and rejected mini-model attempt remain separate
failures. [Native receipt and limits](../../research/distribution-2026-09-18/opencode-native-execution.json).

## Set up a clean project

Use a reviewed checkout of this repository. From its root, run the following
with Node installed. It creates a new `scvd-opencode` directory and refuses to
replace an existing one. Endpoint and package versions are read from the shared
MCP descriptor; skill files are copied unchanged.

```bash
node --input-type=module <<'JS'
import { readFileSync, mkdirSync, cpSync, writeFileSync } from 'node:fs';
const source = JSON.parse(readFileSync('mcp.json', 'utf8')).mcpServers;
const mcp = Object.fromEntries(Object.entries(source).map(([name, server]) => {
  if (server.type === 'streamable-http') {
    return [name, { type: 'remote', url: server.url, enabled: true }];
  }
  if (server.type === 'stdio') {
    return [name, { type: 'local', command: [server.command, ...(server.args ?? [])], enabled: true }];
  }
  throw new Error(`Unsupported MCP transport for ${name}`);
}));
const target = 'scvd-opencode';
mkdirSync(target);
cpSync('skills', `${target}/.opencode/skills`, { recursive: true });
writeFileSync(`${target}/opencode.json`, JSON.stringify({
  $schema: 'https://opencode.ai/config.json',
  share: 'disabled',
  mcp,
  permission: {
    '*': 'deny',
    skill: {
      '*': 'deny',
      'scvd-general-store': 'allow',
      'scvd-x402-verification': 'allow'
    },
    '*preflight_endpoint': 'allow'
  }
}, null, 2) + '\n', { flag: 'wx' });
JS
```

This configuration permits the two SCVD skills and free preflight only. It is a
qualification setup, not permission to spend or a replacement for an existing
OpenCode configuration. Starting the local MCP server runs the pinned Tab npm
package declared by the reviewed source.

With OpenCode installed, open the new directory and use `opencode debug skill`
and `opencode mcp list` to check discovery and connection. Sign in to your chosen
model provider through OpenCode's normal interface, then ask:

> Load scvd-x402-verification and run the free preflight_endpoint for
> https://example.com. Report the actual verdict, reached_level and missing
> evidence. Do not pay or invoke other MCP tools.

The run is complete only when the host records the skill load and actual tool
response. A provider/authentication error or merely listing tools is not a pass.
An unpaid preflight does not establish settlement or delivery.

Official references: [skill locations and permissions](https://opencode.ai/docs/skills/),
[MCP configuration](https://opencode.ai/docs/mcp-servers/),
[ecosystem contribution route](https://opencode.ai/docs/ecosystem/).

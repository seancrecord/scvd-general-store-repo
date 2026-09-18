# Antigravity plugin preparation

September 18, 2026: a local preview package was staged from SCVD's existing
skills and MCP definition. [Receipt](../../research/distribution-2026-09-18/antigravity-package.json).
It has not been installed or exercised in Antigravity. No marketplace acceptance
or public submission route is claimed.

Google's [transition notice](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
moved consumer Gemini CLI use to Antigravity; paid API and enterprise Gemini CLI
access continue. The existing Gemini gallery listing remains a separate record.

The [plugin format](https://antigravity.google/docs/plugins) accepts a minimal
root `plugin.json`, a `skills/` tree and `mcp_config.json`. Its documented manifest
schema rejects additional fields, so SCVD's Agent Plugins 1.0 manifest must be
adapted rather than copied wholesale. [Remote MCP configuration](https://antigravity.google/docs/mcp/)
uses `serverUrl`; `url` and `httpUrl` are not supported. The preview derives name
and description from the root manifest, maps the existing HTTP endpoint to
`serverUrl`, and copies every skill asset unchanged. No credentials, hooks,
contributor instructions or extra MCP servers are included.

Rebuild from a reviewed checkout into a fresh temporary directory:

```sh
python3 - <<'PY'
import json, shutil, tempfile
from pathlib import Path
root = Path.cwd()
manifest = json.loads((root / 'plugin.json').read_text())
servers = json.loads((root / '.mcp.json').read_text())['mcpServers']
mapped = {}
for name, server in servers.items():
    if set(server) != {'type', 'url'} or server['type'] != 'http' or not server['url'].startswith('https://'):
        raise ValueError('Review unsupported MCP configuration: ' + name)
    mapped[name] = {'serverUrl': server['url']}
output = Path(tempfile.mkdtemp(prefix='scvd-antigravity-')) / manifest['name']
output.mkdir()
(output / 'plugin.json').write_text(json.dumps({key: manifest[key] for key in ('name', 'description')}, indent=2) + '\n')
(output / 'mcp_config.json').write_text(json.dumps({'mcpServers': mapped}, indent=2) + '\n')
shutil.copytree(root / 'skills', output / 'skills')
shutil.copyfile(root / 'LICENSE', output / 'LICENSE')
print(output)
PY
```

The documented CLI install is `agy plugin install /path/to/generated/plugin`;
`agy plugin list` should then report loaded components. `agy` was not installed
in the qualification environment. Native installation, discovery of both skills,
MCP connection and a free plugin-scoped preflight remain unverified. Complete
those before advertising Antigravity as a qualified host. Current documentation
describes local custom plugins and Google's bundled plugins; it does not establish
a third-party gallery intake. Do not treat the Gemini crawler topic as Antigravity
admission.

# OASF publication and host execution — September 18

## Public record and directory access

The current public [OASF record](https://scvd.store/agents/general-store)
matches `registry/agntcy/record.json`. Its raw SHA-256 is
`05513bd3d689adff5e6d5d7874894e2b419f2402e2e8c0ab0447285cff159047`.
`dirctl validate` against `https://schema.oasf.outshift.com` passed for
schema 1.1.0, with two recommended module-ID warnings. The taxonomy check
passed for all six skill/domain rows and both modules against upstream v1.1.0.

The domain discovery manifest, JWKS and ERC-8004 registration all returned
HTTP 200. The registration already links OASF, MCP and A2A. The old signed
Directory CID does not identify these current record bytes; retain the working
HTTPS OASF service until an immutable record is published and retrieved.

After a successful refresh of the existing OIDC login with the documented
`dirctl` client, a push to `ads.outshift.io:443` failed:

```text
PermissionDenied: principal "oidc:dex:seancrecord" is not authorized for /agntcy.dir.store.v1.StoreService/Push
```

No CID, publication, routing announcement, verified badge or scan result was
obtained. Cisco catalog search returned no SCVD result. The
[existing SCVD request was updated](https://github.com/agntcy/dir/discussions/455#discussioncomment-18505236)
with this result and a request for OIDC writer access or an operator import.
Another provider's [same access question](https://github.com/agntcy/dir/discussions/1781)
had no comments at this readback. Full federation is an operator deployment
with trust prerequisites, not a single-record upload form.

[Anro's publisher query](https://api.anroagents.com/ard/agents?filter=publisherId%20%3D%20%27scvd.store%27&pageSize=20)
returned HTTP 200 with `items: []` and `total: 0`. Its public external-agent
route is manifest crawling; SCVD already serves that manifest. No external
upload form or crawl trigger was established. An indexing-request email to
`support@anroagents.com` is prepared locally, awaiting explicit send permission.
No paid hosting account was purchased.

## Native host execution attempts

- **Gemini CLI:** after the keeper completed Google authorization, the current
  CLI rejected consumer-tier access as no longer supported. The
  [official retirement notice](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals)
  says consumer Google-account access ended June 18; Standard and Enterprise
  subscriptions are unaffected. This supersedes the earlier missing-auth-method
  diagnosis. No skill or MCP tool executed. [Sanitized receipt](gemini-auth-retirement.json).
  Antigravity is the next Google consumer-host route; existing gallery presence
  does not establish working consumer authentication.
- **Cline CLI:** after keeper sign-in, the CLI confirmed an authenticated
  session despite the browser showing an invalid-code message. The first
  non-TTY attempt stopped at tool approval. A TTY rerun, approving only the
  skill load and free preflight, completed both: `not_ready / L1` for
  example.com. [Native receipt](cline-native-execution.json). No paid or Tab
  operations tested. The system Node trust-store warning remains a runtime
  limitation, not a failure of this observed run.
- **Cursor desktop:** native inspection could not start because macOS Computer
  Use permissions are not granted. The earlier CLI skill-discovery gap remains
  unresolved; no desktop compatibility result is claimed.
- **OpenCode:** native skill discovery and both MCP connections passed, followed
  by a successful skill load and free preflight through keeper-authorized
  ChatGPT OAuth. [Native receipt](opencode-native-execution.json) retains the
  earlier free-provider and mini-model failures. The [setup guide](../../registry/opencode/README.md)
  reuses the same assets; marketplace admission remains separate.


Raw public captures and validation output are in the local packet
`/private/tmp/scvd-oasf-followthrough-20260918`. Authentication tokens and private
signing material are excluded from this record.

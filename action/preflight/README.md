# scvd preflight — the x402 door check, in your deploy

A GitHub Action that runs [scvd.store](https://scvd.store)'s free x402
door check against the doors you name and fails the job when one does
not answer a well-formed, payable 402. Same instrument as
`POST /api/preflight/v2` and the `scvd` CLI, same single probe per
door, same limiter, same verdict law. Nothing installed on the runner:
the runner's Node and global `fetch`, one file.

```yaml
- uses: seancrecord/scvd-general-store-repo/action/preflight@main
  with:
    urls: |
      https://your-shop.example/api/buy/thing
      https://your-shop.example/api/buy/other
```

Put it after the deploy step, so what is probed is what shipped.

## What it does

One `POST https://scvd.store/api/preflight/v2` per door, from the
store's vantage, at one moment. The store answers with a verdict and
every check by name; the action prints them, writes the store's own
JSON to `scvd-preflight.json` (change it with `report_path`), fills a
job summary table, and sets three outputs: `verdicts` (a JSON object
of door to verdict), `worst`, and `report_path`.

A pass says the door served a well-formed, payable 402 to one request
at one moment. It is not an uptime claim and says nothing about
delivery after payment. Every check name is in the store's
[defect vocabulary](https://scvd.store/defects).

## What fails the job

| Exit | When |
| --- | --- |
| `0` | Every door answered on the ready side. |
| `1` | A door's verdict is in `fail_on` — `not_ready` by default. |
| `2` | The store refused a URL before probing: plain http, a custom port, a private address, or the store's own hostname. Nothing was probed, so the job fails rather than passing on a door nobody looked at. |
| `3` | The store, or the network between the runner and it, did not answer — including the store's probe budget (429, with the wait named). |

`unreachable` does **not** fail the job by default, and this is
deliberate. The store is explicit that it describes the network path
from its vantage at one moment and says nothing about the endpoint; a
deploy gate that failed on it would be drawing a conclusion the
evidence refuses. If your pipeline wants that anyway, say so in the
workflow:

```yaml
  with:
    urls: https://your-shop.example/api/buy/thing
    fail_on: not_ready,unreachable
```

## Inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
| `urls` | required | One door per line: https, default port, on the public internet, the URL a buyer would GET expecting a 402. |
| `fail_on` | `not_ready` | Comma-separated verdicts that fail the job. |
| `base` | `https://scvd.store` | Only change it to point at a staging copy of the store. |
| `report_path` | `scvd-preflight.json` | Where the store's JSON goes, for `upload-artifact` or a later step. |

| Output | Meaning |
| --- | --- |
| `verdicts` | JSON object of door to `ready`, `not_ready`, `unreachable` or `refused`. |
| `worst` | The worst verdict across the doors. |
| `report_path` | The file the JSON was written to. |

## What it stores about you

Nothing. The store meters the probe on the same budget as any caller
and keeps no account, no cookie and no caller identifier; the door's
own security block says so at
[/api/preflight/v2](https://scvd.store/api/preflight/v2). The action
sends your door's URL and nothing else.

## The signed version

The free reading is one moment, unsigned. If you need to hand somebody
a dated, signed record of the same probe at its own permanent URL, the
paid item is `service_audit`, priced on the
[shelf](https://scvd.store/menu.json) and bought over x402 — never
from inside this action, which spends nothing.

## Running it without GitHub

```
SCVD_PREFLIGHT_URLS="https://your-shop.example/api/buy/thing" node action/preflight/preflight.mjs
```

The same exit codes. The `scvd` CLI (`npm i -g scvd-cli`) is the
terminal form of the same check.

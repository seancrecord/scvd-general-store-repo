"""Bounded GET-only research capture. Does not authenticate, pay, or follow redirects.

Run from this directory: python3 capture-public.py unique-id https://public/source
Creates a metadata record even when the collector fails. Existing IDs refuse.
This saves source bytes, not a signed SCVD observation or a conformance verdict.
"""
import datetime
import hashlib
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request

root = pathlib.Path(__file__).parent / "captures"
name, url = sys.argv[1:]
if not name or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-" for c in name):
    raise SystemExit("Use a unique lowercase capture ID.")
parsed = urllib.parse.urlsplit(url)
if parsed.scheme != "https" or parsed.username or parsed.password:
    raise SystemExit("Public HTTPS only; no URL credentials.")
if (root / (name + ".json")).exists() or (root / (name + ".body")).exists():
    raise SystemExit("Capture ID already exists; use a new ID to preserve history.")

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

record = {
    "id": name, "requested_url": url, "method": "GET",
    "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "user_agent": "scvd-partner-research/0.1 (+https://scvd.store; unpaid public reads)",
    "payment_sent": False, "authenticated": False,
    "max_bytes": 2097152, "timeout_seconds": 15,
}
try:
    request = urllib.request.Request(url, headers={
        "User-Agent": record["user_agent"],
        "Accept": "application/json, text/plain, text/html;q=0.9, */*;q=0.5",
    })
    try:
        response = urllib.request.build_opener(NoRedirect).open(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        body = response.read(record["max_bytes"] + 1)
        record.update(status=response.status, headers={
            k: v for k, v in response.headers.items() if k.lower() in (
                "content-type", "date", "etag", "last-modified", "location",
                "cache-control", "x-ratelimit-remaining",
            )
        }, truncated=len(body) > record["max_bytes"])
        body = body[:record["max_bytes"]]
        record.update(bytes=len(body), sha256=hashlib.sha256(body).hexdigest(),
                      body_file=name + ".body")
        (root / record["body_file"]).write_bytes(body)
except Exception as error:
    record.update(status=None, error=type(error).__name__ + ": " + str(error))
(root / (name + ".json")).write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({k: record.get(k) for k in ("id", "status", "bytes", "truncated", "error")}))

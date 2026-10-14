"""One operator-supplied synthetic request. No wallet, signer, auth, or retry."""
import datetime
import hashlib
import json
import pathlib
import urllib.error
import urllib.request

root = pathlib.Path(__file__).parent / "captures"
name = "bix-unpaid-challenge"
if (root / (name + ".json")).exists():
    raise SystemExit("Already attempted; preserve the record instead of retrying.")
url = "https://creator.linkhco.com/paid/v1/creator-edge"
body = b'{"pair":"USDG","tax":1}'
headers = {"Content-Type": "application/json", "Accept": "application/json",
           "User-Agent": "scvd-partner-research/0.1 (+https://scvd.store; unpaid public reads)"}
record = {"id": name, "requested_url": url, "method": "POST",
          "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "request_body": body.decode(), "request_sha256": hashlib.sha256(body).hexdigest(),
          "request_headers": headers, "payment_sent": False, "authenticated": False,
          "max_bytes": 2097152, "timeout_seconds": 15, "retries": 0,
          "purpose": "Operator-requested unpaid discovery/request-preparation check."}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

try:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        response = urllib.request.build_opener(NoRedirect).open(request, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        result = response.read(record["max_bytes"] + 1)
        record.update(status=response.status, headers={
            k: v for k, v in response.headers.items() if k.lower() in (
                "content-type", "date", "etag", "location", "payment-required",
                "www-authenticate", "x-payment-required")},
            truncated=len(result) > record["max_bytes"])
        result = result[:record["max_bytes"]]
        record.update(bytes=len(result), sha256=hashlib.sha256(result).hexdigest(),
                      body_file=name + ".body")
        (root / record["body_file"]).write_bytes(result)
except Exception as error:
    record.update(status=None, error=type(error).__name__ + ": " + str(error))
(root / (name + ".json")).write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps({k: record.get(k) for k in ("id", "status", "bytes", "truncated", "error")}))

"""
THE SHARED HALF OF EVERY PYTHON EXAMPLE — standard library only, 3.9+.

The same four steps as decide.mjs, spelled for CrewAI, PydanticAI and
AutoGen: read the door's 402, ask the store's free dry run (which
carries the free preflight whole as ``the_door``), read the terms and
the named defects, decide with every reason beside its evidence.

decide() is pure and mirrors decide.mjs rule for rule; both are held
to examples/fixtures/expected.json by their own runners, so the two
languages cannot drift apart without the build going red. A decision
is a derivation, never a score; unknown is never a difference.
"""

from __future__ import annotations

import base64
import json
import urllib.error
import urllib.request
from typing import Any, Optional

DEFAULT_BASE = "https://scvd.store"

DOORS = {
    "preflight": "/api/preflight/v2",
    "before_you_pay": "/api/before-you-pay/v1",
    "conformance": "/api/conformance/v1",
    "look": "/api/look/v1",
    "verifier_mcp": "/mcp/verifier",
}

DOES_NOT_ESTABLISH = (
    "whether the service behind the 402 delivers anything after payment — no probe can",
    "whether the door stays up: the reading was one request at one moment",
    "whether the merchant is honest, or which door you should use — this is evidence, not a recommendation",
)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: D401
        return None


_OPENER = urllib.request.build_opener(_NoRedirect)


def read_challenge(url: str, opener=None) -> dict:
    """Step 1: GET the door and decode its PAYMENT-REQUIRED challenge."""
    opener = opener or _OPENER
    out = {"url": url, "status": None, "x402_version": None, "accepts": [], "parse_error": None}
    try:
        with opener.open(urllib.request.Request(url, method="GET"), timeout=20) as response:
            status, headers = response.status, response.headers
    except urllib.error.HTTPError as error:
        status, headers = error.code, error.headers
    out["status"] = status
    if status != 402:
        out["parse_error"] = f"expected 402, got {status}"
        return out
    header = headers.get("payment-required")
    if not header:
        out["parse_error"] = "no PAYMENT-REQUIRED header"
        return out
    try:
        challenge = json.loads(base64.b64decode(header).decode("utf-8"))
        out["x402_version"] = challenge.get("x402Version")
        accepts = challenge.get("accepts")
        out["accepts"] = accepts if isinstance(accepts, list) else []
    except (ValueError, TypeError) as error:
        out["parse_error"] = f"PAYMENT-REQUIRED did not decode: {error}"
    return out


def _post(base: str, path: str, body: dict, opener=None) -> dict:
    opener = opener or _OPENER
    request = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with opener.open(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        text = error.read().decode("utf-8", "replace")
        try:
            detail = json.loads(text).get("error", "no error text")
        except ValueError:
            detail = text[:200]
        raise RuntimeError(f"{path} answered {error.code}: {detail}") from None


def preflight(url: str, base: str = DEFAULT_BASE, opener=None) -> dict:
    """Step 2: the door's shape — one probe, every check named."""
    return _post(base, DOORS["preflight"], {"url": url}, opener)


def before_you_pay(url: str, base: str = DEFAULT_BASE, client_profile: Optional[dict] = None, opener=None) -> dict:
    """Step 2, both halves: will MY client pay this, with the preflight whole as the_door."""
    body = {"url": url, "client_profile": client_profile} if client_profile else {"url": url}
    return _post(base, DOORS["before_you_pay"], body, opener)


def _terms_of(client: Optional[dict], accepts: Optional[list]) -> Optional[dict]:
    chosen = (client or {}).get("chosen")
    if chosen:
        accept = accepts[chosen["index"]] if accepts and len(accepts) > chosen["index"] else None
        pay_to = accept.get("payTo") if isinstance(accept, dict) and isinstance(accept.get("payTo"), str) else None
        return {
            "network": chosen.get("network"),
            "asset": chosen.get("asset"),
            "pay_to": pay_to,
            "amount_atomic": chosen.get("amount_atomic"),
            "amount_usd": chosen.get("amount_usd"),
            "signing_window_seconds": chosen.get("signing_window_seconds"),
            "from": "the accept a stock client would select",
        }
    first = accepts[0] if accepts else None
    if not isinstance(first, dict):
        return None
    s = lambda v: v if isinstance(v, str) else None  # noqa: E731
    return {
        "network": s(first.get("network")),
        "asset": s(first.get("asset")),
        "pay_to": s(first.get("payTo")),
        "amount_atomic": s(first.get("amount")),
        "amount_usd": None,
        "signing_window_seconds": None,
        "from": "the first accept in the challenge (no client selection available)",
    }


def decide(door: dict, client: Optional[dict] = None, accepts: Optional[list] = None, policy: Optional[dict] = None) -> dict:
    """Steps 3 and 4. Pure: no network, no clock. Mirrors decide.mjs rule for rule."""
    if not isinstance(door, dict):
        raise TypeError("decide: a preflight report is required")
    policy = policy or {}
    checks = door.get("checks") if isinstance(door.get("checks"), list) else []
    advisories = door.get("advisories") if isinstance(door.get("advisories"), list) else []
    defects = [c.get("name") for c in checks if isinstance(c, dict) and c.get("ok") is False]
    worth_knowing = [a.get("name") for a in advisories if isinstance(a, dict)]
    terms = _terms_of(client, accepts)
    because: list = []
    derived_from = {"preflight_version": door.get("version"), "checks_run": len(checks), "advisories_raised": len(advisories)}

    def answer(decision: str) -> dict:
        return {
            "decision": decision,
            "because": because,
            "terms": terms,
            "defects": defects,
            "worth_knowing": worth_knowing,
            "does_not_establish": list(DOES_NOT_ESTABLISH),
            "derived_from": derived_from,
        }

    verdict = door.get("verdict")
    if verdict == "unreachable":
        because.append("preflight verdict is unreachable: the probe itself could not complete, which says nothing about the door (unknown is never a defect)")
        return answer("cannot_tell")
    if verdict == "not_ready":
        because.append(f"preflight verdict is not_ready; failed checks: {', '.join(d for d in defects if d) or '(none named)'}")
        return answer("do_not_pay")
    if verdict != "ready":
        because.append(f"preflight verdict is {verdict}, which this decision does not know how to read")
        return answer("cannot_tell")
    if client and client.get("outcome") == "would_throw":
        because.append(f"a stock x402 client would refuse on your machine before signing: {client.get('throws_with') or '(no error text)'}")
        for dropped in client.get("dropped") or []:
            because.append(f"accept {dropped.get('index')} ({dropped.get('network')}, {dropped.get('asset')}) dropped at {dropped.get('stage')}: {dropped.get('why')}")
        return answer("do_not_pay")
    if client and client.get("outcome") == "cannot_simulate":
        because.append("the dry run could not walk the challenge's accepts, so which accept your client would sign is unknown")
        return answer("cannot_tell")
    if "testnet-network" in worth_knowing:
        because.append("advisory testnet-network: the offer quotes a testnet; a mainnet wallet signing it settles nowhere real")
        return answer("do_not_pay")
    if not terms:
        because.append("preflight is ready but no accept could be read, so there are no terms to decide on")
        return answer("cannot_tell")
    allowed_networks = policy.get("allowed_networks")
    if isinstance(allowed_networks, list):
        if not terms.get("network"):
            because.append("policy allowed_networks is set and the selected accept names no network")
            return answer("cannot_tell")
        if terms["network"] not in allowed_networks:
            because.append(f"policy allowed_networks does not include {terms['network']}")
            return answer("do_not_pay")
    allowed_recipients = policy.get("allowed_recipients")
    if isinstance(allowed_recipients, list):
        if not terms.get("pay_to"):
            because.append("policy allowed_recipients is set and the recipient could not be read (pass the challenge's accepts to decide)")
            return answer("cannot_tell")
        if terms["pay_to"].lower() not in [r.lower() for r in allowed_recipients]:
            because.append(f"policy allowed_recipients does not include {terms['pay_to']}")
            return answer("do_not_pay")
    cap = policy.get("max_amount_usd")
    if isinstance(cap, (int, float)) and not isinstance(cap, bool):
        if terms.get("amount_usd") is None:
            because.append("policy max_amount_usd is set and the amount in USD could not be resolved for this asset")
            return answer("cannot_tell")
        if terms["amount_usd"] > cap:
            because.append(f"amount {terms['amount_usd']} USD is above policy max_amount_usd {cap}")
            return answer("do_not_pay")
    because.append(f"preflight verdict is ready ({len(checks)} checks, {len(defects)} failed)")
    if client:
        index = client["chosen"]["index"] if client.get("chosen") else "?"
        because.append(f"a stock client would sign accept {index} ({terms['network']}, {terms['amount_atomic']} atomic units)")
    if worth_knowing:
        because.append(f"advisories outside the verdict, worth reading: {', '.join(w for w in worth_knowing if w)}")
    return answer("pay")


def before_you_pay_walk(url: str, base: str = DEFAULT_BASE, client_profile: Optional[dict] = None, policy: Optional[dict] = None, opener=None) -> dict:
    """The whole walk in one call: GET the door, one POST to the store, decide."""
    challenge = read_challenge(url, opener)
    reading = before_you_pay(url, base, client_profile, opener)
    decision = decide(reading["the_door"], reading.get("your_client"), challenge["accepts"], policy)
    return {"url": url, "challenge": challenge, "reading": reading, "decision": decision}

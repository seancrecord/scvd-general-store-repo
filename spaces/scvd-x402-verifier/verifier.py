"""The five read-only tools of scvd.store's verifier door, callable from a Space.

Every function here is one JSON-RPC ``tools/call`` to
``https://scvd.store/mcp/verifier`` and returns the store's answer as
the store gave it. Nothing is re-derived, re-scored or summarised on
this side: the Space is a front for the door, not a second opinion,
and an answer read here is byte-for-byte the answer an agent gets on
the door itself. No ``buy_*`` tool is reachable through this module, so
no payment can transit Hugging Face, and no door below needs a key.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request

VERIFIER_DOOR = "https://scvd.store/mcp/verifier"
USER_AGENT = "scvd-x402-verifier-space/1 (+https://scvd.store/mcp/verifier)"
TIMEOUT_SECONDS = 45

# The names the door serves, verbatim; test_verifier.py holds them to
# the door's own tools/list so a rename there is caught here.
TOOL_NAMES = (
    "preflight_x402_endpoint",
    "verify_x402_receipt",
    "lookup_endpoint_readiness",
    "get_defect_definition",
    "verify_scvd_artifact",
)


def _http_transport(payload: dict) -> dict:
    """POST one JSON-RPC envelope to the door and return the parsed reply."""
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        VERIFIER_DOOR,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        },
    )
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def call_tool(name: str, arguments: dict, transport=None) -> dict:
    """Call one verifier tool and return the door's answer, or a named failure.

    A failure is returned, never raised, in the same shape every time:
    ``{"tool": name, "error": <what happened>}``. Unknown is never
    dressed as a verdict; a door we could not reach says so.
    """
    if name not in TOOL_NAMES:
        return {"tool": name, "error": f"No such tool on the verifier door. It serves: {', '.join(TOOL_NAMES)}."}
    # Optional inputs left blank in the UI are omitted, not sent as "".
    cleaned = {key: value for key, value in arguments.items() if value not in (None, "")}
    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": cleaned}}
    send = transport or _http_transport
    try:
        reply = send(payload)
    except urllib.error.HTTPError as error:
        return {"tool": name, "error": f"The door answered HTTP {error.code}; nothing was verified."}
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        return {"tool": name, "error": f"The door could not be reached ({error}); nothing was verified."}
    except ValueError:
        return {"tool": name, "error": "The door's reply was not JSON; nothing was verified."}
    if not isinstance(reply, dict):
        return {"tool": name, "error": "The door's reply was not a JSON-RPC envelope; nothing was verified."}
    if "error" in reply:
        message = reply["error"].get("message") if isinstance(reply["error"], dict) else str(reply["error"])
        return {"tool": name, "error": message}
    result = reply.get("result")
    if not isinstance(result, dict):
        return {"tool": name, "error": "The door's reply carried no result; nothing was verified."}
    if isinstance(result.get("structuredContent"), dict):
        return result["structuredContent"]
    # A text-only answer: the first text block, parsed when it is JSON.
    for block in result.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "text":
            try:
                return json.loads(block["text"])
            except (ValueError, KeyError, TypeError):
                return {"tool": name, "text": block.get("text", "")}
    return {"tool": name, "error": "The door's reply carried no readable content; nothing was verified."}


def _pretty(answer: dict) -> str:
    return json.dumps(answer, indent=2, ensure_ascii=False)


def preflight_x402_endpoint(url: str) -> str:
    """Preflight an x402 endpoint before paying it.

    One unpaid probe answering whether the URL serves a well-formed x402 v2
    challenge a stock client could sign: 402 status, parseable PAYMENT-REQUIRED
    header, offer terms present. Every check is named, and so is anything the
    probe could not tell.

    Args:
        url: The https endpoint a buyer would GET expecting a 402 challenge.
    """
    return _pretty(call_tool("preflight_x402_endpoint", {"url": url}))


def verify_x402_receipt(artifact: str, kind: str = "", public_key_hex: str = "") -> str:
    """Verify an x402 signed receipt or offer from any issuer.

    Structure, signature against the issuer's key, liveness. Pass the public key
    for a fully offline check; otherwise the issuer's did:web key is resolved.

    Args:
        artifact: The signed offer or receipt as a compact JWS (header.payload.signature).
        kind: Optional. The artifact kind; detected from the artifact when absent.
        public_key_hex: Optional ed25519 public key, hex, for an offline check.
    """
    return _pretty(call_tool("verify_x402_receipt", {"artifact": artifact, "kind": kind, "public_key_hex": public_key_hex}))


def lookup_endpoint_readiness(host: str) -> str:
    """Look up what the signed weekly x402 readiness corpus holds about one host.

    Rounds probed of rounds since first sighting, the last signed verdict, the
    tier with its fraction, and the gaps counted against the store. Never a
    ranking.

    Args:
        host: A hostname, or a URL whose host is read.
    """
    return _pretty(call_tool("lookup_endpoint_readiness", {"host": host}))


def get_defect_definition(id: str = "") -> str:
    """Read one named x402 defect class from the store's registered vocabulary.

    What a clear door asserts, what a buyer loses when the defect is present,
    whether it is detectable without paying. Leave the id empty to list every
    class.

    Args:
        id: A defect class id from the vocabulary, e.g. status-402. Empty lists all.
    """
    return _pretty(call_tool("get_defect_definition", {"id": id}))


def verify_scvd_artifact(id: str) -> str:
    """Verify a certificate, stamp or anchor id this store issued.

    Returns the exact signed bytes and the ed25519 key, so the check can be
    repeated offline. Free forever, whether or not anyone bought the thing.

    Args:
        id: A cert_, stamp_, or anchor_ id.
    """
    return _pretty(call_tool("verify_scvd_artifact", {"id": id}))

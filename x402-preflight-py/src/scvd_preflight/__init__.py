"""scvd-preflight — scvd.store's free x402 door check, as a library.

One POST per door to /api/preflight/v2: the same single probe, the same
battery, the same limiter every caller gets. The store answers with a
verdict (ready / not_ready / unreachable), every check by name, the
advisories outside the verdict, and ``remediation`` rows — the defect
class, its definition URL, what the operator does, what the buyer does —
for each failed check or advisory the vocabulary explains. This module
keeps the response whole and adds the deploy gate's law on top: which
verdicts fail, and why unreachable does not by default (it is a fact
about the network path from the store's vantage at one moment, never a
finding about the door).

A PORT, NOT A REWRITE. The JavaScript package of the same name is the
reference; this file answers the same questions with the same words,
and the shared fixtures in ../x402-preflight/fixtures are run against
both so the two cannot come to disagree about what a verdict means.
Where Python and JavaScript differ the difference is spelled rather
than smoothed: ``preflight_one`` returns a dataclass instead of a plain
object, and names are snake_case, because a port that reads like
transliterated JavaScript is a library nobody wants to import.

Standard library only. Nothing installed. It holds no key and cannot
spend money.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

__all__ = [
    "DEFAULT_BASE",
    "BATTERY",
    "EXIT_OK",
    "EXIT_VERDICT_NEGATIVE",
    "EXIT_USAGE",
    "EXIT_UNREACHABLE",
    "SEVERITY",
    "PreflightResult",
    "preflight_one",
    "preflight_many",
    "failed_checks",
    "remediation",
    "exit_code_for",
    "worst_outcome",
    "render_lines",
]

DEFAULT_BASE = "https://scvd.store"
BATTERY = "v2"

EXIT_OK = 0
EXIT_VERDICT_NEGATIVE = 1
EXIT_USAGE = 2
EXIT_UNREACHABLE = 3

#: The order the worst outcome is chosen in; later is worse.
SEVERITY: Tuple[str, ...] = ("ready", "refused", "unreachable", "not_ready")

USER_AGENT = "scvd-preflight (+https://scvd.store/api/preflight/v2)"


def _trim_slashes(value: str) -> str:
    """Trailing slashes off an origin, without a regex over caller input."""
    end = len(value)
    while end > 0 and value[end - 1] == "/":
        end -= 1
    return value[:end]


@dataclass
class PreflightResult:
    """One door's reading, with the store's own body kept whole.

    ``outcome`` is one of the store's three verdicts, or ``refused``
    (the store declined before probing anything) or
    ``store_unreachable`` (we never got an answer). The last two are
    this client's words, not the store's, and they are kept distinct
    from a verdict for the reason the deploy gate cares about: a door
    nobody looked at has not passed.
    """

    url: str
    outcome: str
    detail: Optional[str] = None
    status: Optional[int] = None
    body: Optional[Dict[str, Any]] = None
    next_action: Optional[str] = None


def preflight_one(
    url: str,
    *,
    base: str = DEFAULT_BASE,
    timeout: float = 30.0,
    opener: Any = None,
) -> PreflightResult:
    """One probe, through the store, with the response kept whole.

    Never raises: a store that did not answer is ``store_unreachable``,
    a refusal before probing is ``refused``, and everything else is the
    store's own verdict with its body beside it. ``opener`` takes a
    callable with urlopen's signature, which is how the tests drive
    this against the recorded fixtures without a network.
    """
    payload = json.dumps({"url": url}).encode("utf-8")
    request = urllib.request.Request(
        f"{_trim_slashes(base)}/api/preflight/{BATTERY}",
        data=payload,
        method="POST",
        headers={
            "content-type": "application/json",
            "user-agent": USER_AGENT,
            "accept": "application/json",
        },
    )
    urlopen = opener or urllib.request.urlopen

    status: Optional[int] = None
    raw: Optional[bytes] = None
    headers: Mapping[str, str] = {}
    try:
        with urlopen(request, timeout=timeout) as response:
            status = getattr(response, "status", None) or response.getcode()
            raw = response.read()
            headers = dict(getattr(response, "headers", {}) or {})
    except urllib.error.HTTPError as error:
        # An HTTP error is still an answer, and the store puts its
        # refusal text in the body. Reading it is the difference
        # between "refused, and here is why" and a bare status.
        status = error.code
        try:
            raw = error.read()
        except Exception:  # pragma: no cover - a body that will not read
            raw = None
        headers = dict(getattr(error, "headers", {}) or {})
    except Exception as error:  # URLError, socket timeout, TLS, DNS
        return PreflightResult(
            url=url, outcome="store_unreachable", detail=str(error), status=None, body=None
        )

    body: Optional[Dict[str, Any]] = None
    if raw:
        try:
            parsed = json.loads(raw.decode("utf-8"))
            body = parsed if isinstance(parsed, dict) else None
        except Exception:
            body = None

    if status == 429:
        retry = _header(headers, "retry-after")
        suffix = f", retry after {retry}s" if retry else ""
        return PreflightResult(
            url=url,
            outcome="store_unreachable",
            detail=(
                "the store's probe budget refused this call "
                f"(429{suffix}); nothing was probed"
            ),
            status=429,
            body=body,
        )

    if status != 200 or not body or "verdict" not in body:
        detail = (
            str(body["error"])
            if body and body.get("error")
            else f"the store answered {status} without a verdict"
        )
        return PreflightResult(
            url=url,
            outcome="refused",
            detail=detail,
            status=status,
            body=body,
            next_action=(body or {}).get("next_action"),
        )

    return PreflightResult(url=url, outcome=str(body["verdict"]), detail=None, status=200, body=body)


def _header(headers: Mapping[str, str], name: str) -> Optional[str]:
    for key, value in headers.items():
        if key.lower() == name:
            return value
    return None


def preflight_many(urls: Sequence[str], **options: Any) -> List[PreflightResult]:
    """Every door, in order, one probe each.

    Serial on purpose, as in the JavaScript: the store publishes a
    per-minute probe budget, and a client that fans out is a client
    that spends someone else's ceiling faster than it reads it.
    """
    return [preflight_one(url, **options) for url in urls]


def failed_checks(report: Optional[Mapping[str, Any]]) -> List[str]:
    """The failed checks by name, from the store's own report."""
    checks = (report or {}).get("checks") or []
    return [
        str(check.get("name"))
        for check in checks
        if isinstance(check, Mapping) and check.get("ok") is False
    ]


def remediation(report: Optional[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """The store's remediation rows, whole — never derived here."""
    rows = (report or {}).get("remediation")
    return list(rows) if isinstance(rows, list) else []


def exit_code_for(
    results: Sequence[PreflightResult], fail_on: Iterable[str] = ("not_ready",)
) -> int:
    """The deploy gate's law, as one function.

    ``refused`` is EXIT_USAGE (nothing was probed, so a gate must not
    pass on a door nobody looked at); ``store_unreachable`` is
    EXIT_UNREACHABLE; a verdict in ``fail_on`` is EXIT_VERDICT_NEGATIVE;
    everything else EXIT_OK.
    """
    wanted = set(fail_on)
    if any(result.outcome == "refused" for result in results):
        return EXIT_USAGE
    if any(result.outcome == "store_unreachable" for result in results):
        return EXIT_UNREACHABLE
    if any(result.outcome in wanted for result in results):
        return EXIT_VERDICT_NEGATIVE
    return EXIT_OK


def worst_outcome(results: Sequence[PreflightResult]) -> str:
    """The worst outcome across doors; store_unreachable counts as unreachable."""
    worst = "ready"
    for result in results:
        outcome = "unreachable" if result.outcome == "store_unreachable" else result.outcome
        if outcome in SEVERITY and SEVERITY.index(outcome) > SEVERITY.index(worst):
            worst = outcome
    return worst


def render_lines(result: PreflightResult) -> List[str]:
    """One door's reading as lines a person reads."""
    head = f"{result.url}: {result.outcome}"
    if result.detail:
        head += f" — {result.detail}"
    lines = [head]
    if result.next_action:
        lines.append(f"  next: {result.next_action}")
    report = result.body
    if not isinstance(report, Mapping) or "verdict" not in report:
        return lines
    for check in report.get("checks") or []:
        mark = "ok  " if check.get("ok") else "FAIL"
        lines.append(f"  {mark}  {check.get('name')}: {check.get('detail')}")
    for advisory in report.get("advisories") or []:
        lines.append(f"  NOTE  {advisory.get('name')}: {advisory.get('detail')}")
    for row in remediation(report):
        lines.append(
            f"  FIX   {row.get('signal')} → {row.get('defect_class')} ({row.get('definition_url')})"
        )
        if row.get("operator"):
            lines.append(f"        operator: {row['operator']}")
        if row.get("buyer"):
            lines.append(f"        buyer:    {row['buyer']}")
    return lines

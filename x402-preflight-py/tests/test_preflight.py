"""The Python port, against the SAME recorded fixtures as the JavaScript.

The fixtures live in ../x402-preflight/fixtures and are read from
there rather than copied: two copies of a recorded battery is two
things to re-record, and the day one is re-recorded and the other is
not is the day the two clients disagree about what `ready` means.
"""

from __future__ import annotations

import io
import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "src"))

from scvd_preflight import (  # noqa: E402
    EXIT_OK,
    EXIT_UNREACHABLE,
    EXIT_USAGE,
    EXIT_VERDICT_NEGATIVE,
    PreflightResult,
    exit_code_for,
    failed_checks,
    preflight_one,
    remediation,
    render_lines,
    worst_outcome,
)

FIXTURES = pathlib.Path(__file__).resolve().parents[2] / "x402-preflight" / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIXTURES / f"{name}.json").read_text())["report"]


class FakeResponse(io.BytesIO):
    """Just enough of an http.client.HTTPResponse for the client."""

    def __init__(self, status: int, body: object, headers: dict | None = None):
        raw = body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        super().__init__(raw)
        self.status = status
        self.headers = headers or {}

    def getcode(self) -> int:
        return self.status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def opener_for(status: int, body: object, headers: dict | None = None):
    def _open(request, timeout=None):  # noqa: ARG001
        return FakeResponse(status, body, headers)

    return _open


class PreflightPortTest(unittest.TestCase):
    def test_ready_fixture_is_a_verdict_not_a_refusal(self):
        report = load("ready-would-sign")
        result = preflight_one("https://example.test/x", opener=opener_for(200, report))
        self.assertEqual(result.outcome, "ready")
        self.assertEqual(result.status, 200)
        self.assertIsNone(result.detail)
        self.assertEqual(failed_checks(result.body), [])

    def test_not_ready_fixture_names_its_failed_checks(self):
        report = load("accepts-empty")
        result = preflight_one("https://example.test/x", opener=opener_for(200, report))
        self.assertEqual(result.outcome, "not_ready")
        self.assertTrue(failed_checks(result.body), "the fixture should name at least one failure")
        for name in failed_checks(result.body):
            self.assertIsInstance(name, str)

    def test_unreachable_is_the_stores_verdict_not_a_client_error(self):
        report = load("unreachable")
        result = preflight_one("https://example.test/x", opener=opener_for(200, report))
        self.assertEqual(result.outcome, "unreachable")
        self.assertEqual(result.status, 200)

    def test_remediation_rows_pass_through_whole(self):
        report = load("accepts-empty")
        rows = remediation(report)
        self.assertEqual(rows, report.get("remediation", []))

    def test_429_is_store_unreachable_and_says_nothing_was_probed(self):
        result = preflight_one(
            "https://example.test/x",
            opener=opener_for(429, {"error": "budget_spent"}, {"retry-after": "60"}),
        )
        self.assertEqual(result.outcome, "store_unreachable")
        self.assertIn("nothing was probed", result.detail or "")
        self.assertIn("60", result.detail or "")

    def test_a_body_without_a_verdict_is_refused(self):
        result = preflight_one(
            "https://example.test/x",
            opener=opener_for(400, {"error": "url_missing", "next_action": "send a url"}),
        )
        self.assertEqual(result.outcome, "refused")
        self.assertEqual(result.detail, "url_missing")
        self.assertEqual(result.next_action, "send a url")

    def test_a_store_that_never_answered_is_store_unreachable(self):
        def boom(request, timeout=None):  # noqa: ARG001
            raise OSError("connection reset")

        result = preflight_one("https://example.test/x", opener=boom)
        self.assertEqual(result.outcome, "store_unreachable")
        self.assertIsNone(result.status)

    def test_exit_law_matches_the_javascript(self):
        ready = PreflightResult(url="a", outcome="ready")
        not_ready = PreflightResult(url="b", outcome="not_ready")
        unreachable = PreflightResult(url="c", outcome="unreachable")
        refused = PreflightResult(url="d", outcome="refused")
        down = PreflightResult(url="e", outcome="store_unreachable")

        self.assertEqual(exit_code_for([ready]), EXIT_OK)
        self.assertEqual(exit_code_for([ready, not_ready]), EXIT_VERDICT_NEGATIVE)
        # unreachable is a fact about the network path, not the door,
        # so it does not fail a gate unless the caller asks it to.
        self.assertEqual(exit_code_for([ready, unreachable]), EXIT_OK)
        self.assertEqual(
            exit_code_for([ready, unreachable], ["not_ready", "unreachable"]),
            EXIT_VERDICT_NEGATIVE,
        )
        # A door nobody looked at must not pass a gate.
        self.assertEqual(exit_code_for([ready, refused]), EXIT_USAGE)
        self.assertEqual(exit_code_for([ready, down]), EXIT_UNREACHABLE)
        # Refused outranks store_unreachable, as in the JavaScript.
        self.assertEqual(exit_code_for([refused, down]), EXIT_USAGE)

    def test_worst_outcome_folds_store_unreachable_into_unreachable(self):
        self.assertEqual(worst_outcome([PreflightResult("a", "ready")]), "ready")
        self.assertEqual(
            worst_outcome([PreflightResult("a", "ready"), PreflightResult("b", "store_unreachable")]),
            "unreachable",
        )
        self.assertEqual(
            worst_outcome([PreflightResult("a", "unreachable"), PreflightResult("b", "not_ready")]),
            "not_ready",
        )

    def test_render_lines_prints_checks_advisories_and_fixes(self):
        report = load("accepts-empty")
        result = preflight_one("https://example.test/x", opener=opener_for(200, report))
        lines = render_lines(result)
        self.assertTrue(lines[0].startswith("https://example.test/x: not_ready"))
        self.assertTrue(any(line.strip().startswith("FAIL") for line in lines))

    def test_base_origin_trailing_slashes_are_trimmed(self):
        seen = {}

        def capture(request, timeout=None):  # noqa: ARG001
            seen["url"] = request.full_url
            return FakeResponse(200, load("ready-would-sign"))

        preflight_one("https://example.test/x", base="https://mirror.test///", opener=capture)
        self.assertEqual(seen["url"], "https://mirror.test/api/preflight/v2")


if __name__ == "__main__":
    unittest.main()

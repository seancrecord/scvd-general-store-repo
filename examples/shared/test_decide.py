"""decide.py held to examples/fixtures/expected.json — the same file decide.test.mjs runs."""

import json
import os
import re
import unittest

from decide import DOES_NOT_ESTABLISH, decide

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "fixtures")


def read(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as handle:
        return json.load(handle)


EXPECTED = read("expected.json")


class DecideMatchesTheExpectationsFile(unittest.TestCase):
    def test_every_case(self):
        for item in EXPECTED["cases"]:
            with self.subTest(item["case"]):
                reading = read(item["fixture"])
                decision = decide(reading["the_door"], reading.get("your_client"), item.get("accepts"), item["policy"])
                self.assertEqual(decision["decision"], item["decision"], decision["because"])
                for reason in item["reasons"]:
                    self.assertTrue(any(reason in line for line in decision["because"]), f"expected a reason containing {reason!r}, got {decision['because']}")
                self.assertEqual(decision["does_not_establish"], list(DOES_NOT_ESTABLISH))
                self.assertTrue(decision["because"])
                self.assertEqual(decision["derived_from"]["preflight_version"], reading["the_door"]["version"])

    def test_never_a_score(self):
        reading = read("ready-would-sign.json")
        decision = decide(reading["the_door"], reading.get("your_client"))
        self.assertIsNone(re.search(r"\b(score|rating|rank|confidence)\b", json.dumps(decision), re.I))

    def test_same_answers_as_the_javascript_half(self):
        """The JS runner asserts the same file; this pins the two outputs field for field on one case."""
        reading = read("ready-would-sign.json")
        decision = decide(reading["the_door"], reading.get("your_client"), None, {"allowed_networks": ["eip155:8453"]})
        self.assertEqual(decision["decision"], "pay")
        self.assertEqual(sorted(decision.keys()), sorted(["decision", "because", "terms", "defects", "worth_knowing", "does_not_establish", "derived_from"]))


if __name__ == "__main__":
    unittest.main()

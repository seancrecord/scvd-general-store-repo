"""verifier.py held to the door's contract with a fake transport; nothing here touches the network."""

import json
import unittest
import urllib.error

import verifier


def fake(reply):
    """A transport that records the envelope it was handed and answers with `reply`."""
    sent = {}

    def transport(payload):
        sent.update(payload)
        if isinstance(reply, Exception):
            raise reply
        return reply

    return transport, sent


class TheEnvelope(unittest.TestCase):
    def test_is_a_tools_call_for_the_named_tool(self):
        transport, sent = fake({"jsonrpc": "2.0", "id": 1, "result": {"structuredContent": {"ok": True}}})
        answer = verifier.call_tool("preflight_x402_endpoint", {"url": "https://door.example/x"}, transport)
        self.assertEqual(sent["method"], "tools/call")
        self.assertEqual(sent["params"]["name"], "preflight_x402_endpoint")
        self.assertEqual(sent["params"]["arguments"], {"url": "https://door.example/x"})
        self.assertEqual(answer, {"ok": True})

    def test_blank_optional_inputs_are_omitted_not_sent_empty(self):
        transport, sent = fake({"result": {"structuredContent": {}}})
        verifier.call_tool("verify_x402_receipt", {"artifact": "a.b.c", "kind": "", "public_key_hex": None}, transport)
        self.assertEqual(sent["params"]["arguments"], {"artifact": "a.b.c"})

    def test_refuses_a_tool_the_door_does_not_serve(self):
        transport, sent = fake({"result": {}})
        answer = verifier.call_tool("buy_simple", {"item": "hello"}, transport)
        self.assertIn("No such tool", answer["error"])
        self.assertEqual(sent, {}, "nothing was sent for a tool this Space must not reach")


class TheAnswer(unittest.TestCase):
    def test_structured_content_wins(self):
        transport, _ = fake({"result": {"structuredContent": {"verdict": "ready"}, "content": [{"type": "text", "text": "{}"}]}})
        self.assertEqual(verifier.call_tool("lookup_endpoint_readiness", {"host": "x"}, transport), {"verdict": "ready"})

    def test_text_json_is_parsed_and_plain_text_is_kept(self):
        transport, _ = fake({"result": {"content": [{"type": "text", "text": json.dumps({"a": 1})}]}})
        self.assertEqual(verifier.call_tool("get_defect_definition", {}, transport), {"a": 1})
        transport, _ = fake({"result": {"content": [{"type": "text", "text": "not json"}]}})
        self.assertEqual(verifier.call_tool("get_defect_definition", {}, transport)["text"], "not json")

    def test_a_json_rpc_error_is_returned_as_the_doors_message(self):
        transport, _ = fake({"error": {"code": -32602, "message": "No defect class named x"}})
        answer = verifier.call_tool("get_defect_definition", {"id": "x"}, transport)
        self.assertEqual(answer, {"tool": "get_defect_definition", "error": "No defect class named x"})

    def test_an_unreachable_door_is_a_named_failure_never_a_verdict(self):
        transport, _ = fake(urllib.error.URLError("dns"))
        answer = verifier.call_tool("verify_scvd_artifact", {"id": "cert_x"}, transport)
        self.assertIn("could not be reached", answer["error"])
        self.assertIn("nothing was verified", answer["error"])
        transport, _ = fake(urllib.error.HTTPError("u", 503, "busy", {}, None))
        self.assertIn("HTTP 503", verifier.call_tool("verify_scvd_artifact", {"id": "cert_x"}, transport)["error"])


class TheFiveFunctions(unittest.TestCase):
    def test_each_public_function_names_the_tool_it_calls(self):
        for name in verifier.TOOL_NAMES:
            self.assertTrue(callable(getattr(verifier, name)), name)
            self.assertTrue((getattr(verifier, name).__doc__ or "").strip(), f"{name} has no docstring; the MCP schema reads it")

    def test_returns_pretty_json_text(self):
        transport, _ = fake({"result": {"structuredContent": {"k": "v"}}})
        original = verifier._http_transport
        verifier._http_transport = transport
        try:
            self.assertEqual(json.loads(verifier.get_defect_definition("status-402")), {"k": "v"})
        finally:
            verifier._http_transport = original


if __name__ == "__main__":
    unittest.main()

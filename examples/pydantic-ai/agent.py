"""
PydanticAI — a buyer agent that is about to pay an x402 door, and checks first.

    pip install pydantic-ai
    OPENAI_API_KEY=… python examples/pydantic-ai/agent.py https://door.example/api/paid-answer

The tool is the shared walk (examples/shared/decide.py). The decision
is a typed result with every reason named; the payment step stays yours.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

from pydantic import BaseModel  # noqa: E402
from pydantic_ai import Agent  # noqa: E402

from decide import before_you_pay_walk  # noqa: E402

POLICY = {"allowed_networks": ["eip155:8453"], "max_amount_usd": 1}


class Verdict(BaseModel):
    decision: str
    because: list[str]
    terms: dict | None
    does_not_establish: list[str]


agent = Agent(
    "openai:gpt-5-mini",
    output_type=Verdict,
    system_prompt=(
        "You are about to pay an x402 endpoint on the user's behalf. Call before_you_pay first and "
        "return its decision, reasons, terms and what it does not establish, unchanged. Never treat a pass as proof of delivery."
    ),
)


@agent.tool_plain
def before_you_pay(url: str) -> dict:
    """Read an x402 URL's 402 terms, run scvd.store's free preflight and dry run over the same bytes, and return pay / do_not_pay / cannot_tell with reasons, terms (network, asset, recipient, amount) and named defects. Evidence, not a recommendation."""
    return before_you_pay_walk(url, policy=POLICY)["decision"]


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python agent.py <x402 url>")
    result = agent.run_sync(f"Should I pay {sys.argv[1]}, and on what terms?")
    print(result.output.model_dump_json(indent=2))

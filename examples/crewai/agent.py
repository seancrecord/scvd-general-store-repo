"""
CrewAI — a buyer agent that is about to pay an x402 door, and checks first.

    pip install crewai
    OPENAI_API_KEY=… python examples/crewai/agent.py https://door.example/api/paid-answer

The tool is the shared walk (examples/shared/decide.py): GET the door's
402, one POST to scvd.store's free dry run (which carries the free
preflight whole), decide with every reason named. Nothing here signs or
pays; the payment step stays yours.
"""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

from crewai import Agent, Crew, Task  # noqa: E402
from crewai.tools import tool  # noqa: E402

from decide import before_you_pay_walk  # noqa: E402

POLICY = {"allowed_networks": ["eip155:8453"], "max_amount_usd": 1}


@tool("before_you_pay")
def before_you_pay(url: str) -> str:
    """Read an x402 URL's 402 terms, run scvd.store's free preflight and dry run over the same bytes, and return pay / do_not_pay / cannot_tell with reasons, terms (network, asset, recipient, amount) and named defects. Evidence, not a recommendation; does not establish delivery."""
    return json.dumps(before_you_pay_walk(url, policy=POLICY)["decision"], indent=2)


def main(url: str) -> None:
    buyer = Agent(
        role="x402 buyer",
        goal="Pay only doors that are well-formed, payable by a stock client, and within policy; otherwise refuse with the reasons named.",
        backstory="You spend a human's money on their behalf and never treat a passing check as proof of delivery.",
        tools=[before_you_pay],
    )
    task = Task(
        description=f"Should we pay {url}? Call before_you_pay first. Report the decision, the reasons verbatim, the terms, and what the check does not establish.",
        expected_output="The decision, its reasons, the terms, and what is not established.",
        agent=buyer,
    )
    print(Crew(agents=[buyer], tasks=[task]).kickoff())


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python agent.py <x402 url>")
    main(sys.argv[1])

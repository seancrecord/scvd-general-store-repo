"""
AutoGen (AgentChat) — an assistant that is about to pay an x402 door, and checks first.

    pip install "autogen-agentchat" "autogen-ext[openai]"
    OPENAI_API_KEY=… python examples/autogen/agent.py https://door.example/api/paid-answer

The tool is the shared walk (examples/shared/decide.py), registered as
a plain function. Nothing here signs or pays.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared"))

from autogen_agentchat.agents import AssistantAgent  # noqa: E402
from autogen_ext.models.openai import OpenAIChatCompletionClient  # noqa: E402

from decide import before_you_pay_walk  # noqa: E402

POLICY = {"allowed_networks": ["eip155:8453"], "max_amount_usd": 1}


def before_you_pay(url: str) -> dict:
    """Read an x402 URL's 402 terms, run scvd.store's free preflight and dry run over the same bytes, and return pay / do_not_pay / cannot_tell with reasons, terms (network, asset, recipient, amount) and named defects. Evidence, not a recommendation; does not establish delivery."""
    return before_you_pay_walk(url, policy=POLICY)["decision"]


async def main(url: str) -> None:
    assistant = AssistantAgent(
        "x402_buyer",
        model_client=OpenAIChatCompletionClient(model="gpt-5-mini"),
        tools=[before_you_pay],
        system_message=(
            "You are about to pay an x402 endpoint on the user's behalf. Call before_you_pay first. "
            "Only pay lets you proceed; report the terms, the reasons and what the check does not establish. Never treat a pass as proof of delivery."
        ),
        reflect_on_tool_use=True,
    )
    result = await assistant.run(task=f"Should I pay {url}, and on what terms?")
    print(result.messages[-1].content)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python agent.py <x402 url>")
    asyncio.run(main(sys.argv[1]))

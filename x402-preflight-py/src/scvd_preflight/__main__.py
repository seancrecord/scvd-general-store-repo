"""scvd-preflight <url> [<url>…] [--fail-on not_ready,unreachable] [--base <origin>] [--json]

The deploy gate's law, from the command line. Exit 0 ready, 1 a verdict
in --fail-on, 2 refused before probing, 3 the store did not answer.

The same flags and the same exit codes as the JavaScript bin, because a
gate that means one thing in a Node CI step and another in a Python one
is worse than no gate.
"""

from __future__ import annotations

import dataclasses
import json as jsonlib
import sys
from typing import List, Optional, Sequence

from . import EXIT_USAGE, exit_code_for, preflight_many, render_lines

USAGE = (
    "usage: scvd-preflight <url> [<url>…] "
    "[--fail-on not_ready,unreachable] [--base <origin>] [--json]\n"
)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    urls: List[str] = []
    fail_on = ["not_ready"]
    base: Optional[str] = None
    as_json = False

    index = 0
    while index < len(args):
        arg = args[index]
        if arg == "--fail-on":
            index += 1
            raw = args[index] if index < len(args) else ""
            fail_on = [part.strip() for part in raw.split(",") if part.strip()]
        elif arg == "--base":
            index += 1
            base = args[index] if index < len(args) else None
        elif arg == "--json":
            as_json = True
        elif arg.startswith("--"):
            sys.stderr.write(f"unknown flag {arg}\n")
            return EXIT_USAGE
        else:
            urls.append(arg)
        index += 1

    if not urls:
        sys.stderr.write(USAGE)
        return EXIT_USAGE

    results = preflight_many(urls, **({"base": base} if base else {}))
    if as_json:
        sys.stdout.write(
            jsonlib.dumps([dataclasses.asdict(result) for result in results], indent=2) + "\n"
        )
    else:
        for result in results:
            sys.stdout.write("\n".join(render_lines(result)) + "\n")
    return exit_code_for(results, fail_on)


if __name__ == "__main__":
    raise SystemExit(main())

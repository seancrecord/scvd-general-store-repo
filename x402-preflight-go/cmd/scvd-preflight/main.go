// Command scvd-preflight is the deploy gate's law, from the command line.
//
//	scvd-preflight <url> [<url>…] [--fail-on not_ready,unreachable] [--base <origin>] [--json]
//
// Exit 0 ready, 1 a verdict in --fail-on, 2 refused before probing,
// 3 the store did not answer. The same flags and the same exit codes as
// the JavaScript and Python commands of this name: a gate that means
// one thing in a Node CI step and another in a Go one is worse than no
// gate.
//
// Flags are parsed by hand rather than with the flag package, because
// flag stops at the first non-flag argument and this command takes a
// list of URLs that may be interleaved with its options.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	preflight "github.com/seancrecord/scvd-general-store-repo/x402-preflight-go"
)

const usage = "usage: scvd-preflight <url> [<url>…] [--fail-on not_ready,unreachable] [--base <origin>] [--json]\n"

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	var urls []string
	failOn := []string{"not_ready"}
	base := ""
	asJSON := false

	for index := 0; index < len(args); index++ {
		switch argument := args[index]; {
		case argument == "--fail-on":
			index++
			raw := ""
			if index < len(args) {
				raw = args[index]
			}
			failOn = nil
			for _, part := range strings.Split(raw, ",") {
				if trimmed := strings.TrimSpace(part); trimmed != "" {
					failOn = append(failOn, trimmed)
				}
			}
		case argument == "--base":
			index++
			if index < len(args) {
				base = args[index]
			}
		case argument == "--json":
			asJSON = true
		case strings.HasPrefix(argument, "--"):
			fmt.Fprintf(os.Stderr, "unknown flag %s\n", argument)
			return preflight.ExitUsage
		default:
			urls = append(urls, argument)
		}
	}

	if len(urls) == 0 {
		fmt.Fprint(os.Stderr, usage)
		return preflight.ExitUsage
	}

	results := preflight.Many(context.Background(), urls, preflight.Options{Base: base})

	if asJSON {
		encoded, err := json.MarshalIndent(results, "", "  ")
		if err != nil {
			fmt.Fprintf(os.Stderr, "%v\n", err)
			return preflight.ExitUsage
		}
		fmt.Println(string(encoded))
	} else {
		for _, result := range results {
			fmt.Println(strings.Join(preflight.RenderLines(result), "\n"))
		}
	}

	return preflight.ExitCodeFor(results, failOn)
}

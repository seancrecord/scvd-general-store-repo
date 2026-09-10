// Compile the actual published patterns with Go's regex engine. JavaScript
// accepting the same pattern does not establish facilitator compatibility.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
)

type Pattern struct{ Item, Path, Pattern string }

func main() {
	var patterns []Pattern
	if err := json.NewDecoder(os.Stdin).Decode(&patterns); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	failed := false
	for _, p := range patterns {
		if _, err := regexp.Compile(p.Pattern); err != nil {
			fmt.Fprintf(os.Stderr, "%s %s: %v\n", p.Item, p.Path, err)
			failed = true
		}
	}
	if failed {
		os.Exit(1)
	}
	fmt.Printf("%d published schema patterns compile with Go regexp.\n", len(patterns))
}

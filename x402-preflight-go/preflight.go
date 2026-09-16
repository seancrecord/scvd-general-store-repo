// Package preflight is scvd.store's free x402 door check, as a library.
//
// One POST per door to /api/preflight/v2: the same single probe, the
// same battery, the same limiter every caller gets. The store answers
// with a verdict (ready / not_ready / unreachable), every check by
// name, the advisories outside the verdict, and remediation rows — the
// defect class, its definition URL, what the operator does, what the
// buyer does — for each failed check or advisory the vocabulary
// explains. This package keeps the response whole and adds the deploy
// gate's law on top: which verdicts fail, and why unreachable does not
// by default (it is a fact about the network path from the store's
// vantage at one moment, never a finding about the door).
//
// A PORT, NOT A REWRITE. The npm package scvd-preflight is the
// reference, and the recorded fixtures in ../x402-preflight/fixtures
// are run against this package too, so the three clients cannot come
// to disagree about what a verdict means.
//
// Standard library only. No module requires anything. It holds no key
// and cannot spend money.
package preflight

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const (
	// DefaultBase is the store this client talks to unless told otherwise.
	DefaultBase = "https://scvd.store"
	// Battery is the preflight version this client posts to.
	Battery = "v2"

	userAgent = "scvd-preflight (+https://scvd.store/api/preflight/v2)"
)

// The deploy gate's exit codes, identical to the JavaScript and Python
// clients: a gate that means one thing in a Node CI step and another in
// a Go one is worse than no gate.
const (
	ExitOK              = 0
	ExitVerdictNegative = 1
	ExitUsage           = 2
	ExitUnreachable     = 3
)

// Severity is the order the worst outcome is chosen in; later is worse.
var Severity = []string{"ready", "refused", "unreachable", "not_ready"}

// Check is one named structural check from the store's battery.
type Check struct {
	Name   string `json:"name"`
	OK     bool   `json:"ok"`
	Detail string `json:"detail"`
}

// Advisory is true and worth knowing, never folded into the verdict.
type Advisory struct {
	Name   string `json:"name"`
	Detail string `json:"detail"`
}

// RemediationRow is the store's own repair row for a failed signal.
type RemediationRow struct {
	Signal        string `json:"signal"`
	Kind          string `json:"kind"`
	DefectClass   string `json:"defect_class"`
	Title         string `json:"title,omitempty"`
	Detectable    string `json:"detectable,omitempty"`
	DefinitionURL string `json:"definition_url"`
	Operator      string `json:"operator"`
	Buyer         string `json:"buyer"`
	FalsifiedBy   string `json:"falsified_by,omitempty"`
}

// Report is the store's answer, with the fields this client reads named
// and the rest kept whole in Raw so nothing is lost in translation.
type Report struct {
	Version     string           `json:"version"`
	Verdict     string           `json:"verdict"`
	Checks      []Check          `json:"checks"`
	Advisories  []Advisory       `json:"advisories"`
	Remediation []RemediationRow `json:"remediation,omitempty"`

	// Raw is the whole decoded body. The store adds fields faster than
	// any client tracks them, and a reading that silently drops what it
	// did not expect is the failure this observatory exists to name.
	Raw map[string]any `json:"-"`
}

// Result is one door's reading.
//
// Outcome is one of the store's three verdicts, or "refused" (the store
// declined before probing anything) or "store_unreachable" (we never
// got an answer). The last two are this client's words, not the
// store's, and they are kept distinct from a verdict for the reason the
// deploy gate cares about: a door nobody looked at has not passed.
type Result struct {
	URL        string  `json:"url"`
	Outcome    string  `json:"outcome"`
	Detail     string  `json:"detail,omitempty"`
	Status     int     `json:"status,omitempty"`
	Body       *Report `json:"body,omitempty"`
	NextAction string  `json:"next_action,omitempty"`
}

// Options configure a probe. The zero value is usable: it talks to
// DefaultBase through http.DefaultClient with a 30 second ceiling.
type Options struct {
	Base    string
	Client  *http.Client
	Timeout time.Duration
}

func (o Options) base() string {
	if o.Base == "" {
		return DefaultBase
	}
	return strings.TrimRight(o.Base, "/")
}

func (o Options) client() *http.Client {
	if o.Client != nil {
		return o.Client
	}
	return http.DefaultClient
}

func (o Options) timeout() time.Duration {
	if o.Timeout == 0 {
		return 30 * time.Second
	}
	return o.Timeout
}

// One probes a single door through the store, keeping the response whole.
//
// It never returns an error: a store that did not answer is
// "store_unreachable", a refusal before probing is "refused", and
// everything else is the store's own verdict with its body beside it.
// An error return would invite a caller to treat a door it never saw as
// a door that passed.
func One(ctx context.Context, url string, opts Options) Result {
	payload, err := json.Marshal(map[string]string{"url": url})
	if err != nil {
		return Result{URL: url, Outcome: "store_unreachable", Detail: err.Error()}
	}

	ctx, cancel := context.WithTimeout(ctx, opts.timeout())
	defer cancel()

	endpoint := fmt.Sprintf("%s/api/preflight/%s", opts.base(), Battery)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return Result{URL: url, Outcome: "store_unreachable", Detail: err.Error()}
	}
	request.Header.Set("content-type", "application/json")
	request.Header.Set("user-agent", userAgent)
	request.Header.Set("accept", "application/json")

	response, err := opts.client().Do(request)
	if err != nil {
		return Result{URL: url, Outcome: "store_unreachable", Detail: err.Error()}
	}
	defer response.Body.Close()

	raw, _ := io.ReadAll(response.Body)
	report, decoded := decode(raw)

	if response.StatusCode == http.StatusTooManyRequests {
		suffix := ""
		if retry := response.Header.Get("retry-after"); retry != "" {
			suffix = fmt.Sprintf(", retry after %ss", retry)
		}
		return Result{
			URL:     url,
			Outcome: "store_unreachable",
			Detail:  fmt.Sprintf("the store's probe budget refused this call (429%s); nothing was probed", suffix),
			Status:  429,
			Body:    report,
		}
	}

	if response.StatusCode != http.StatusOK || report == nil || report.Verdict == "" {
		detail := fmt.Sprintf("the store answered %d without a verdict", response.StatusCode)
		next := ""
		if decoded != nil {
			if message, ok := decoded["error"].(string); ok && message != "" {
				detail = message
			}
			if action, ok := decoded["next_action"].(string); ok {
				next = action
			}
		}
		return Result{URL: url, Outcome: "refused", Detail: detail, Status: response.StatusCode, Body: report, NextAction: next}
	}

	return Result{URL: url, Outcome: report.Verdict, Status: 200, Body: report}
}

func decode(raw []byte) (*Report, map[string]any) {
	if len(raw) == 0 {
		return nil, nil
	}
	var loose map[string]any
	if err := json.Unmarshal(raw, &loose); err != nil {
		return nil, nil
	}
	var report Report
	if err := json.Unmarshal(raw, &report); err != nil {
		return nil, loose
	}
	report.Raw = loose
	return &report, loose
}

// Many probes every door, in order, one probe each.
//
// Serial on purpose, as in the other two clients: the store publishes a
// per-minute probe budget, and a client that fans out is a client that
// spends someone else's ceiling faster than it reads it.
func Many(ctx context.Context, urls []string, opts Options) []Result {
	results := make([]Result, 0, len(urls))
	for _, url := range urls {
		results = append(results, One(ctx, url, opts))
	}
	return results
}

// FailedChecks names the failed checks, from the store's own report.
func FailedChecks(report *Report) []string {
	if report == nil {
		return nil
	}
	var names []string
	for _, check := range report.Checks {
		if !check.OK {
			names = append(names, check.Name)
		}
	}
	return names
}

// Remediation returns the store's remediation rows, whole — never derived here.
func Remediation(report *Report) []RemediationRow {
	if report == nil {
		return nil
	}
	return report.Remediation
}

// ExitCodeFor is the deploy gate's law, as one function.
//
// "refused" is ExitUsage (nothing was probed, so a gate must not pass on
// a door nobody looked at); "store_unreachable" is ExitUnreachable; a
// verdict in failOn is ExitVerdictNegative; everything else ExitOK. A
// nil failOn means the default set, {"not_ready"}.
func ExitCodeFor(results []Result, failOn []string) int {
	if failOn == nil {
		failOn = []string{"not_ready"}
	}
	wanted := make(map[string]struct{}, len(failOn))
	for _, verdict := range failOn {
		wanted[verdict] = struct{}{}
	}
	for _, result := range results {
		if result.Outcome == "refused" {
			return ExitUsage
		}
	}
	for _, result := range results {
		if result.Outcome == "store_unreachable" {
			return ExitUnreachable
		}
	}
	for _, result := range results {
		if _, hit := wanted[result.Outcome]; hit {
			return ExitVerdictNegative
		}
	}
	return ExitOK
}

// WorstOutcome returns the worst outcome across doors, by Severity;
// store_unreachable counts as unreachable.
func WorstOutcome(results []Result) string {
	worst := "ready"
	for _, result := range results {
		outcome := result.Outcome
		if outcome == "store_unreachable" {
			outcome = "unreachable"
		}
		if rank(outcome) > rank(worst) {
			worst = outcome
		}
	}
	return worst
}

func rank(outcome string) int {
	for index, name := range Severity {
		if name == outcome {
			return index
		}
	}
	return -1
}

// RenderLines is one door's reading as lines a person reads: the
// verdict, every check, the advisories, the remediation.
func RenderLines(result Result) []string {
	head := fmt.Sprintf("%s: %s", result.URL, result.Outcome)
	if result.Detail != "" {
		head += " — " + result.Detail
	}
	lines := []string{head}
	if result.NextAction != "" {
		lines = append(lines, "  next: "+result.NextAction)
	}
	if result.Body == nil || result.Body.Verdict == "" {
		return lines
	}
	for _, check := range result.Body.Checks {
		mark := "FAIL"
		if check.OK {
			mark = "ok  "
		}
		lines = append(lines, fmt.Sprintf("  %s  %s: %s", mark, check.Name, check.Detail))
	}
	for _, advisory := range result.Body.Advisories {
		lines = append(lines, fmt.Sprintf("  NOTE  %s: %s", advisory.Name, advisory.Detail))
	}
	for _, row := range Remediation(result.Body) {
		lines = append(lines, fmt.Sprintf("  FIX   %s → %s (%s)", row.Signal, row.DefectClass, row.DefinitionURL))
		if row.Operator != "" {
			lines = append(lines, "        operator: "+row.Operator)
		}
		if row.Buyer != "" {
			lines = append(lines, "        buyer:    "+row.Buyer)
		}
	}
	return lines
}

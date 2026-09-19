package preflight

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The fixtures are read from the JavaScript package rather than copied:
// two copies of a recorded battery is two things to re-record, and the
// day one is re-recorded and the other is not is the day the clients
// disagree about what "ready" means.
func loadFixture(t *testing.T, name string) []byte {
	t.Helper()
	path := filepath.Join("..", "x402-preflight", "fixtures", name+".json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("reading fixture %s: %v", name, err)
	}
	var wrapper struct {
		Report json.RawMessage `json:"report"`
	}
	if err := json.Unmarshal(raw, &wrapper); err != nil {
		t.Fatalf("parsing fixture %s: %v", name, err)
	}
	return wrapper.Report
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func clientReturning(status int, body []byte, headers http.Header) *http.Client {
	return &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if headers == nil {
			headers = http.Header{}
		}
		return &http.Response{
			StatusCode: status,
			Body:       io.NopCloser(bytes.NewReader(body)),
			Header:     headers,
			Request:    request,
		}, nil
	})}
}

func TestReadyFixtureIsAVerdictNotARefusal(t *testing.T) {
	result := One(context.Background(), "https://example.test/x", Options{
		Client: clientReturning(200, loadFixture(t, "ready-would-sign"), nil),
	})
	if result.Outcome != "ready" {
		t.Fatalf("outcome = %q, want ready", result.Outcome)
	}
	if result.Status != 200 {
		t.Fatalf("status = %d, want 200", result.Status)
	}
	if got := FailedChecks(result.Body); len(got) != 0 {
		t.Fatalf("failed checks = %v, want none", got)
	}
}

func TestNotReadyFixtureNamesItsFailedChecks(t *testing.T) {
	result := One(context.Background(), "https://example.test/x", Options{
		Client: clientReturning(200, loadFixture(t, "accepts-empty"), nil),
	})
	if result.Outcome != "not_ready" {
		t.Fatalf("outcome = %q, want not_ready", result.Outcome)
	}
	if len(FailedChecks(result.Body)) == 0 {
		t.Fatal("the fixture should name at least one failed check")
	}
}

func TestUnreachableIsTheStoresVerdictNotAClientError(t *testing.T) {
	result := One(context.Background(), "https://example.test/x", Options{
		Client: clientReturning(200, loadFixture(t, "unreachable"), nil),
	})
	if result.Outcome != "unreachable" {
		t.Fatalf("outcome = %q, want unreachable", result.Outcome)
	}
	if result.Status != 200 {
		t.Fatalf("status = %d, want 200 — the store answered", result.Status)
	}
}

func TestRawKeepsFieldsThisClientDoesNotName(t *testing.T) {
	result := One(context.Background(), "https://example.test/x", Options{
		Client: clientReturning(200, loadFixture(t, "ready-would-sign"), nil),
	})
	if result.Body == nil || result.Body.Raw == nil {
		t.Fatal("Raw should carry the whole decoded body")
	}
	if _, ok := result.Body.Raw["reached_level"]; !ok {
		t.Fatal("Raw should keep reached_level, which this client does not name")
	}
}

func TestBudgetRefusalIsStoreUnreachableAndSaysNothingWasProbed(t *testing.T) {
	headers := http.Header{}
	headers.Set("retry-after", "60")
	result := One(context.Background(), "https://example.test/x", Options{
		Client: clientReturning(429, []byte(`{"error":"budget_spent"}`), headers),
	})
	if result.Outcome != "store_unreachable" {
		t.Fatalf("outcome = %q, want store_unreachable", result.Outcome)
	}
	if !strings.Contains(result.Detail, "nothing was probed") {
		t.Fatalf("detail = %q, want it to say nothing was probed", result.Detail)
	}
	if !strings.Contains(result.Detail, "60") {
		t.Fatalf("detail = %q, want the retry-after seconds", result.Detail)
	}
}

func TestABodyWithoutAVerdictIsRefused(t *testing.T) {
	result := One(context.Background(), "https://example.test/x", Options{
		Client: clientReturning(400, []byte(`{"error":"url_missing","next_action":"send a url"}`), nil),
	})
	if result.Outcome != "refused" {
		t.Fatalf("outcome = %q, want refused", result.Outcome)
	}
	if result.Detail != "url_missing" {
		t.Fatalf("detail = %q, want the store's own error", result.Detail)
	}
	if result.NextAction != "send a url" {
		t.Fatalf("next action = %q", result.NextAction)
	}
}

func TestAStoreThatNeverAnsweredIsStoreUnreachable(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("connection reset")
	})}
	result := One(context.Background(), "https://example.test/x", Options{Client: client})
	if result.Outcome != "store_unreachable" {
		t.Fatalf("outcome = %q, want store_unreachable", result.Outcome)
	}
	if result.Status != 0 {
		t.Fatalf("status = %d, want 0 — nothing answered", result.Status)
	}
}

// The law is typed once, in ../x402-preflight/fixtures/exit-law.json,
// and read by all three clients (2026-09-19): a title claiming the
// ports agree is only true while one table feeds every suite. The
// integers are the boundary; the named constants stay here and are
// held to the fixture below.
type exitLawFixture struct {
	Cases []struct {
		Name     string   `json:"name"`
		Outcomes []string `json:"outcomes"`
		FailOn   []string `json:"fail_on"`
		Exit     int      `json:"exit"`
	} `json:"cases"`
	Worst []struct {
		Name     string   `json:"name"`
		Outcomes []string `json:"outcomes"`
		Worst    string   `json:"worst"`
	} `json:"worst"`
}

func loadExitLaw(t *testing.T) exitLawFixture {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("..", "x402-preflight", "fixtures", "exit-law.json"))
	if err != nil {
		t.Fatalf("reading the exit law: %v", err)
	}
	var law exitLawFixture
	if err := json.Unmarshal(raw, &law); err != nil {
		t.Fatalf("decoding the exit law: %v", err)
	}
	if len(law.Cases) < 7 || len(law.Worst) < 2 {
		t.Fatalf("the exit law fixture is too small to be the law: %d cases, %d worst", len(law.Cases), len(law.Worst))
	}
	return law
}

func resultsOf(outcomes []string) []Result {
	results := make([]Result, 0, len(outcomes))
	for i, outcome := range outcomes {
		results = append(results, Result{URL: string(rune('a' + i)), Outcome: outcome})
	}
	return results
}

func TestExitLawMatchesTheOtherClients(t *testing.T) {
	law := loadExitLaw(t)
	seen := map[int]bool{}
	for _, testCase := range law.Cases {
		seen[testCase.Exit] = true
		t.Run(testCase.Name, func(t *testing.T) {
			// A null fail_on in the fixture is a nil slice here: the client's default set.
			if got := ExitCodeFor(resultsOf(testCase.Outcomes), testCase.FailOn); got != testCase.Exit {
				t.Fatalf("exit = %d, want %d", got, testCase.Exit)
			}
		})
	}
	for _, code := range []int{ExitOK, ExitVerdictNegative, ExitUsage, ExitUnreachable} {
		if !seen[code] {
			t.Fatalf("the fixture never exercises exit %d", code)
		}
	}
	for _, testCase := range law.Worst {
		t.Run(testCase.Name, func(t *testing.T) {
			if got := WorstOutcome(resultsOf(testCase.Outcomes)); got != testCase.Worst {
				t.Fatalf("worst = %q, want %q", got, testCase.Worst)
			}
		})
	}
}

func TestWorstOutcomeFoldsStoreUnreachableIntoUnreachable(t *testing.T) {
	if got := WorstOutcome([]Result{{Outcome: "ready"}}); got != "ready" {
		t.Fatalf("worst = %q, want ready", got)
	}
	if got := WorstOutcome([]Result{{Outcome: "ready"}, {Outcome: "store_unreachable"}}); got != "unreachable" {
		t.Fatalf("worst = %q, want unreachable", got)
	}
	if got := WorstOutcome([]Result{{Outcome: "unreachable"}, {Outcome: "not_ready"}}); got != "not_ready" {
		t.Fatalf("worst = %q, want not_ready", got)
	}
}

func TestRenderLinesPrintsChecks(t *testing.T) {
	result := One(context.Background(), "https://example.test/x", Options{
		Client: clientReturning(200, loadFixture(t, "accepts-empty"), nil),
	})
	lines := RenderLines(result)
	if !strings.HasPrefix(lines[0], "https://example.test/x: not_ready") {
		t.Fatalf("first line = %q", lines[0])
	}
	found := false
	for _, line := range lines {
		if strings.Contains(line, "FAIL") {
			found = true
		}
	}
	if !found {
		t.Fatal("expected at least one FAIL line")
	}
}

func TestBaseOriginTrailingSlashesAreTrimmed(t *testing.T) {
	var seen string
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		seen = request.URL.String()
		return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewReader(loadFixture(t, "ready-would-sign"))), Header: http.Header{}, Request: request}, nil
	})}
	One(context.Background(), "https://example.test/x", Options{Base: "https://mirror.test///", Client: client})
	if seen != "https://mirror.test/api/preflight/v2" {
		t.Fatalf("endpoint = %q", seen)
	}
}

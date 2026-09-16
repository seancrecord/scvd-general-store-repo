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

func TestExitLawMatchesTheOtherClients(t *testing.T) {
	ready := Result{URL: "a", Outcome: "ready"}
	notReady := Result{URL: "b", Outcome: "not_ready"}
	unreachable := Result{URL: "c", Outcome: "unreachable"}
	refused := Result{URL: "d", Outcome: "refused"}
	down := Result{URL: "e", Outcome: "store_unreachable"}

	cases := []struct {
		name    string
		results []Result
		failOn  []string
		want    int
	}{
		{"all ready", []Result{ready}, nil, ExitOK},
		{"a not_ready fails", []Result{ready, notReady}, nil, ExitVerdictNegative},
		// unreachable is a fact about the network path, not the door,
		// so it does not fail a gate unless the caller asks it to.
		{"unreachable passes by default", []Result{ready, unreachable}, nil, ExitOK},
		{"unreachable fails when asked", []Result{ready, unreachable}, []string{"not_ready", "unreachable"}, ExitVerdictNegative},
		// A door nobody looked at must not pass a gate.
		{"refused is usage", []Result{ready, refused}, nil, ExitUsage},
		{"store down is unreachable", []Result{ready, down}, nil, ExitUnreachable},
		{"refused outranks store down", []Result{refused, down}, nil, ExitUsage},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := ExitCodeFor(testCase.results, testCase.failOn); got != testCase.want {
				t.Fatalf("exit = %d, want %d", got, testCase.want)
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

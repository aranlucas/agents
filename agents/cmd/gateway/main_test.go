package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"iter"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"agents/fitness"
	"agents/grocery"
	"agents/internal/agentruntime"
	"agents/internal/agui"
	"agents/internal/auth"
	"agents/internal/catalog"
	"agents/internal/clerk"
	"agents/internal/config"
	"agents/internal/telegram"
	"agents/presentation"
	"agents/resume"
	"agents/travel"
	"agents/trends"
	"agents/wellness"
	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/model/gemini"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

func TestOralboardsGeminiRetryPolicyMatchesProviderGuidance(t *testing.T) {
	retry := oralboardsGeminiClientConfig("test-key").HTTPOptions.RetryOptions
	if retry == nil {
		t.Fatal("retry options are nil")
	}
	if retry.Attempts != nil || retry.InitialDelay != nil || retry.MaxDelay != nil || retry.ExpBase != nil || retry.Jitter != nil || len(retry.HTTPStatusCodes) != 0 {
		t.Fatalf("retry options override provider defaults: %#v", retry)
	}
}

func TestOralboardsGeminiRetriesTemporaryUnavailableResponse(t *testing.T) {
	for _, status := range []int{408, 429, 500, 502, 503, 504} {
		for _, stream := range []bool{false, true} {
			name := fmt.Sprintf("%d/%s", status, map[bool]string{false: "unary", true: "streaming"}[stream])
			t.Run(name, func(t *testing.T) {
				var calls atomic.Int32
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
					if calls.Add(1) == 1 {
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(status)
						_, _ = fmt.Fprintf(w, `{"error":{"code":%d,"message":"Temporary provider failure.","status":"UNAVAILABLE"}}`, status)
						return
					}
					response := `{"candidates":[{"content":{"role":"model","parts":[{"text":"Recovered examiner response"}]},"finishReason":"STOP"}]}`
					if stream {
						w.Header().Set("Content-Type", "text/event-stream")
						_, _ = io.WriteString(w, "data: "+response+"\n\n")
						return
					}
					w.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(w, response)
				}))
				defer server.Close()

				llm := newImmediateRetryGeminiModel(t, server.URL)
				var responseText string
				for response, generateErr := range llm.GenerateContent(t.Context(), &model.LLMRequest{
					Contents: genai.Text("Continue the oral-board examination."),
				}, stream) {
					if generateErr != nil {
						t.Fatalf("model call did not recover from HTTP %d: %v", status, generateErr)
					}
					if response != nil && response.Content != nil && len(response.Content.Parts) > 0 {
						responseText = response.Content.Parts[0].Text
					}
				}
				if calls.Load() != 2 || responseText != "Recovered examiner response" {
					t.Fatalf("calls = %d, response = %q", calls.Load(), responseText)
				}
			})
		}
	}
}

func TestOralboardsGeminiDoesNotRetryPermanentResponse(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"code":400,"message":"Invalid request.","status":"INVALID_ARGUMENT"}}`)
	}))
	defer server.Close()

	llm := newImmediateRetryGeminiModel(t, server.URL)
	var modelErr error
	for _, err := range llm.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("invalid")}, false) {
		modelErr = err
	}
	if modelErr == nil {
		t.Fatal("permanent response returned no error")
	}
	if calls.Load() != 1 {
		t.Fatalf("permanent response calls = %d, want 1", calls.Load())
	}
}

func TestOralboardsGeminiStopsAfterDocumentedAttemptLimit(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, `{"error":{"code":503,"message":"High demand.","status":"UNAVAILABLE"}}`)
	}))
	defer server.Close()

	llm := newImmediateRetryGeminiModel(t, server.URL)
	var modelErr error
	for _, err := range llm.GenerateContent(t.Context(), &model.LLMRequest{Contents: genai.Text("retry")}, false) {
		modelErr = err
	}
	if modelErr == nil {
		t.Fatal("exhausted retry response returned no error")
	}
	if calls.Load() != 5 {
		t.Fatalf("exhausted retry calls = %d, want 5", calls.Load())
	}
}

func newImmediateRetryGeminiModel(t *testing.T, baseURL string) model.LLM {
	t.Helper()
	config := oralboardsGeminiClientConfig("test-key")
	config.HTTPOptions.BaseURL = baseURL
	config.HTTPOptions.RetryOptions.InitialDelay = genai.Ptr(0.0)
	config.HTTPOptions.RetryOptions.MaxDelay = genai.Ptr(0.0)
	config.HTTPOptions.RetryOptions.Jitter = genai.Ptr(0.0)
	llm, err := gemini.NewModel(t.Context(), "test-model", config)
	if err != nil {
		t.Fatal(err)
	}
	return llm
}

func TestFrontendAgentIDUsesCatalogIdentity(t *testing.T) {
	for _, spec := range catalog.All() {
		if got := frontendAgentID(spec.Route); got != spec.ClientID {
			t.Errorf("frontendAgentID(%q) = %q, want %q", spec.Route, got, spec.ClientID)
		}
	}
	if got := frontendAgentID("custom"); got != "custom" {
		t.Errorf("frontendAgentID(custom) = %q, want custom", got)
	}
}

func TestEveryActiveAgentExposesScopedEndpoints(t *testing.T) {
	routes := []string{"travel", "trends", "grocery", "fitness", "wellness", "expense", "oralboards", "presentation", "research", "spreadsheet", "resume", "jobs", "interview"}
	entries := make([]agentruntime.Entry, 0, len(routes))
	for _, route := range routes {
		built, err := llmagent.New(llmagent.Config{Name: strings.ReplaceAll(route, "-", "_") + "_contract_agent", Instruction: "contract", Model: fakeResumeModel{}})
		if err != nil {
			t.Fatal(err)
		}
		entries = append(entries, agentruntime.Entry{Route: route, AppName: built.Name(), Agent: built, Public: route == "resume", Health: func(context.Context) error { return nil }})
	}
	registry, err := agentruntime.NewRegistry(entries...)
	if err != nil {
		t.Fatal(err)
	}
	got := make([]string, 0, len(routes))
	for _, entry := range registry.Entries() {
		got = append(got, entry.Route)
	}
	want := append([]string(nil), routes...)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Fatalf("registry routes=%#v want=%#v", got, want)
	}
	sessions := session.InMemoryService()
	for _, entry := range registry.Entries() {
		if _, createErr := sessions.Create(t.Context(), &session.CreateRequest{AppName: entry.AppName, UserID: "clerk-user", SessionID: "contract-thread", State: entry.StateDefaults()}); createErr != nil {
			t.Fatal(createErr)
		}
		if entry.Public {
			if _, createErr := sessions.Create(t.Context(), &session.CreateRequest{AppName: entry.AppName, UserID: "anon:contract-thread", SessionID: "contract-thread", State: entry.StateDefaults()}); createErr != nil {
				t.Fatal(createErr)
			}
		}
	}
	handler, err := New(config.Config{HTTP: config.HTTP{}}, Dependencies{Registry: registry, Sessions: sessions, Verifier: acceptingVerifier{}, Groceries: &fakeGroceryRepository{}, Now: time.Now})
	if err != nil {
		t.Fatal(err)
	}
	for _, route := range routes {
		for _, suffix := range []string{"/health", "/agui/capabilities"} {
			request := httptest.NewRequest(http.MethodGet, "/"+route+suffix, nil)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusOK {
				t.Fatalf("GET /%s%s=%d %s", route, suffix, recorder.Code, recorder.Body.String())
			}
		}
		request := httptest.NewRequest(http.MethodPost, "/"+route+"/agents/state", strings.NewReader(`{"threadId":"contract-thread"}`))
		request.Header.Set("Authorization", "Bearer test")
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("POST /%s/agents/state=%d %s", route, recorder.Code, recorder.Body.String())
		}
		request = httptest.NewRequest(http.MethodPost, "/agent/"+frontendAgentID(route)+"/suggest", strings.NewReader(`{"threadId":"suggestion-thread","runId":"suggestion-run","messages":[]}`))
		if route != "resume" {
			request.Header.Set("Authorization", "Bearer test")
		}
		recorder = httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("POST /agent/%s/suggest=%d %s", frontendAgentID(route), recorder.Code, recorder.Body.String())
		}
		request = httptest.NewRequest(http.MethodPost, "/agent/"+frontendAgentID(route)+"/run", strings.NewReader(`{"threadId":"contract-thread","runId":"runtime-run","messages":[]}`))
		if route != "resume" {
			request.Header.Set("Authorization", "Bearer test")
		}
		recorder = httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "RUN_FINISHED") {
			t.Fatalf("POST /agent/%s/run=%d %s", frontendAgentID(route), recorder.Code, recorder.Body.String())
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/agents/state", strings.NewReader(`{"threadId":"contract-thread"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("root state endpoint=%d", recorder.Code)
	}
	request = httptest.NewRequest(http.MethodGet, "/travel/agents/sessions", nil)
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("removed sessions endpoint=%d", recorder.Code)
	}
}

func TestLinkConsumeRejectsWrongSharedSecret(t *testing.T) {
	handler := telegramLinkConsumeHandler("correct", nil)
	request := httptest.NewRequest(http.MethodPost, "/telegram/link/consume", strings.NewReader(`{"token":"raw","clerk_user_id":"user"}`))
	request.Header.Set("x-telegram-link-secret", "wrong")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestLinkConsumeRejectsMultipleOrOversizedJSONDocuments(t *testing.T) {
	handler := telegramLinkConsumeHandler("correct", nil)
	for name, body := range map[string]string{
		"multiple documents": `{"token":"raw","clerk_user_id":"user"}{}`,
		"oversized":          `{"token":"raw","clerk_user_id":"user"}` + strings.Repeat(" ", 8<<10),
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/telegram/link/consume", strings.NewReader(body))
			request.Header.Set("x-telegram-link-secret", "correct")
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

type fakeTelegramLinkLookup struct {
	link   telegram.AccountLink
	linked bool
	err    error
}

func (f fakeTelegramLinkLookup) Lookup(context.Context, int64) (telegram.AccountLink, bool, error) {
	return f.link, f.linked, f.err
}

func TestLinkResolveUsesD1AccountLink(t *testing.T) {
	handler := telegramLinkResolveHandler("correct", fakeTelegramLinkLookup{
		link: telegram.AccountLink{
			TelegramUserID: 42,
			TelegramChatID: 42,
			ClerkUserID:    "user_real_123",
			LinkedAt:       time.Now().UnixMilli(),
		},
		linked: true,
	})
	request := httptest.NewRequest(http.MethodPost, "/telegram/link/resolve", strings.NewReader(`{"telegram_user_id":42}`))
	request.Header.Set("x-telegram-link-secret", "correct")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"clerk_user_id":"user_real_123"`) {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestLinkResolveFailsClosed(t *testing.T) {
	tests := []struct {
		name   string
		secret string
		body   string
		lookup fakeTelegramLinkLookup
		want   int
	}{
		{name: "wrong secret", secret: "wrong", body: `{"telegram_user_id":42}`, want: http.StatusUnauthorized},
		{name: "invalid identity", secret: "correct", body: `{"telegram_user_id":0}`, want: http.StatusBadRequest},
		{name: "unknown field", secret: "correct", body: `{"telegram_user_id":42,"extra":true}`, want: http.StatusBadRequest},
		{name: "not linked", secret: "correct", body: `{"telegram_user_id":42}`, want: http.StatusNotFound},
		{name: "D1 unavailable", secret: "correct", body: `{"telegram_user_id":42}`, lookup: fakeTelegramLinkLookup{err: errors.New("D1 unavailable")}, want: http.StatusServiceUnavailable},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := telegramLinkResolveHandler("correct", test.lookup)
			request := httptest.NewRequest(http.MethodPost, "/telegram/link/resolve", strings.NewReader(test.body))
			request.Header.Set("x-telegram-link-secret", test.secret)
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != test.want {
				t.Fatalf("status=%d want=%d body=%s", recorder.Code, test.want, recorder.Body.String())
			}
			if strings.Contains(recorder.Body.String(), "clerk_user_id") {
				t.Fatalf("failure leaked linked identity: %s", recorder.Body.String())
			}
		})
	}
}

// fakeResumeModel is a minimal model.LLM double satisfying resume.New's
// signature; the routing tests below never trigger a model call.
type fakeResumeModel struct{}

func (fakeResumeModel) Name() string { return "fake-resume-model" }

func (fakeResumeModel) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "ok"}}}, TurnComplete: true}, nil)
	}
}

// fakeHealth is a healthChecker double so tests never touch real D1/R2.
type fakeHealth struct{ err error }

func (f fakeHealth) Health(context.Context) error { return f.err }

func newGateway(t *testing.T) http.Handler {
	t.Helper()
	resumeAgent, err := resume.New(fakeResumeModel{})
	if err != nil {
		t.Fatalf("build resume agent: %v", err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route:   "resume",
		AppName: resume.AppName,
		Agent:   resumeAgent,
		Public:  true,
		Timeout: 5 * time.Second,
		Health:  resumeHealth(fakeResumeModel{}),
	})
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}
	sessions := session.InMemoryService()
	// assertRoute's POST fixture body always carries threadId
	// "route-test-thread"; pre-create the matching session (public/
	// anonymous identity, so the D1-shaped user ID is "anon:<threadId>",
	// see effectiveUserID in internal/agui/handler.go) so
	// /resume/agents/state exercises its normal "thread exists" path
	// instead of a lookup error. session.InMemoryService's not-found error
	// isn't agui.ErrSessionNotFound (only the production
	// cloudflare.SessionService returns that), so relying on the not-found
	// branch here would instead hit StateHandler's genuine-error 500 path.
	if _, err := sessions.Create(context.Background(), &session.CreateRequest{
		AppName: resume.AppName, UserID: "anon:route-test-thread", SessionID: "route-test-thread",
	}); err != nil {
		t.Fatalf("seed route-test-thread session: %v", err)
	}

	cfg := config.Config{HTTP: config.HTTP{Origins: []string{"http://localhost:3000"}}}
	handler, err := New(cfg, Dependencies{
		Registry:  registry,
		Sessions:  sessions,
		D1:        fakeHealth{},
		R2:        fakeHealth{},
		Groceries: &fakeGroceryRepository{},
		Now:       time.Now,
	})
	if err != nil {
		t.Fatalf("build gateway: %v", err)
	}
	return handler
}

func TestGatewayRegistersOnlyScopedStateRoutes(t *testing.T) {
	h := newGateway(t)
	assertRoute(t, h, http.MethodGet, "/info", http.StatusOK)
	assertRoute(t, h, http.MethodGet, "/resume/health", http.StatusOK)
	assertRoute(t, h, http.MethodGet, "/resume/agui/capabilities", http.StatusOK)
	assertSuggestionRoute(t, h, "/agent/resume/run", "", http.StatusOK)
	assertSuggestionRoute(t, h, "/agent/resume/connect", "", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/agent/resume/stop/route-test-thread", http.StatusOK)
	assertSuggestionRoute(t, h, "/agent/resume/suggest", "", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/resume/agents/state", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/agents/state", http.StatusNotFound)
}

func TestGatewayRejectsUnauthenticatedNonPublicRoute(t *testing.T) {
	resumeAgent, err := resume.New(fakeResumeModel{})
	if err != nil {
		t.Fatalf("build resume agent: %v", err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "travel", AppName: "travel_agent", Agent: resumeAgent, Public: false, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}
	cfg := config.Config{HTTP: config.HTTP{Origins: []string{"http://localhost:3000"}}}
	handler, err := New(cfg, Dependencies{Registry: registry, Sessions: session.InMemoryService(), Groceries: &fakeGroceryRepository{}, Now: time.Now})
	if err != nil {
		t.Fatalf("build gateway: %v", err)
	}
	assertRoute(t, handler, http.MethodPost, "/travel/agui", http.StatusUnauthorized)
	assertSuggestionRoute(t, handler, "/agent/travel/run", "", http.StatusUnauthorized)
	assertSuggestionRoute(t, handler, "/agent/travel/connect", "", http.StatusUnauthorized)
	assertRoute(t, handler, http.MethodPost, "/agent/travel/stop/thread-123", http.StatusUnauthorized)
	assertSuggestionRoute(t, handler, "/agent/travel/suggest", "", http.StatusUnauthorized)
	assertRoute(t, handler, http.MethodGet, "/threads?agentId=travel", http.StatusUnauthorized)
	assertRoute(t, handler, http.MethodPost, "/travel/agents/state", http.StatusUnauthorized)
	// Capabilities and health are metadata, not user data: never gated.
	assertRoute(t, handler, http.MethodGet, "/travel/health", http.StatusOK)
	assertRoute(t, handler, http.MethodGet, "/travel/agui/capabilities", http.StatusOK)
}

func TestRuntimeInfoAdvertisesConcreteAgents(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/info", nil)
	recorder := httptest.NewRecorder()
	newGateway(t).ServeHTTP(recorder, request)

	var response struct {
		Version                       string                     `json:"version"`
		Agents                        map[string]json.RawMessage `json:"agents"`
		AudioFileTranscriptionEnabled bool                       `json:"audioFileTranscriptionEnabled"`
		Mode                          string                     `json:"mode"`
		ThreadEndpoints               struct {
			List             bool `json:"list"`
			Inspect          bool `json:"inspect"`
			Mutations        bool `json:"mutations"`
			RealtimeMetadata bool `json:"realtimeMetadata"`
		} `json:"threadEndpoints"`
		Suggestions             bool `json:"suggestions"`
		A2UIEnabled             bool `json:"a2uiEnabled"`
		OpenGenerativeUIEnabled bool `json:"openGenerativeUIEnabled"`
		TelemetryDisabled       bool `json:"telemetryDisabled"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if recorder.Code != http.StatusOK || response.Version != agui.CopilotKitRuntimeVersion || !response.Suggestions || response.Mode != "sse" || len(response.Agents) != 1 || response.Agents["resume"] == nil {
		t.Fatalf("response = %d %#v", recorder.Code, response)
	}
	if !response.ThreadEndpoints.List || response.ThreadEndpoints.Inspect || response.ThreadEndpoints.Mutations || response.ThreadEndpoints.RealtimeMetadata {
		t.Fatalf("only read-only thread listing must be enabled: %#v", response.ThreadEndpoints)
	}
	if response.AudioFileTranscriptionEnabled || response.A2UIEnabled || response.OpenGenerativeUIEnabled || response.TelemetryDisabled {
		t.Fatalf("unsupported runtime capabilities were advertised: %#v", response)
	}
}

type acceptingVerifier struct{}

func (acceptingVerifier) Verify(context.Context, string) (auth.Identity, error) {
	return auth.Identity{UserID: "clerk-user"}, nil
}

type fakeClerkBackend struct {
	connections clerk.ConnectionState
	lookups     []string
	err         error
}

func (f *fakeClerkBackend) OAuthConnections(_ context.Context, userID string) (clerk.ConnectionState, error) {
	f.lookups = append(f.lookups, userID)
	return f.connections, f.err
}

func TestOAuthCredentialsAreResolvedAfterClerkAuthentication(t *testing.T) {
	for _, path := range []string{"/grocery/agui", "/agent/grocery/run"} {
		t.Run(path, func(t *testing.T) {
			backend := &fakeClerkBackend{connections: clerk.ConnectionState{
				KrogerToken: "kroger-secret",
			}}
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if got := r.Header.Get("X-Kroger-Access-Token"); got != "kroger-secret" {
					t.Errorf("Kroger token = %q", got)
				}
				w.WriteHeader(http.StatusNoContent)
			})
			handler := auth.RequireIdentity(nil, withOAuthCredentials(backend, nil, next), acceptingVerifier{})
			request := httptest.NewRequest(http.MethodPost, path, nil)
			request.Header.Set("Authorization", "Bearer clerk-session")
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusNoContent {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if !slices.Equal(backend.lookups, []string{"clerk-user"}) {
				t.Fatalf("Clerk lookups=%v", backend.lookups)
			}
		})
	}
}

func TestOAuthCredentialsSkipRoutesWithoutProviderTools(t *testing.T) {
	for _, path := range []string{"/travel/agui", "/fitness/agui", "/agent/travel/run"} {
		t.Run(path, func(t *testing.T) {
			backend := &fakeClerkBackend{}
			handler := auth.RequireIdentity(nil, withOAuthCredentials(backend, nil, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			})), acceptingVerifier{})
			request := httptest.NewRequest(http.MethodPost, path, nil)
			request.Header.Set("Authorization", "Bearer clerk-session")
			recorder := httptest.NewRecorder()

			handler.ServeHTTP(recorder, request)

			if recorder.Code != http.StatusNoContent {
				t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
			}
			if len(backend.lookups) != 0 {
				t.Fatalf("unexpected Clerk lookups=%v", backend.lookups)
			}
		})
	}
}

func TestOAuthCredentialsStripUntrustedHeaderWhenDisconnected(t *testing.T) {
	backend := &fakeClerkBackend{}
	handler := auth.RequireIdentity(nil, withOAuthCredentials(backend, nil, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if token := r.Header.Get("X-Kroger-Access-Token"); token != "" {
			t.Errorf("untrusted Kroger token forwarded: %q", token)
		}
		w.WriteHeader(http.StatusNoContent)
	})), acceptingVerifier{})
	request := httptest.NewRequest(http.MethodPost, "/grocery/agui", nil)
	request.Header.Set("Authorization", "Bearer clerk-session")
	request.Header.Set("X-Kroger-Access-Token", "client-supplied")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestOAuthCredentialLookupFailuresStopTheRequest(t *testing.T) {
	backend := &fakeClerkBackend{err: errors.New("Clerk unavailable")}
	nextCalled := false
	handler := auth.RequireIdentity(nil, withOAuthCredentials(backend, nil, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		nextCalled = true
	})), acceptingVerifier{})
	request := httptest.NewRequest(http.MethodPost, "/grocery/agui", nil)
	request.Header.Set("Authorization", "Bearer clerk-session")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable || recorder.Body.String() != "{\"error\":\"oauth_credentials_unavailable\"}\n" {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if nextCalled {
		t.Fatal("request continued without resolved OAuth credentials")
	}
}

func TestGatewayPresentationAGUIRoute(t *testing.T) {
	presentationAgent, err := presentation.New(fakeResumeModel{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{Route: "presentation", AppName: presentation.AppName, Agent: presentationAgent, StateDefaults: presentation.StateDefaults, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	if _, err := sessions.Create(context.Background(), &session.CreateRequest{AppName: presentation.AppName, UserID: "clerk-user", SessionID: "presentation-thread", State: presentation.StateDefaults()}); err != nil {
		t.Fatal(err)
	}
	handler, err := New(config.Config{HTTP: config.HTTP{}}, Dependencies{Registry: registry, Sessions: sessions, Verifier: acceptingVerifier{}, Groceries: &fakeGroceryRepository{}, Now: time.Now})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/presentation/agui", strings.NewReader(`{"threadId":"presentation-thread","runId":"run-1","state":{},"messages":[{"id":"m1","role":"user","content":"Build a deck"}],"tools":[],"context":[],"forwardedProps":{}}`))
	request.Header.Set("Authorization", "Bearer test")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), "RUN_STARTED") || !strings.Contains(recorder.Body.String(), "RUN_FINISHED") {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestGatewayTravelRouteUsesExistingAGUIContract(t *testing.T) {
	travelAgent, err := travel.New(fakeResumeModel{})
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{Route: "travel", AppName: travel.AppName, Agent: travelAgent, StateDefaults: travel.StateDefaults, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	handler, err := New(config.Config{HTTP: config.HTTP{}}, Dependencies{Registry: registry, Sessions: session.InMemoryService(), Verifier: acceptingVerifier{}, Groceries: &fakeGroceryRepository{}, Now: time.Now})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/travel/agui/capabilities", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"persistentState":true`) || !strings.Contains(recorder.Body.String(), `"clientProvided":true`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestGatewayFitnessAndGroceryRoutesUseExistingAGUIContract(t *testing.T) {
	fitnessAgent, err := fitness.New(fakeResumeModel{}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	groceryAgent, err := grocery.New(fakeResumeModel{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(
		agentruntime.Entry{Route: "fitness", AppName: fitness.AppName, Agent: fitnessAgent, StateDefaults: fitness.StateDefaults, Timeout: 5 * time.Second},
		agentruntime.Entry{Route: "grocery", AppName: grocery.AppName, Agent: groceryAgent, StateDefaults: grocery.StateDefaults, Timeout: 5 * time.Second},
	)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := New(config.Config{HTTP: config.HTTP{}}, Dependencies{Registry: registry, Sessions: session.InMemoryService(), Verifier: acceptingVerifier{}, Groceries: &fakeGroceryRepository{}, Now: time.Now})
	if err != nil {
		t.Fatal(err)
	}
	for _, route := range []string{"fitness", "grocery"} {
		request := httptest.NewRequest(http.MethodGet, "/"+route+"/agui/capabilities", nil)
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"persistentState":true`) || !strings.Contains(recorder.Body.String(), `"clientProvided":true`) {
			t.Fatalf("%s response = %d %s", route, recorder.Code, recorder.Body.String())
		}
	}
}

func TestGatewayTrendsRouteUsesExistingAGUIContract(t *testing.T) {
	generatorAgent, err := trends.NewGenerator(fakeResumeModel{})
	if err != nil {
		t.Fatal(err)
	}
	trendsAgent, err := trends.New(fakeResumeModel{}, generatorAgent, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(
		agentruntime.Entry{Route: "trends", AppName: trends.AppName, Agent: trendsAgent, StateDefaults: trends.StateDefaults, Timeout: 5 * time.Second},
	)
	if err != nil {
		t.Fatal(err)
	}
	handler, err := New(config.Config{HTTP: config.HTTP{}}, Dependencies{Registry: registry, Sessions: session.InMemoryService(), Verifier: acceptingVerifier{}, Groceries: &fakeGroceryRepository{}, Now: time.Now})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/trends/agui/capabilities", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"persistentState":true`) || !strings.Contains(recorder.Body.String(), `"clientProvided":true`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestGatewayWellnessRouteUsesExistingAGUIContract(t *testing.T) {
	fitnessAgent, err := fitness.NewTask(fakeResumeModel{}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	groceryAgent, err := grocery.NewTask(fakeResumeModel{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	wellnessAgent, err := wellness.New(wellness.ModelSet{Coordinator: fakeResumeModel{}}, fitnessAgent, groceryAgent)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{Route: "wellness", AppName: wellness.AppName, Agent: wellnessAgent, StateDefaults: wellness.StateDefaults, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	handler, err := New(config.Config{HTTP: config.HTTP{}}, Dependencies{Registry: registry, Sessions: session.InMemoryService(), Verifier: acceptingVerifier{}, Groceries: &fakeGroceryRepository{}, Now: time.Now})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/wellness/agui/capabilities", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"persistentState":true`) || !strings.Contains(recorder.Body.String(), `"clientProvided":true`) {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
}

func TestGatewayRootHealthChecksD1AndR2WithoutCredentials(t *testing.T) {
	h := newGateway(t)
	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	checks, ok := got["checks"].(map[string]any)
	if !ok || checks["d1"] != "ok" || checks["r2"] != "ok" {
		t.Fatalf("checks = %#v", got["checks"])
	}
	for _, forbidden := range []string{"token", "secret", "key", "credential"} {
		if strings.Contains(strings.ToLower(rr.Body.String()), forbidden) {
			t.Fatalf("health response leaked a credential-shaped field: %s", rr.Body.String())
		}
	}
	assertRoute(t, h, http.MethodGet, "/health", http.StatusOK)
	assertRoute(t, h, http.MethodGet, "/live", http.StatusOK)
}

func TestGatewayRootHealthReportsDegradedOnFailingCheck(t *testing.T) {
	resumeAgent, err := resume.New(fakeResumeModel{})
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "resume", AppName: resume.AppName, Agent: resumeAgent, Public: true, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{HTTP: config.HTTP{Origins: nil}}
	handler, err := New(cfg, Dependencies{
		Registry: registry, Sessions: session.InMemoryService(),
		D1: fakeHealth{err: context.DeadlineExceeded}, R2: fakeHealth{}, Groceries: &fakeGroceryRepository{}, Now: time.Now,
	})
	if err != nil {
		t.Fatal(err)
	}
	assertRoute(t, handler, http.MethodGet, "/ready", http.StatusServiceUnavailable)
	assertRoute(t, handler, http.MethodGet, "/health", http.StatusServiceUnavailable)
	assertRoute(t, handler, http.MethodGet, "/live", http.StatusOK)
}

func assertRoute(t *testing.T, h http.Handler, method, path string, want int) {
	t.Helper()
	var body io.Reader
	if method == http.MethodPost {
		body = strings.NewReader(`{"threadId":"route-test-thread"}`)
	}
	req := httptest.NewRequest(method, path, body)
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != want {
		t.Fatalf("%s %s = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
	}
}

func assertSuggestionRoute(t *testing.T, h http.Handler, path, token string, want int) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"threadId":"route-test-thread","runId":"route-test-run","messages":[]}`))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != want {
		t.Fatalf("POST %s = %d, want %d: %s", path, rr.Code, want, rr.Body.String())
	}
}

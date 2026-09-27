package gateway

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"io"
	"iter"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/agentruntime"
	"github.com/aranlucas/agents/internal/agui"
	"github.com/aranlucas/agents/internal/auth"
	"github.com/aranlucas/agents/internal/catalog"
	"github.com/aranlucas/agents/internal/clerk"
	"github.com/aranlucas/agents/internal/config"
	"github.com/aranlucas/agents/internal/fitness"
	"github.com/aranlucas/agents/internal/grocery"
	"github.com/aranlucas/agents/internal/presentation"
	"github.com/aranlucas/agents/internal/telegram"
	"github.com/aranlucas/agents/internal/travel"
	"github.com/aranlucas/agents/internal/trends"
	"github.com/aranlucas/agents/internal/wellness"
	"google.golang.org/adk/v2/agent"

	"google.golang.org/adk/v2/agent/llmagent"
	"google.golang.org/adk/v2/model"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

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
	routes := []string{"travel", "trends", "grocery", "fitness", "wellness", "expense", "oralboards", "presentation", "research", "spreadsheet", "jobs", "interview"}
	entries := make([]agentruntime.Entry, 0, len(routes))
	for _, route := range routes {
		built, err := llmagent.New(llmagent.Config{Name: strings.ReplaceAll(route, "-", "_") + "_contract_agent", Instruction: "contract", Model: fakeModel{}})
		if err != nil {
			t.Fatal(err)
		}
		entries = append(entries, agentruntime.Entry{Route: route, AppName: built.Name(), Agent: built, Health: func(context.Context) error { return nil }})
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
		request.Header.Set("Authorization", "Bearer test")
		recorder = httptest.NewRecorder()
		handler.ServeHTTP(recorder, request)
		if recorder.Code != http.StatusOK {
			t.Fatalf("POST /agent/%s/suggest=%d %s", frontendAgentID(route), recorder.Code, recorder.Body.String())
		}
		request = httptest.NewRequest(http.MethodPost, "/agent/"+frontendAgentID(route)+"/run", strings.NewReader(`{"threadId":"contract-thread","runId":"runtime-run","messages":[]}`))
		request.Header.Set("Authorization", "Bearer test")
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
		{name: "database unavailable", secret: "correct", body: `{"telegram_user_id":42}`, lookup: fakeTelegramLinkLookup{err: errors.New("database unavailable")}, want: http.StatusServiceUnavailable},
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

// fakeModel is a minimal model.LLM double; the routing tests below only need
// a model that answers "ok".
type fakeModel struct{}

func (fakeModel) Name() string { return "fake-model" }

func (fakeModel) GenerateContent(_ context.Context, _ *model.LLMRequest, _ bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		yield(&model.LLMResponse{Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: "ok"}}}, TurnComplete: true}, nil)
	}
}

// fakeHealth is a common.HealthChecker double so tests never touch a real database.
type fakeHealth struct{ err error }

func (f fakeHealth) Health(context.Context) error { return f.err }

// publicAppName is the stub agent that exercises the gateway's public
// (unauthenticated) route handling.
const publicAppName = "public_agent"

func newStubAgent(t *testing.T, name string) agent.Agent {
	t.Helper()
	built, err := llmagent.New(llmagent.Config{Name: name, Instruction: "test", Model: fakeModel{}})
	if err != nil {
		t.Fatalf("build %s: %v", name, err)
	}
	return built
}

func newGateway(t *testing.T) http.Handler {
	t.Helper()
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route:   "public",
		AppName: publicAppName,
		Agent:   newStubAgent(t, publicAppName),
		Public:  true,
		Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatalf("build registry: %v", err)
	}
	sessions := session.InMemoryService()
	// assertRoute's POST fixture body always carries threadId
	// "route-test-thread"; pre-create the matching session (public/
	// anonymous identity, so the session user ID is "anon:<threadId>",
	// see effectiveUserID in internal/agui/handler.go) so
	// /public/agents/state exercises its normal "thread exists" path
	// instead of the missing-thread defaults path.
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{
		AppName: publicAppName, UserID: "anon:route-test-thread", SessionID: "route-test-thread",
	}); err != nil {
		t.Fatalf("seed route-test-thread session: %v", err)
	}

	cfg := config.Config{HTTP: config.HTTP{Origins: []string{"http://localhost:3000"}}}
	handler, err := New(cfg, Dependencies{
		Registry: registry,
		Sessions: sessions,
		Database: fakeHealth{},
		Now:      time.Now,
	})
	if err != nil {
		t.Fatalf("build gateway: %v", err)
	}
	return handler
}

func TestGatewayRegistersOnlyScopedStateRoutes(t *testing.T) {
	h := newGateway(t)
	assertRoute(t, h, http.MethodGet, "/info", http.StatusOK)
	assertRoute(t, h, http.MethodGet, "/public/health", http.StatusOK)
	assertRoute(t, h, http.MethodGet, "/public/agui/capabilities", http.StatusOK)
	assertSuggestionRoute(t, h, "/agent/public/run", "", http.StatusOK)
	assertSuggestionRoute(t, h, "/agent/public/connect", "", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/agent/public/stop/route-test-thread", http.StatusOK)
	assertSuggestionRoute(t, h, "/agent/public/suggest", "", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/public/agents/state", http.StatusOK)
	assertRoute(t, h, http.MethodPost, "/agents/state", http.StatusNotFound)
}

func TestGatewayRejectsUnauthenticatedNonPublicRoute(t *testing.T) {
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "travel", AppName: "travel_agent", Agent: newStubAgent(t, "travel_agent"), Public: false, Timeout: 5 * time.Second,
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
		Version                       string                    `json:"version"`
		Agents                        map[string]jsontext.Value `json:"agents"`
		AudioFileTranscriptionEnabled bool                      `json:"audioFileTranscriptionEnabled"`
		Mode                          string                    `json:"mode"`
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
	if recorder.Code != http.StatusOK || response.Version != agui.CopilotKitRuntimeVersion || !response.Suggestions || response.Mode != "sse" || len(response.Agents) != 1 || response.Agents["public"] == nil {
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

	if recorder.Code != http.StatusServiceUnavailable || recorder.Body.String() != "{\"error\":\"oauth_credentials_unavailable\"}" {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if nextCalled {
		t.Fatal("request continued without resolved OAuth credentials")
	}
}

func TestGatewayPresentationAGUIRoute(t *testing.T) {
	presentationAgent, err := presentation.New(fakeModel{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{Route: "presentation", AppName: presentation.AppName, Agent: presentationAgent, StateDefaults: presentation.StateDefaults, Timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	sessions := session.InMemoryService()
	if _, err := sessions.Create(t.Context(), &session.CreateRequest{AppName: presentation.AppName, UserID: "clerk-user", SessionID: "presentation-thread", State: presentation.StateDefaults()}); err != nil {
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
	travelAgent, err := travel.New(fakeModel{})
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
	fitnessAgent, err := fitness.New(fakeModel{}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	groceryAgent, err := grocery.New(fakeModel{}, nil, nil, nil)
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
	generatorAgent, err := trends.NewGenerator(fakeModel{})
	if err != nil {
		t.Fatal(err)
	}
	trendsAgent, err := trends.New(fakeModel{}, generatorAgent, nil, nil, nil)
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
	fitnessAgent, err := fitness.NewTask(fakeModel{}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	groceryAgent, err := grocery.NewTask(fakeModel{}, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	wellnessAgent, err := wellness.New(wellness.ModelSet{Coordinator: fakeModel{}}, fitnessAgent, groceryAgent)
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

func TestGatewayRootHealthChecksDatabaseWithoutCredentials(t *testing.T) {
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
	if !ok || checks["database"] != "ok" {
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
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "public", AppName: publicAppName, Agent: newStubAgent(t, publicAppName), Public: true, Timeout: 5 * time.Second,
	})
	if err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{HTTP: config.HTTP{Origins: nil}}
	handler, err := New(cfg, Dependencies{
		Registry: registry, Sessions: session.InMemoryService(),
		Database: fakeHealth{err: context.DeadlineExceeded}, Groceries: &fakeGroceryRepository{}, Now: time.Now,
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

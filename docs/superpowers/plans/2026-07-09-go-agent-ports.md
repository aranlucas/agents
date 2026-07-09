# Go Agent Ports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all twelve mounted Python agents to typed Go ADK-Go packages using the foundation gateway, with equivalent state/tool behavior and stronger bounds around external integrations.

**Architecture:** Each package under `agents/internal/agents/<name>` owns embedded instructions, a typed state model, ADK-Go agent construction, and one focused tool file per behavior. `agentruntime.Registry` registers each package with its current route/app name/model policy. State changes pass through the common transaction and all external effects are injected interfaces, allowing deterministic unit and AG-UI integration tests.

**Tech Stack:** Go 1.26, ADK-Go v1.3.0, Go standard library, official Google BigQuery client, pure-Go SQLite FTS driver, common Go AG-UI/D1/R2/provider layer from the foundation plan, and HTTP fixtures.

## Global Constraints

- Complete `2026-07-09-go-agents-foundation.md` before this plan; use its `Registry`, `Transaction`, D1 sessions, provider adapter, AG-UI handler, Clerk middleware, and client-tool pending store.
- Preserve app names and route prefixes used by active clients: `excalidraw_agent`, `collab_trip_agent`, `GoogleTrendsAgent`, `grocery_agent`, `fitness_agent`, `wellness_agent`, `expense_desk_agent`, `oralboards_agent`, `presentation_agent`, `research_canvas_agent`, `spreadsheet_agent`, and `resume_agent`.
- Every package embeds its instruction/assets using `go:embed`; it must not read a relative runtime filesystem path except the bundled oralboards SQLite corpus.
- All state mutation functions must be typed, validate inputs before mutating, use the common transaction, and return a structured error result rather than partially changing state.
- Preserve AG-UI predicted streaming fields: travel `itinerary`/`flights`; grocery `meal_plan`; fitness `training_plan`; wellness `weekly_plan`; expense `expense_report`; oralboards `case`, `score_card`, `active_feedback`, and `active_ideal_response`.
- User OAuth values are invocation-scoped. Only the existing web proxy headers `x-kroger-access-token` and `x-strava-access-token` may populate request-only tokens.
- Use direct HTTP for Brave Search; do not introduce a Node or stdio MCP process.
- No agent performs an irreversible remote action without its existing client approval path or a test-only fake implementation.
- Each task ends with package tests, gateway route coverage, formatting, vet, race detection, and a focused commit.

---

## Target Package Layout

```text
agents/internal/
  agents/
    common/{date.go,http.go,web.go,types.go}
    excalidraw/{agent.go,agent_test.go}
    expense/{agent.go,state.go,tools.go,tools_test.go}
    fitness/{agent.go,state.go,strava.go,tools.go,tools_test.go}
    grocery/{agent.go,state.go,kroger.go,tools.go,tools_test.go}
    oralboards/{agent.go,orchestrator.go,retrieval.go,tools.go,agent_test.go}
    presentation/{agent.go,state.go,tools.go,tools_test.go}
    research/{agent.go,state.go,tools.go,tools_test.go}
    spreadsheet/{agent.go,state.go,tools.go,tools_test.go}
    travel/{agent.go,state.go,trvl.go,tools.go,tools_test.go}
    trends/{agent.go,sql.go,bigquery.go,a2ui.go,tools_test.go}
    wellness/{agent.go,state.go,tools.go,agent_test.go}
```

Copy source instructions/assets into the matching Go packages before deleting
the Python directories during cutover. Test fixtures may draw expected input
and output from current Python tests, but production Go packages must not
import or invoke Python.

### Task 1: Add common typed tool, HTTP, and Brave Search facilities

**Files:**

- Create: `agents/internal/agents/common/date.go`
- Create: `agents/internal/agents/common/http.go`
- Create: `agents/internal/agents/common/web.go`
- Create: `agents/internal/agents/common/types.go`
- Create: `agents/internal/agents/common/web_test.go`

**Interfaces:**

- Produces `common.Today(clock Clock) string` as UTC ISO date.
- Produces `common.HTTPClient` with context deadline, maximum body size, and redacted error values.
- Produces `common.BraveSearch.Search(ctx context.Context, query string, count int) ([]SearchResult, error)`.
- Produces shared `CartItem`, `PantryItem`, and `ApprovalResult` types.

- [ ] **Step 1: Write failing HTTP/Brave tests**

```go
func TestBraveSearchCapsResultCountAndNeverLeaksKey(t *testing.T) {
	s := newBraveServer(t, `{"web":{"results":[{"title":"A","url":"https://a","description":"d"}]}}`)
	client := NewBraveSearch(s.Client(), s.URL, "brave-secret", 2)
	got, err := client.Search(context.Background(), "pediatric dentistry", 99)
	if err != nil || len(got) != 1 { t.Fatalf("Search() = %#v, %v", got, err) }
	if strings.Contains(fmt.Sprint(err), "brave-secret") { t.Fatal("secret leaked") }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/agents/common -run TestBrave -count=1`

Expected: FAIL because `NewBraveSearch` is missing.

- [ ] **Step 3: Implement the bounded common clients**

```go
func (s *BraveSearch) Search(ctx context.Context, query string, count int) ([]SearchResult, error) {
	if strings.TrimSpace(query) == "" { return nil, ErrEmptyQuery }
	if count < 1 { count = 1 }; if count > s.maximum { count = s.maximum }
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.endpoint+"?q="+url.QueryEscape(query)+"&count="+strconv.Itoa(count), nil)
	if err != nil { return nil, err }
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-Subscription-Token", s.apiKey)
	return decodeBoundedResults(s.client.Do(req), s.maxBody)
}
```

`common.HTTPClient` must set a transport with bounded idle connections and use
`io.LimitReader` before JSON decoding. `load_web_page` validates HTTPS URL,
blocks private/link-local targets, limits redirects, and truncates HTML/text.

- [ ] **Step 4: Run common package verification**

Run: `cd agents && go test -race ./internal/agents/common -count=1 && go vet ./internal/agents/common`

Expected: PASS.

- [ ] **Step 5: Commit common agent facilities**

```bash
git add agents/internal/agents/common
git commit -m "feat(agents): add bounded shared HTTP tools"
```

### Task 2: Port Presentation agent state and slide tools

**Files:**

- Create: `agents/internal/agents/presentation/{agent.go,state.go,tools.go,tools_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `presentation.New(model model.LLM) (agent.Agent, error)` for `/presentation`, app `presentation_agent`.
- Produces `PresentationState{Title, Theme string; Slides []Slide; ActiveSlideIndex int; Status, ReviewSummary, UserID string}`.
- Produces tool handlers `SetMeta`, `CreateSlide`, `UpdateSlide`, `DeleteSlide`, `ReorderSlides`, and `MarkReady`.

- [ ] **Step 1: Write failing slide-tool tests**

```go
func TestReorderSlidesUsesOnlyExplicitIDs(t *testing.T) {
	tx := newPresentationTx(Slide{ID: "a"}, Slide{ID: "b"}, Slide{ID: "c"})
	if _, err := ReorderSlides(context.Background(), tx, ReorderArgs{SlideIDs: []string{"c", "a"}}); err != nil { t.Fatal(err) }
	if got := ids(tx.State().Slides); !slices.Equal(got, []string{"c", "a"}) { t.Fatalf("slides = %#v", got) }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/agents/presentation -run TestReorder -count=1`

Expected: FAIL because the Go presentation package is absent.

- [ ] **Step 3: Implement typed presentation state/tools and ADK agent**

```go
type Slide struct { ID, Type, Heading, Body, Notes string `json:"id"` }
type CreateSlideArgs struct { Heading, Body, SlideType, Notes string }

func CreateSlide(ctx context.Context, tx *agentruntime.Transaction, in CreateSlideArgs) (map[string]any, error) {
	if strings.TrimSpace(in.Heading) == "" { return nil, ErrEmptyHeading }
	state := decodePresentation(tx)
	state.Slides = append(state.Slides, Slide{ID: uuid.NewString(), Type: in.SlideType, Heading: in.Heading, Body: in.Body, Notes: in.Notes})
	state.Status = "drafting"; tx.Set("slides", state.Slides); tx.Set("status", state.Status)
	return map[string]any{"ok": true}, nil
}
```

Embed the current instruction and register the Groq model policy. `DeleteSlide`
must reject a missing ID; `UpdateSlide` must preserve untouched fields;
`ReorderSlides` must drop unlisted slides exactly as the current tool does.

- [ ] **Step 4: Run package and route tests**

Run: `cd agents && go test -race ./internal/agents/presentation ./cmd/gateway -run 'Test(Presentation|GatewayPresentation)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Presentation port**

```bash
git add agents/internal/agents/presentation agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port presentation agent to Go"
```

### Task 3: Port Research agent state and report tools

**Files:**

- Create: `agents/internal/agents/research/{agent.go,state.go,tools.go,tools_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/research`, app `research_canvas_agent`.
- Produces `ResearchState{Title, Query, Report, Status, ReviewSummary, UserID string; Sections []Section; Sources []Source}`.
- Produces `SetQuery`, `CreateSection`, `UpdateSection`, `AddSource`, `WriteReport`, `MarkReady`.

- [ ] **Step 1: Write failing report-rebuild tests**

```go
func TestUpdateSectionRebuildsOrderedReport(t *testing.T) {
	tx := newResearchTx(Section{ID: "one", Title: "First", Content: "old"}, Section{ID: "two", Title: "Second", Content: "keep"})
	if _, err := UpdateSection(context.Background(), tx, UpdateSectionArgs{ID: "one", Content: "new"}); err != nil { t.Fatal(err) }
	if got := tx.String("report"); got != "# First\n\nnew\n\n# Second\n\nkeep" { t.Fatalf("report = %q", got) }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/agents/research -run TestUpdateSection -count=1`

Expected: FAIL because research tools are absent.

- [ ] **Step 3: Implement research tools and agent**

```go
func rebuildReport(sections []Section) string {
	parts := make([]string, 0, len(sections))
	for _, section := range sections { parts = append(parts, "# "+section.Title+"\n\n"+section.Content) }
	return strings.Join(parts, "\n\n")
}

func AddSource(ctx context.Context, tx *agentruntime.Transaction, in AddSourceArgs) (map[string]any, error) {
	if !validHTTPURL(in.URL) { return nil, ErrInvalidSourceURL }
	state := decodeResearch(tx); state.Sources = append(state.Sources, Source{ID: uuid.NewString(), Title: in.Title, URL: in.URL, Snippet: in.Snippet})
	tx.Set("sources", state.Sources); return map[string]any{"ok": true}, nil
}
```

Ensure missing section IDs return `section_not_found` and leave `report`
unchanged. Embed the non-current-information disclaimer in instruction assets.

- [ ] **Step 4: Run package and route tests**

Run: `cd agents && go test -race ./internal/agents/research ./cmd/gateway -run 'Test(Research|GatewayResearch)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Research port**

```bash
git add agents/internal/agents/research agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port research agent to Go"
```

### Task 4: Port Spreadsheet agent state and sheet tools

**Files:**

- Create: `agents/internal/agents/spreadsheet/{agent.go,state.go,tools.go,tools_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/spreadsheet`, app `spreadsheet_agent`.
- Produces `SpreadsheetState{Sheets []Sheet; ActiveSheetIndex int; Summary, Status, ReviewSummary, UserID string}`.
- Produces `CreateSheet`, `UpdateSheet`, `AppendRows`, `DeleteSheet`, `SetActiveSheet`, and `WriteSummary`.

- [ ] **Step 1: Write failing bounds tests**

```go
func TestSetActiveSheetRejectsOutOfRangeWithoutMutation(t *testing.T) {
	tx := newSpreadsheetTx(Sheet{Title: "Budget"})
	_, err := SetActiveSheet(context.Background(), tx, SheetIndexArgs{SheetIndex: 2})
	if !errors.Is(err, ErrSheetIndexOutOfRange) { t.Fatalf("error = %v", err) }
	if got := tx.Int("active_sheet_index"); got != 0 { t.Fatalf("index = %d", got) }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/agents/spreadsheet -run TestSetActiveSheet -count=1`

Expected: FAIL because spreadsheet tools are absent.

- [ ] **Step 3: Implement sheet operations**

```go
type Sheet struct { Title string `json:"title"`; Rows [][]string `json:"rows"` }

func AppendRows(ctx context.Context, tx *agentruntime.Transaction, in AppendRowsArgs) (map[string]any, error) {
	state := decodeSpreadsheet(tx)
	if in.SheetIndex < 0 || in.SheetIndex >= len(state.Sheets) { return nil, ErrSheetIndexOutOfRange }
	state.Sheets[in.SheetIndex].Rows = append(state.Sheets[in.SheetIndex].Rows, in.Rows...)
	tx.Set("sheets", state.Sheets); tx.Set("status", "drafting")
	return map[string]any{"ok": true}, nil
}
```

Port all existing error messages as stable error codes, preserve row order, and
clamp active index after a deletion only when there are remaining sheets.

- [ ] **Step 4: Run tests**

Run: `cd agents && go test -race ./internal/agents/spreadsheet ./cmd/gateway -run 'Test(Spreadsheet|GatewaySpreadsheet)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Spreadsheet port**

```bash
git add agents/internal/agents/spreadsheet agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port spreadsheet agent to Go"
```

### Task 5: Port Expense agent workflow and streamed report state

**Files:**

- Create: `agents/internal/agents/expense/{agent.go,state.go,tools.go,tools_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/expense`, app `expense_desk_agent`.
- Produces `Expense{ID string; Amount float64; Submitter, Category, Description, Date, Status string; RiskLevel, RiskSummary, Recommendation, DecisionNote string}`.
- Produces `SubmitExpense`, `WriteExpenseReview`, `DecideExpense`, `SetExpenseReport`, `MarkExpenseReady`.

- [ ] **Step 1: Write failing threshold and decision tests**

```go
func TestSubmitExpenseUsesApprovalThreshold(t *testing.T) {
	tx := newExpenseTx(100)
	below, err := SubmitExpense(context.Background(), tx, SubmitExpenseArgs{Amount: 99, Submitter: "A", Category: "meal", Description: "d", Date: "2026-07-09"})
	if err != nil || below["status"] != "auto_approved" { t.Fatalf("result = %#v, %v", below, err) }
	above, err := SubmitExpense(context.Background(), tx, SubmitExpenseArgs{Amount: 100, Submitter: "A", Category: "meal", Description: "d", Date: "2026-07-09"})
	if err != nil || above["status"] != "needs_review" { t.Fatalf("result = %#v, %v", above, err) }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/agents/expense -run TestSubmitExpense -count=1`

Expected: FAIL because expense workflow code is absent.

- [ ] **Step 3: Implement the explicit review state machine**

```go
func DecideExpense(ctx context.Context, tx *agentruntime.Transaction, in DecideExpenseArgs) (map[string]any, error) {
	if in.Decision != "approved" && in.Decision != "rejected" { return nil, ErrInvalidDecision }
	state := decodeExpense(tx); expense, index := findExpense(state.Expenses, in.ID)
	if index < 0 || expense.Status != "needs_review" { return nil, ErrExpenseNotReviewable }
	expense.Status, expense.DecisionNote = in.Decision, in.Note
	state.Expenses[index] = expense; state.Status = "ready"; tx.Set("expenses", state.Expenses); tx.Set("status", state.Status)
	return map[string]any{"ok": true}, nil
}
```

Register `expense_report` as a predicted streaming field. The LLM may recommend
an outcome, but only `DecideExpense` changes a reviewed expense to approved or
rejected.

- [ ] **Step 4: Run tests including streamed-field fixture**

Run: `cd agents && go test -race ./internal/agents/expense ./internal/agui -run 'Test(Expense|StreamedExpense)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Expense port**

```bash
git add agents/internal/agents/expense agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port expense workflow to Go"
```

### Task 6: Port Travel agent, TRVL HTTP MCP, and approval resume

**Files:**

- Create: `agents/internal/agents/travel/{agent.go,state.go,tools.go,trvl.go,tools_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`
- Modify: `agents/internal/agui/client_tools_test.go`

**Interfaces:**

- Produces `/travel`, app `collab_trip_agent`.
- Produces `TravelState` with existing destination, dates, travelers, budget, itinerary, flight, traveler preference, and status fields.
- Produces `SetTripMeta`, `WriteItinerary`, `AddDay`, `MarkReadyToBook`.
- Produces `travel.NewTRVL(endpoint string, client *http.Client) tool.Toolset`.

- [ ] **Step 1: Write failing itinerary/approval tests**

```go
func TestWriteItineraryStreamsBodyAndFlightsState(t *testing.T) {
	tx := newTravelTx()
	_, err := WriteItinerary(context.Background(), tx, WriteItineraryArgs{Summary: "weekend", Body: "## Day 1: Arrival\n- 09:00 — Coffee", Flights: "UA 1"})
	if err != nil { t.Fatal(err) }
	if tx.String("itinerary") == "" || tx.String("flights") != "UA 1" || tx.String("status") != "drafting" { t.Fatal("itinerary state not written") }
}

func TestApprovalResultResumesOnlyOriginalTravelThread(t *testing.T) {
	// Persist request_user_approval call then assert another app/thread cannot resolve it.
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/agents/travel ./internal/agui -run 'Test(WriteItinerary|ApprovalResult)' -count=1`

Expected: FAIL because travel package is absent.

- [ ] **Step 3: Implement travel state, MCP, and approval policy**

```go
func WriteItinerary(ctx context.Context, tx *agentruntime.Transaction, in WriteItineraryArgs) (map[string]any, error) {
	if !strings.Contains(in.Body, "## Day ") { return nil, ErrInvalidItinerary }
	tx.Set("itinerary", in.Body); tx.Set("summary", in.Summary); tx.Set("status", "drafting")
	if in.Flights != "" { tx.Set("flights", in.Flights) }
	return map[string]any{"ok": true, "length": len(in.Body)}, nil
}
```

The TRVL toolset uses streamable HTTP with an explicit endpoint from
`TRVL_MCP_URL`, a deadline, and resource/tool discovery cache. Booking,
reserving, sharing, or charging invokes the dynamic `request_user_approval`
client tool; no remote action runs until the matching approved result is
received. Preserve `## Day N:` and `- HH:MM —` formatting guidance.

- [ ] **Step 4: Run route, MCP-fixture, and approval-resume tests**

Run: `cd agents && go test -race ./internal/agents/travel ./internal/agui ./cmd/gateway -run 'Test(Travel|Approval|GatewayTravel)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Travel port**

```bash
git add agents/internal/agents/travel agents/internal/agentruntime/registry.go agents/internal/agui/client_tools_test.go
git commit -m "feat(agents): port travel agent and approval flow"
```

### Task 7: Port Fitness and Grocery with request-scoped OAuth clients

**Files:**

- Create: `agents/internal/agents/fitness/{agent.go,state.go,strava.go,tools.go,tools_test.go,instructions.md}`
- Create: `agents/internal/agents/grocery/{agent.go,state.go,kroger.go,tools.go,tools_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/fitness`, app `fitness_agent`, and `/grocery`, app `grocery_agent`.
- Produces `fitness.WithStravaToken(ctx, token string)` and `grocery.WithKrogerToken(ctx, token string)` request context helpers.
- Produces typed Fitness activity, Grocery cart, pantry, shopping list, meal plan, and deals functions.

- [ ] **Step 1: Write failing token isolation and workflow tests**

```go
func TestStravaClientUsesOnlyRequestToken(t *testing.T) {
	server := newStravaServer(t)
	ctxA := WithStravaToken(context.Background(), "token-a")
	ctxB := WithStravaToken(context.Background(), "token-b")
	if _, err := NewStrava(server.Client(), server.URL).Activities(ctxA, nil, nil); err != nil { t.Fatal(err) }
	if _, err := NewStrava(server.Client(), server.URL).Activities(ctxB, nil, nil); err != nil { t.Fatal(err) }
	if got := server.AuthorizationHeaders(); !slices.Equal(got, []string{"Bearer token-a", "Bearer token-b"}) { t.Fatalf("headers = %#v", got) }
}

func TestGroceryCartUpdateRequiresConnectedState(t *testing.T) {
	tx := newGroceryTx(false)
	if _, err := UpdateCart(context.Background(), tx, UpdateCartArgs{}); !errors.Is(err, ErrKrogerDisconnected) { t.Fatalf("error = %v", err) }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/agents/fitness ./internal/agents/grocery -run 'Test(Strava|Grocery)' -count=1`

Expected: FAIL because OAuth-aware Go clients are absent.

- [ ] **Step 3: Implement bounded Strava and Kroger integrations**

```go
func (c *Strava) Activities(ctx context.Context, after *int64, page *string) ([]Activity, string, error) {
	token, ok := StravaToken(ctx); if !ok { return nil, "", ErrStravaDisconnected }
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint+"/athlete/activities?per_page=200", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	return decodeActivities(c.client.Do(req))
}

func SetMealPlan(ctx context.Context, tx *agentruntime.Transaction, in PlanArgs) (map[string]any, error) {
	tx.Set("meal_plan", in.Plan); tx.Set("status", "drafting"); return map[string]any{"ok": true}, nil
}
```

Inject `x-strava-access-token` and `x-kroger-access-token` only at handler
invocation time. Set the public `*_connected` flags from token presence but do
not persist token material. Port Strava activity normalization/merge and all
Grocery cart/pantry validation. Grocery's remote meal-planner MCP is created
per request with the ephemeral bearer transport, while Brave is the common
direct HTTP client. Bound Grocery compaction/request context before model call.

- [ ] **Step 4: Run package, route, and redaction tests**

Run: `cd agents && go test -race ./internal/agents/fitness ./internal/agents/grocery ./cmd/gateway -run 'Test(Fitness|Grocery|Gateway)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Fitness and Grocery ports**

```bash
git add agents/internal/agents/fitness agents/internal/agents/grocery agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port fitness and grocery integrations"
```

### Task 8: Port Wellness in-process orchestration

**Files:**

- Create: `agents/internal/agents/wellness/{agent.go,state.go,tools.go,agent_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/wellness`, app `wellness_agent`.
- Produces `wellness.New(models ModelSet, fitness agent.Agent, grocery agent.Agent) (agent.Agent, error)`.
- Requires both ephemeral OAuth tokens before running its plan sequence.

- [ ] **Step 1: Write failing ordering/cancellation tests**

```go
func TestWellnessRunsFitnessBeforeGroceryWithSharedState(t *testing.T) {
	trace := &callTrace{}
	ag := New(fakeWellnessModel{}, fakeChild("fitness", trace, func(tx *agentruntime.Transaction) { tx.Set("training_plan", "run") }), fakeChild("grocery", trace, func(tx *agentruntime.Transaction) { if tx.String("training_plan") != "run" { t.Fatal("missing training plan") }))
	if err := runWellness(t, ag, connectedState()); err != nil { t.Fatal(err) }
	if got := trace.Names(); !slices.Equal(got, []string{"fitness", "grocery"}) { t.Fatalf("calls = %#v", got) }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/agents/wellness -run TestWellness -count=1`

Expected: FAIL because the Wellness package is absent.

- [ ] **Step 3: Implement shared-state child orchestration**

```go
func (o *Orchestrator) Run(ctx context.Context, tx *agentruntime.Transaction) error {
	if !tx.Bool("strava_connected") || !tx.Bool("kroger_connected") { return ErrConnectionsRequired }
	if err := o.runChild(ctx, o.fitness, tx); err != nil { return err }
	if err := o.runChild(ctx, o.grocery, tx); err != nil { return err }
	return nil
}
```

Do not create nested sessions or loopback HTTP. If either child returns an
error or context cancellation, rollback the outer transaction and do not call
`MarkPlanReady`. Register predicted `weekly_plan` streaming state.

- [ ] **Step 4: Run Wellness and gateway tests**

Run: `cd agents && go test -race ./internal/agents/wellness ./cmd/gateway -run 'Test(Wellness|GatewayWellness)' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Wellness port**

```bash
git add agents/internal/agents/wellness agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port wellness orchestration to Go"
```

### Task 9: Port Excalidraw remote MCP/App bridge

**Files:**

- Create: `agents/internal/agents/excalidraw/{agent.go,agent_test.go,instructions.md}`
- Create: `agents/internal/mcp/excalidraw.go`
- Create: `agents/internal/mcp/excalidraw_test.go`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/excalidraw`, app `excalidraw_agent`.
- Produces `mcp.NewExcalidraw(endpoint string, transport *http.Client) tool.Toolset` for `https://mcp.excalidraw.com`.
- Converts MCP App activity/output into the AG-UI custom/activity event form expected by the current frontend.

- [ ] **Step 1: Write failing remote activity test**

```go
func TestExcalidrawToolResultEmitsActivityEvent(t *testing.T) {
	events := convertMCPAppResult(fakeExcalidrawResult())
	if len(events) != 1 || events[0].Type != "ACTIVITY_DELTA" { t.Fatalf("events = %#v", events) }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/mcp ./internal/agents/excalidraw -run TestExcalidraw -count=1`

Expected: FAIL because the remote MCP bridge is absent.

- [ ] **Step 3: Implement remote MCP lifecycle and agent**

```go
func NewExcalidraw(endpoint string, client *http.Client) (tool.Toolset, error) {
	transport := &mcp.StreamableClientTransport{Endpoint: endpoint, HTTPClient: client, MaxRetries: 1, DisableStandaloneSSE: true}
	return mcptoolset.New(mcptoolset.Config{Transport: transport, ToolFilter: allowExcalidrawTools})
}
```

Use a bounded client/transport, only allow documented Excalidraw tool names,
and close idle connections. Do not port the eval-only local scene tool into the
production registry.

- [ ] **Step 4: Run bridge and route tests**

Run: `cd agents && go test -race ./internal/mcp ./internal/agents/excalidraw ./cmd/gateway -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Excalidraw port**

```bash
git add agents/internal/mcp agents/internal/agents/excalidraw agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port excalidraw MCP bridge to Go"
```

### Task 10: Port Trends SQL, BigQuery, subagent, and A2UI flow

**Files:**

- Create: `agents/internal/agents/trends/{agent.go,state.go,sql.go,bigquery.go,a2ui.go,tools_test.go,instructions.md}`
- Create: `agents/internal/providers/gemini/model.go`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/trends`, app `GoogleTrendsAgent`.
- Produces `ValidateSQL(sql string) error`, `ExecuteBigQuery(ctx context.Context, sql string) (ColumnsRows, error)`, and `BuildA2UI(result TrendsResult) agui.Event`.
- Produces `trends.NewGenerator(model model.LLM) (agent.Agent, error)` as a child AgentTool.

- [ ] **Step 1: Write failing SQL/A2UI tests**

```go
func TestValidateSQLRejectsMutationAndMissingLimit(t *testing.T) {
	for _, sql := range []string{"DELETE FROM x", "SELECT * FROM x"} {
		if err := ValidateSQL(sql); err == nil { t.Fatalf("ValidateSQL(%q) accepted unsafe query", sql) }
	}
	if err := ValidateSQL("WITH x AS (SELECT 1) SELECT * FROM x LIMIT 10"); err != nil { t.Fatal(err) }
}

func TestBuildA2UIUsesTrendsCatalog(t *testing.T) {
	e := BuildA2UI(TrendsResult{Query: "cats", Columns: []string{"week", "value"}, Rows: []map[string]any{{"week": "2026-01-01", "value": 3}}})
	if e.Type != "ACTIVITY_DELTA" || !strings.Contains(mustJSON(e), "copilotkit://trends/v1") { t.Fatalf("event = %#v", e) }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/agents/trends -run 'Test(ValidateSQL|BuildA2UI)' -count=1`

Expected: FAIL because Trends Go code is absent.

- [ ] **Step 3: Implement safe query and A2UI pipeline**

```go
func ValidateSQL(sql string) error {
	normalized := strings.TrimSpace(strings.TrimSuffix(sql, ";"))
	upper := strings.ToUpper(normalized)
	if !(strings.HasPrefix(upper, "SELECT ") || strings.HasPrefix(upper, "WITH ")) || !strings.Contains(upper, " LIMIT ") { return ErrUnsafeSQL }
	for _, forbidden := range []string{"INSERT", "UPDATE", "DELETE", "MERGE", "DROP", "CREATE", "ALTER", ";"} {
		if strings.Contains(upper, forbidden) { return ErrUnsafeSQL }
	}
	return nil
}
```

Use the official Go BigQuery client initialized at startup from the existing
JSON credential environment or ADC. Enforce query timeout, maximum bytes
billed, result row limit, and required dataset/project allowlist. Persist
`TrendsState` through `WriteTrendsResult` before emitting a catalog-valid A2UI
activity event. The direct Gemini adapter must implement the same `model.LLM`
interface and retain reasoning-content support required by the Trends renderer.

- [ ] **Step 4: Run Trends integration fixtures**

Run: `cd agents && go test -race ./internal/agents/trends ./internal/providers/gemini ./cmd/gateway -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Trends port**

```bash
git add agents/internal/agents/trends agents/internal/providers/gemini agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port trends agent and A2UI to Go"
```

### Task 11: Port Oralboards corpus retrieval and deterministic phase orchestration

**Files:**

- Create: `agents/assets/oralboards/search.sqlite`
- Create: `agents/internal/agents/oralboards/{agent.go,state.go,retrieval.go,tools.go,orchestrator.go,agent_test.go,retrieval_test.go,instructions.md}`
- Modify: `agents/internal/agentruntime/registry.go`

**Interfaces:**

- Produces `/oralboards`, app `oralboards_agent`.
- Produces `SearchDocs(ctx, tx, query, collection) (SearchResponse, error)` and `ReadDoc(ctx, filepath string) (Document, error)`.
- Produces `oralboards.New(models PhaseModels, corpus *sql.DB) (agent.Agent, error)`.
- Produces `RoutePhase(state OralBoardsState) string` returning `case_builder`, `questioner`, `evaluator`, or `scorer`.

- [ ] **Step 1: Write failing retrieval/phase/probe tests**

```go
func TestSearchDocsEnforcesTwoCallBudget(t *testing.T) {
	tx := newOralboardsTx()
	for range 2 { if _, err := SearchDocs(context.Background(), tx, "pulp therapy", ""); err != nil { t.Fatal(err) } }
	if _, err := SearchDocs(context.Background(), tx, "trauma", ""); !errors.Is(err, ErrSearchBudgetExhausted) { t.Fatalf("error = %v", err) }
}

func TestRoutePhase(t *testing.T) {
	for _, tc := range []struct{ state OralBoardsState; want string }{
		{OralBoardsState{}, "case_builder"}, {OralBoardsState{Case: "case", Status: "feedback"}, "evaluator"},
		{OralBoardsState{Case: "case", Status: "complete"}, "scorer"}, {OralBoardsState{Case: "case", Status: "questioning"}, "questioner"},
	} { if got := RoutePhase(tc.state); got != tc.want { t.Fatalf("RoutePhase(%#v) = %q", tc.state, got) } }
}

func TestQuestionCraftRejectsStackedAndAnswerLeakingQuestions(t *testing.T) {
	for _, question := range []string{
		"What findings would you seek and how would they change your plan?",
		"What diagnosis would you make, such as early childhood caries?",
	} {
		if len(QuestionCraftViolations(question)) == 0 { t.Fatalf("question accepted: %q", question) }
	}
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd agents && go test ./internal/agents/oralboards -run 'Test(SearchDocs|RoutePhase|QuestionCraft)' -count=1`

Expected: FAIL because oralboards Go code and corpus asset are absent.

- [ ] **Step 3: Implement corpus, typed tools, and phase machine**

```go
func RoutePhase(state OralBoardsState) string {
	if state.Status == "feedback" { return "evaluator" }
	if state.Status == "complete" { return "scorer" }
	if state.Status == "idle" || state.Case == "" { return "case_builder" }
	return "questioner"
}

func AskProbe(ctx context.Context, tx *agentruntime.Transaction, in ProbeArgs) (map[string]any, error) {
	if tx.String("active_probe") != "" { return nil, ErrProbeAlreadyUsed }
	tx.Set("active_probe", in.Question); tx.Set("current_question", in.Question); tx.Set("temp:probe_asked_now", true)
	return map[string]any{"status": "success"}, nil
}
```

Copy the SQLite corpus as a read-only asset and open it once with read-only,
immutable connection flags. Port FTS BM25 ranking, overall/per-collection
candidate selection, sanitized query cleanup, passage extraction, two-search
budget, and bounded result sizes. Port `SetCase`, `SetPhase`,
`SetLoadingStep`, `SetQuestionTarget`, `AppendExchange`, `AskProbe`, and
`SetScoreCard`; exactly preserve no-score-on-probe-turn enforcement. Build four
ADK-Go LLM agents with the existing phase model policies and a custom root
agent that chains evaluator to questioner/scorer only under current state rules.

- [ ] **Step 4: Run corpus, orchestrator, AG-UI, and race tests**

Run: `cd agents && go test -race ./internal/agents/oralboards ./internal/agui ./cmd/gateway -count=1`

Expected: PASS.

- [ ] **Step 5: Commit Oralboards port**

```bash
git add agents/assets/oralboards/search.sqlite agents/internal/agents/oralboards agents/internal/agentruntime/registry.go
git commit -m "feat(agents): port oralboards orchestration to Go"
```

### Task 12: Register every agent and prove full AG-UI route coverage

**Files:**

- Modify: `agents/internal/agentruntime/registry.go`
- Create: `agents/internal/agentruntime/registry_test.go`
- Create: `agents/internal/agui/agents_contract_test.go`
- Modify: `agents/cmd/gateway/main.go`

**Interfaces:**

- Produces `Registry.All() []Entry` containing exactly 12 unique route/app-name pairs.
- Produces a fake-model gateway test configuration with each agent's explicit state defaults and protected/public policy.

- [ ] **Step 1: Write failing full registry contract test**

```go
func TestRegistryHasEveryActiveAgentExactlyOnce(t *testing.T) {
	got := registryRoutes(NewRegistry(fakeDependencies(t)))
	want := []string{"/excalidraw", "/travel", "/trends", "/grocery", "/fitness", "/wellness", "/expense", "/oralboards", "/presentation", "/research", "/spreadsheet", "/resume"}
	if !slices.Equal(got, want) { t.Fatalf("routes = %#v, want %#v", got, want) }
}

func TestEveryAgentExposesScopedHealthAguiCapabilitiesAndState(t *testing.T) {
	// Iterate all entries; assert four scoped endpoints exist and root /agents/state is absent.
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd agents && go test ./internal/agentruntime ./internal/agui -run 'TestRegistry|TestEveryAgent' -count=1`

Expected: FAIL until every port is registered.

- [ ] **Step 3: Register each completed package and gateway capability contract**

```go
func All(deps Dependencies) ([]Entry, error) {
	return []Entry{
		mustEntry("excalidraw", "excalidraw_agent", excalidraw.New(deps.Models.Groq)),
		mustEntry("travel", "collab_trip_agent", travel.New(deps.Models.OpenRouter, deps.TRVL)),
		mustEntry("trends", "GoogleTrendsAgent", trends.New(deps.Models, deps.BigQuery)),
		mustEntry("grocery", "grocery_agent", grocery.New(deps.Models.NVIDIA, deps.Kroger)),
		mustEntry("fitness", "fitness_agent", fitness.New(deps.Models.Groq, deps.Strava)),
		mustEntry("wellness", "wellness_agent", wellness.New(deps.Models, deps.Fitness, deps.Grocery)),
		mustEntry("expense", "expense_desk_agent", expense.New(deps.Models.OpenRouter)),
		mustEntry("oralboards", "oralboards_agent", oralboards.New(deps.PhaseModels, deps.OralboardsCorpus)),
		mustEntry("presentation", "presentation_agent", presentation.New(deps.Models.Groq)),
		mustEntry("research", "research_canvas_agent", research.New(deps.Models.OpenRouter)),
		mustEntry("spreadsheet", "spreadsheet_agent", spreadsheet.New(deps.Models.Groq)),
		mustEntry("resume", "resume_agent", resume.New(deps.Models.OpenRouter)),
	}, nil
}
```

The completed source must not depend on a generated registry or an implicit
directory scan. Ensure `/resume` is the only public agent and every state route
uses the same identity isolation test.

- [ ] **Step 4: Run full agent port verification**

Run: `cd agents && go test -race ./internal/agents/... ./internal/agentruntime ./internal/agui ./cmd/gateway && go vet ./...`

Expected: PASS.

- [ ] **Step 5: Commit complete agent registration**

```bash
git add agents/internal/agentruntime/registry.go agents/internal/agentruntime/registry_test.go agents/internal/agui/agents_contract_test.go agents/cmd/gateway/main.go
git commit -m "feat(agents): register all Go agent routes"
```

### Task 13: Align TypeScript state contracts with the Go registry

**Files:**

- Modify: `packages/types/src/index.ts`
- Modify: `apps/web/src/components/chat/agents/registry.ts`
- Modify: `apps/web/src/lib/agent-state.ts`
- Modify: `apps/web/src/lib/agent-state.test.ts`
- Modify: `apps/mobile/src/app/fitness.tsx`
- Modify: `apps/mobile/src/app/wellness.tsx`

**Interfaces:**

- Produces TypeScript state definitions matching every emitted Go field that an active client reads.
- Changes Fitness artifact source from the nonexistent `weekly_plan` field to `training_plan`.
- Produces an explicit `PresentationTheme` validator shared with the Go presentation tool contract.

- [ ] **Step 1: Write failing frontend-contract tests**

```ts
it("uses the actual fitness training_plan state field for its artifact", () => {
  expect(getAgentConfig("fitness")?.artifact?.stateField).toBe("training_plan");
});

it("retains all oral-boards fields emitted by the Go state snapshot", () => {
  expect(
    toOralBoardsState({
      case_passages: "source",
      interview_complete: false,
      question_craft_feedback: "rewrite",
      case_sources: [{ docid: 1, filepath: "aapd/x.md", title: "X", collection: "aapd" }],
    }),
  ).toMatchObject({
    case_passages: "source",
    interview_complete: false,
    question_craft_feedback: "rewrite",
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter web test -- apps/web/src/lib/agent-state.test.ts apps/web/src/components/chat/agents/registry.test.ts`

Expected: FAIL because Fitness still names `weekly_plan` and state normalizers/types omit Go fields.

- [ ] **Step 3: Update shared/client schemas to the Go contract**

```ts
export type OralBoardsState = {
  case?: string;
  case_sources?: Array<CaseSource & { filepath: string }>;
  case_passages?: string;
  transcript?: OralBoardsExchange[];
  score_card?: string;
  score_summary?: OralBoardsSkillsetScore[];
  outcome?: OralBoardsOutcome;
  status?: OralBoardsPhase;
  loading_step?: string;
  current_question?: string;
  interview_complete?: boolean;
  active_feedback?: string;
  active_ideal_response?: string;
  active_probe?: string;
  target_skillset?: string;
  target_skill?: OralBoardsSkill;
  question_craft_feedback?: string;
};
```

Set Fitness artifact `stateField: "training_plan"`. Update `FitnessState`,
`WellnessState`, and their normalizers with the actual Gym/Grocery fields the
Go state snapshot emits; do not add frontend-only fields to Go state. Validate
Presentation themes to exactly `light`, `dark`, or `minimal` at the Go tool
boundary and retain the matching client union. Keep mobile screen rendering on
`training_plan` and `weekly_plan` respectively.

- [ ] **Step 4: Run web/mobile contract verification**

Run: `pnpm --filter web test -- apps/web/src/lib/agent-state.test.ts apps/web/src/components/chat/agents/registry.test.ts && pnpm --filter mobile test -- src/all-source-smoke.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit client state alignment**

```bash
git add packages/types/src/index.ts apps/web/src/components/chat/agents/registry.ts apps/web/src/lib/agent-state.ts apps/web/src/lib/agent-state.test.ts apps/mobile/src/app/fitness.tsx apps/mobile/src/app/wellness.tsx
git commit -m "fix(agents): align client state with Go runtime"
```

## Agent Port Completion Check

Before starting Telegram/cutover work, gather current proof that:

1. All 12 agent packages compile and have isolated state/tool tests.
2. Gateway tests cover AG-UI state snapshots/deltas and scoped endpoints for every route.
3. Travel approvals, Grocery/Strava credentials, Excalidraw activity, Trends A2UI, and Oralboards phase/probe behavior are covered by deterministic fixtures.
4. No package starts Node, Python, or an unrestricted external process.
5. Grep of production Go dependencies finds no `DATABASE_URL`, LiteLLM, Python import, or legacy fallback code.

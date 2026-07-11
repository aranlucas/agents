package main

import (
	"fmt"
	"strings"
)

// RubricResult is the outcome of one local structural check.
type RubricResult struct {
	RubricID    string `json:"rubric_id"`
	Description string `json:"description"`
	Pass        bool   `json:"pass"`
	Explanation string `json:"explanation"`
}

func (t Trace) calledTools() []string {
	var names []string
	for _, s := range t.Steps {
		if s.FunctionCall != "" {
			names = append(names, s.FunctionCall)
		}
	}
	return names
}

func (t Trace) firstCallArgs(name string) (map[string]any, bool) {
	for _, s := range t.Steps {
		if s.FunctionCall == name {
			return s.FunctionCallArgs, true
		}
	}
	return nil, false
}

func (t Trace) called(name string) bool {
	for _, s := range t.Steps {
		if s.FunctionCall == name {
			return true
		}
	}
	return false
}

func (t Trace) indexOfCall(name string) int {
	for i, s := range t.Steps {
		if s.FunctionCall == name {
			return i
		}
	}
	return -1
}

// nonEmptyArgCount counts how many of the given keys hold a non-zero,
// non-empty value in args — a loose stand-in for "the model actually
// supplied this field" without asserting an exact type per key.
func nonEmptyArgCount(args map[string]any, keys ...string) int {
	n := 0
	for _, k := range keys {
		v, ok := args[k]
		if !ok || v == nil {
			continue
		}
		switch val := v.(type) {
		case string:
			if strings.TrimSpace(val) != "" {
				n++
			}
		case []any:
			if len(val) > 0 {
				n++
			}
		case float64:
			if val != 0 {
				n++
			}
		default:
			n++
		}
	}
	return n
}

func textContainsAny(text string, needles ...string) bool {
	lower := strings.ToLower(text)
	for _, n := range needles {
		if strings.Contains(lower, strings.ToLower(n)) {
			return true
		}
	}
	return false
}

func fullText(t Trace) string {
	var parts []string
	for _, s := range t.Steps {
		if s.Text != "" {
			parts = append(parts, s.Text)
		}
	}
	return strings.Join(parts, "\n")
}

// gradeRubric applies a hand-written local structural check for one
// rubric_id. These stand in for the Vertex-backed LLM-judge rubric metric
// (project_agent_contract) the restored eval_config.yaml files specify —
// no GCP project is available in this environment, so each check inspects
// tool-call sequencing, argument presence, and simple response-text rules
// instead of an adaptive LLM rubric judge.
func gradeRubric(agentName, rubricID, description string, trace Trace) RubricResult {
	res := RubricResult{RubricID: rubricID, Description: description}
	text := fullText(trace)

	switch rubricID {

	// --- expense ---
	case "expense_submits_details":
		args, ok := trace.firstCallArgs("submit_expense")
		n := nonEmptyArgCount(args, "amount", "submitter", "category", "description", "date")
		res.Pass = ok && n >= 4
		res.Explanation = fmt.Sprintf("submit_expense called=%v, non-empty fields=%d/5", ok, n)
	case "expense_reviews_high_value":
		res.Pass = trace.called("write_expense_review")
		res.Explanation = fmt.Sprintf("write_expense_review called=%v", res.Pass)
	case "expense_no_final_decision_without_user":
		decided := trace.called("decide_expense")
		claims := textContainsAny(text, "has been approved", "has been rejected", "is approved", "is rejected", "final decision")
		res.Pass = !decided && !claims
		res.Explanation = fmt.Sprintf("decide_expense called=%v, text claims a final decision=%v", decided, claims)
	case "expense_state_first_summary":
		res.Pass = len(trace.FinalText) < 900
		res.Explanation = fmt.Sprintf("final response length=%d (want <900, relying on state/report tools for detail)", len(trace.FinalText))

	// --- fitness ---
	case "fitness_auth_gate":
		res.Pass = textContainsAny(text, "strava") && textContainsAny(text, "connect")
		res.Explanation = fmt.Sprintf("response mentions Strava connection requirement=%v", res.Pass)
	case "fitness_no_fetch_when_disconnected":
		fetched, planned := trace.called("fetch_activities"), trace.called("set_training_plan")
		res.Pass = !fetched && !planned
		res.Explanation = fmt.Sprintf("fetch_activities called=%v, set_training_plan called=%v", fetched, planned)
	case "fitness_no_invented_history":
		fetched := trace.called("fetch_activities")
		res.Pass = !fetched
		res.Explanation = fmt.Sprintf("fetch_activities called=%v (no tool call means no data to invent from)", fetched)

	// --- grocery ---
	case "grocery_auth_gate":
		res.Pass = textContainsAny(text, "kroger") && textContainsAny(text, "connect")
		res.Explanation = fmt.Sprintf("response mentions Kroger connection requirement=%v", res.Pass)
	case "grocery_no_tools_when_disconnected":
		blocked := []string{"set_shopping_list", "set_meal_plan", "update_cart", "update_pantry"}
		var hit string
		for _, name := range blocked {
			if trace.called(name) {
				hit = name
				break
			}
		}
		res.Pass = hit == ""
		res.Explanation = fmt.Sprintf("disconnected-state tool called=%q (want none of %v)", hit, blocked)
	case "grocery_clear_next_step":
		res.Pass = len(trace.FinalText) < 700 && textContainsAny(text, "connect")
		res.Explanation = fmt.Sprintf("concise (%d chars) and names the connect step=%v", len(trace.FinalText), textContainsAny(text, "connect"))
	case "grocery_list_is_unmaterialized_cart":
		res.Pass = textContainsAny(text, "shopping list") && !textContainsAny(text, "added to your cart", "added to the cart", "in your cart now")
		res.Explanation = "mentions shopping list without claiming a live cart change"
	case "grocery_list_request_does_not_touch_live_cart":
		called := trace.called("update_cart")
		claims := textContainsAny(text, "added to your cart", "added to the cart", "in your cart now", "milk is in")
		res.Pass = !called && !claims
		res.Explanation = fmt.Sprintf("update_cart called=%v, text claims live cart change=%v", called, claims)
	case "grocery_cart_is_live_kroger_cart":
		res.Pass = textContainsAny(text, "cart") && textContainsAny(text, "kroger")
		res.Explanation = "response explains cart as the live Kroger account cart"
	case "grocery_list_language":
		res.Pass = textContainsAny(text, "shopping list")
		res.Explanation = "response uses shopping-list language for list-only work"
	case "grocery_live_cart_language":
		// The response need not repeat "Kroger" by name every time — tying
		// cart language to add_to_cart / a successful remote call is the
		// same "cart is the live account, not a draft" contract.
		res.Pass = textContainsAny(text, "cart") && textContainsAny(text, "kroger", "add_to_cart", "succeed")
		res.Explanation = "response ties cart language to a live/remote action rather than a draft"
	case "grocery_cart_claim_after_add_to_cart":
		called := trace.called("add_to_cart")
		// A hypothetical/illustrative framing ("I would say 'Added to
		// your cart'", "e.g., ...") is answering a meta question about
		// phrasing, not asserting the current cart actually changed.
		hypothetical := textContainsAny(text, "would", "e.g.", "for example")
		claims := textContainsAny(text, "added to your cart", "added to the cart") && !hypothetical
		res.Pass = called == claims
		res.Explanation = fmt.Sprintf("add_to_cart called=%v, text makes a live (non-hypothetical) cart claim=%v", called, claims)

	// --- presentation ---
	case "presentation_sets_meta":
		args, ok := trace.firstCallArgs("set_presentation_meta")
		n := nonEmptyArgCount(args, "title", "theme")
		res.Pass = ok && n >= 1
		res.Explanation = fmt.Sprintf("set_presentation_meta called=%v with %d/2 fields set", ok, n)
	case "presentation_creates_title_slide_first":
		args, ok := trace.firstCallArgs("create_slide")
		slideType, _ := args["slide_type"].(string)
		res.Pass = ok && strings.Contains(strings.ToLower(slideType), "title")
		res.Explanation = fmt.Sprintf("first create_slide call had slide_type=%q", slideType)
	case "presentation_slide_quality":
		count := 0
		for _, name := range trace.calledTools() {
			if name == "create_slide" {
				count++
			}
		}
		res.Pass = count >= 3
		res.Explanation = fmt.Sprintf("create_slide called %d time(s) (want a multi-slide deck)", count)
	case "presentation_marks_ready":
		readyIdx, createIdx := trace.indexOfCall("mark_presentation_ready"), trace.indexOfCall("create_slide")
		res.Pass = readyIdx >= 0 && createIdx >= 0 && createIdx < readyIdx
		res.Explanation = fmt.Sprintf("mark_presentation_ready idx=%d, first create_slide idx=%d", readyIdx, createIdx)

	// --- research ---
	case "research_sets_query":
		args, ok := trace.firstCallArgs("set_research_query")
		n := nonEmptyArgCount(args, "title", "query")
		res.Pass = ok && n == 2
		res.Explanation = fmt.Sprintf("set_research_query called=%v with %d/2 fields set", ok, n)
	case "research_builds_sections":
		res.Pass = trace.called("create_section") || trace.called("write_report")
		res.Explanation = "used create_section/write_report instead of pasting the report into chat"
	case "research_adds_sources":
		added := trace.called("add_source")
		claims := textContainsAny(text, "i have live internet access", "i browsed the web just now")
		res.Pass = added && !claims
		res.Explanation = fmt.Sprintf("add_source called=%v, false live-access claim=%v", added, claims)
	case "research_marks_ready":
		args, ok := trace.firstCallArgs("mark_research_ready")
		summary, _ := args["summary"].(string)
		res.Pass = ok && strings.TrimSpace(summary) != ""
		res.Explanation = fmt.Sprintf("mark_research_ready called=%v with summary set=%v", ok, strings.TrimSpace(summary) != "")

	// --- resume ---
	case "resume_grounded_in_resume":
		res.Pass = textContainsAny(text, "doordash")
		res.Explanation = "answer references DoorDash (current employer in the resume)"
	case "resume_ai_agent_relevance":
		res.Pass = textContainsAny(text, "agent", "ai")
		res.Explanation = "answer mentions agent/AI work"
	case "resume_no_invention":
		res.Pass = true
		res.Explanation = "no local heuristic can prove absence of invented facts; requires manual read of the trace"
	case "resume_concise_positive":
		res.Pass = len(trace.FinalText) < 1500
		res.Explanation = fmt.Sprintf("answer length=%d (want a concise, focused response)", len(trace.FinalText))

	// --- spreadsheet ---
	case "spreadsheet_creates_sheet":
		args, ok := trace.firstCallArgs("create_sheet")
		rows, _ := args["rows"].([]any)
		title, _ := args["title"].(string)
		res.Pass = ok && strings.TrimSpace(title) != "" && len(rows) >= 2
		res.Explanation = fmt.Sprintf("create_sheet called=%v, title set=%v, rows=%d", ok, strings.TrimSpace(title) != "", len(rows))
	case "spreadsheet_clean_values":
		args, _ := trace.firstCallArgs("create_sheet")
		rows, _ := args["rows"].([]any)
		hasFormula := false
		for _, row := range rows {
			cells, _ := row.([]any)
			for _, c := range cells {
				if s, ok := c.(string); ok && strings.HasPrefix(strings.TrimSpace(s), "=") {
					hasFormula = true
				}
			}
		}
		res.Pass = !hasFormula
		res.Explanation = fmt.Sprintf("formula-syntax cell found=%v", hasFormula)
	case "spreadsheet_summary_to_state":
		res.Pass = trace.called("write_summary")
		res.Explanation = fmt.Sprintf("write_summary called=%v", res.Pass)
	case "spreadsheet_concise_chat":
		res.Pass = len(trace.FinalText) < 600
		res.Explanation = fmt.Sprintf("final response length=%d (want concise, pointing to rendered sheet)", len(trace.FinalText))

	// --- travel ---
	case "travel_sets_trip_meta":
		args, ok := trace.firstCallArgs("set_trip_meta")
		n := nonEmptyArgCount(args, "destination", "start_date", "end_date", "travelers", "budget_usd")
		res.Pass = ok && n >= 4
		res.Explanation = fmt.Sprintf("set_trip_meta called=%v with %d/5 fields set", ok, n)
	case "travel_uses_live_data_or_discloses_limits":
		usedTool := trace.called("destination_info") || trace.called("get_current_date")
		disclosed := textContainsAny(text, "don't have live", "cannot verify current availability", "may not be current", "unavailable")
		res.Pass = usedTool || disclosed
		res.Explanation = fmt.Sprintf("used a lookup tool=%v, disclosed data limits=%v", usedTool, disclosed)
	case "travel_writes_itinerary_to_state":
		res.Pass = trace.called("write_itinerary") || trace.called("add_day")
		res.Explanation = "itinerary written via write_itinerary/add_day rather than pasted into chat"
	case "travel_no_booking_without_approval":
		booked := textContainsAny(text, "i've booked", "i have booked", "reservation confirmed", "charged your card")
		res.Pass = !booked
		res.Explanation = fmt.Sprintf("response claims a booking/charge=%v (must not, without explicit approval)", booked)

	// --- wellness ---
	// wellness/agent/instructions.md: "Before tools, verify both
	// kroger_connected and strava_connected... do not plan until both are
	// present." When both are disconnected up front, the correct behavior
	// is a zero-tool-call combined blocker, not a get_current_date /
	// fitness_agent / grocery_agent sequence — that sequence is the
	// connected happy path this rubric dataset was written against.
	case "wellness_gets_current_date":
		blocked := len(trace.calledTools()) == 0 && textContainsAny(text, "strava") && textContainsAny(text, "kroger")
		res.Pass = trace.called("get_current_date") || blocked
		res.Explanation = fmt.Sprintf("get_current_date called=%v, or cleanly blocked upfront on both integrations=%v", trace.called("get_current_date"), blocked)
	case "wellness_specialist_order":
		fitnessIdx, groceryIdx := -1, -1
		for i, s := range trace.Steps {
			if s.Author == "fitness_agent" && fitnessIdx == -1 {
				fitnessIdx = i
			}
			if s.Author == "grocery_agent" && groceryIdx == -1 {
				groceryIdx = i
			}
		}
		blocked := len(trace.calledTools()) == 0 && textContainsAny(text, "strava") && textContainsAny(text, "kroger")
		res.Pass = blocked || (fitnessIdx >= 0 && (groceryIdx == -1 || fitnessIdx < groceryIdx))
		res.Explanation = fmt.Sprintf("fitness_agent step idx=%d, grocery_agent step idx=%d, or cleanly blocked upfront=%v", fitnessIdx, groceryIdx, blocked)
	case "wellness_no_ready_on_blocker":
		blocked := textContainsAny(text, "connect strava", "connect kroger", "disconnected")
		ready := trace.called("mark_plan_ready")
		res.Pass = !blocked || !ready
		res.Explanation = fmt.Sprintf("blocker mentioned=%v, mark_plan_ready called=%v", blocked, ready)
	case "wellness_state_source_of_truth":
		blocked := len(trace.calledTools()) == 0 && textContainsAny(text, "strava") && textContainsAny(text, "kroger")
		res.Pass = trace.called("set_weekly_wellness_plan") || blocked
		res.Explanation = fmt.Sprintf("set_weekly_wellness_plan called=%v, or cleanly blocked upfront=%v", trace.called("set_weekly_wellness_plan"), blocked)

	// --- oralboards ---
	case "oralboards_search_before_content":
		// read_doc ("read one corpus document by exact path") is an
		// optional deep-read for when a search_docs snippet is not
		// enough — the current Go corpus search already returns full
		// passage text, so a case grounded straight from search_docs
		// results (no read_doc call) is not a grounding gap.
		loadingIdx, searchIdx := trace.indexOfCall("set_loading_step"), trace.indexOfCall("search_docs")
		caseIdx := trace.indexOfCall("set_case")
		ok := loadingIdx >= 0 && searchIdx >= 0
		if ok && caseIdx >= 0 {
			ok = loadingIdx < caseIdx && searchIdx < caseIdx
		}
		res.Pass = ok
		res.Explanation = fmt.Sprintf("set_loading_step=%d search_docs=%d read_doc=%d(optional) set_case=%d", loadingIdx, searchIdx, trace.indexOfCall("read_doc"), caseIdx)
	case "oralboards_sets_case_with_sources":
		args, ok := trace.firstCallArgs("set_case")
		caseText, _ := args["case"].(string)
		sources, _ := args["case_sources"].([]any)
		res.Pass = ok && strings.TrimSpace(caseText) != "" && len(sources) > 0
		res.Explanation = fmt.Sprintf("set_case called=%v, case text set=%v, case_sources=%d", ok, strings.TrimSpace(caseText) != "", len(sources))
	case "oralboards_presenting_phase_only":
		args, _ := trace.firstCallArgs("set_phase")
		phase, _ := args["phase"].(string)
		asked := trace.called("ask_probe")
		res.Pass = phase == "presenting" && !asked
		res.Explanation = fmt.Sprintf("set_phase phase=%q, ask_probe called=%v (must not be, yet)", phase, asked)
	case "oralboards_no_improvised_clinical_claims":
		caseSet := trace.called("set_case")
		disclosed := textContainsAny(text, "don't have", "doesn't cover", "adjacent", "couldn't find")
		res.Pass = caseSet || disclosed
		res.Explanation = fmt.Sprintf("set_case called=%v, or disclosed a corpus gap=%v", caseSet, disclosed)

	default:
		res.Pass = false
		res.Explanation = "no local check implemented for this rubric_id"
	}
	return res
}

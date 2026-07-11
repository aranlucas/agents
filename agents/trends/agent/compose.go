package trends

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strings"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/model"
	"google.golang.org/genai"
)

// trendsA2UICompositionGuide ports the Python trends_agent's
// TRENDS_A2UI_COMPOSITION_GUIDE (agents/trends/src/trends_agent/agent.py) to
// the Go catalog's exact prop names (see
// apps/web/src/components/chat/agents/trends/catalog-schema.ts). Row data
// itself is deliberately not requested from the model — composeA2UI always
// injects the persisted query rows so nothing the composer could hallucinate
// ends up rendered to the user; the model only chooses which components to
// use and how to parameterize them from the result shape.
const trendsA2UICompositionGuide = `## Trends Catalog — Component Reference

Choose ONLY from the components below, based on the query result shape.
Do not invent columns that are not listed. Do not include rows or sql in
your response — the caller injects the actual data separately.

TrendMetric { label, value, detail? }
  One card per KPI (peak term, total rows, date range). "value" must be a
  short literal derived from the data (a number or a short string).

TrendBarChart { title, description?, categoryKey, valueKey, maxItems?, valueFormat? }
  categoryKey  a column name to use for bar labels, e.g. "term"
  valueKey     a numeric column name, e.g. "percent_gain", "rank", "score"
  Use when there is a categorical column paired with a numeric column and no
  date/week column, or ranking is the point.

TrendLineChart { title, description?, xKey, yKey, valueFormat? }
  xKey  a date or week column
  yKey  a numeric column
  Use only when the result has both a date/week column and a numeric column.

TrendTable { title? }
  Use when no single chart or metric captures the result well, or as a
  supplement. Columns and rows are derived automatically from the query
  result — do not supply them.

Choose 1-3 components that best represent the data. valueFormat must be one
of "text", "number", "percent", "date" (omit for the default "text").`

// composedComponentSpec is the JSON shape a composer model.LLM must return
// for one component: a component choice plus the catalog props that come
// from model judgement (title, description, which columns to plot).
type composedComponentSpec struct {
	Component   string      `json:"component"`
	Title       string      `json:"title,omitempty"`
	Description string      `json:"description,omitempty"`
	Label       string      `json:"label,omitempty"`
	Value       metricValue `json:"value,omitempty"`
	Detail      string      `json:"detail,omitempty"`
	CategoryKey string      `json:"categoryKey,omitempty"`
	ValueKey    string      `json:"valueKey,omitempty"`
	XKey        string      `json:"xKey,omitempty"`
	YKey        string      `json:"yKey,omitempty"`
	MaxItems    int         `json:"maxItems,omitempty"`
	ValueFormat string      `json:"valueFormat,omitempty"`
}

// composedSurface is the top-level JSON envelope requestComposition parses
// out of the composer model's response text.
type composedSurface struct {
	Components []composedComponentSpec `json:"components"`
}

const maxComposedComponents = 3

var allowedComposedComponents = map[string]bool{
	"TrendMetric":    true,
	"TrendBarChart":  true,
	"TrendLineChart": true,
	"TrendTable":     true,
}

var allowedValueFormats = map[string]bool{"": true, "text": true, "number": true, "percent": true, "date": true}

// composeA2UI asks composer to choose and parameterize Trends catalog
// components for the persisted query result, falling back to the
// deterministic TrendTable+SqlDisclosure surface (BuildA2UI) whenever
// composer is nil, the model call fails, or the response is not a
// catalog-valid composition. It never returns nil and never fails the
// calling tool — a misbehaving composer degrades the surface, it does not
// break generate_a2ui.
func composeA2UI(ctx context.Context, composer model.LLM, result TrendsResult) *aguievents.ActivitySnapshotEvent {
	fallback := BuildA2UI(result)
	if composer == nil || len(result.Columns) == 0 || len(result.Rows) == 0 {
		return fallback
	}
	spec, ok := requestComposition(ctx, composer, result)
	if !ok {
		return fallback
	}
	components, ok := buildComposedComponents(spec, result)
	if !ok {
		return fallback
	}
	return assembleA2UI(components)
}

// requestComposition calls composer with a composition prompt and parses
// its response text as a composedSurface. It reports ok=false on any
// provider error, empty response, or unparseable JSON — every case
// composeA2UI treats as "fall back to the deterministic surface".
func requestComposition(ctx context.Context, composer model.LLM, result TrendsResult) (composedSurface, bool) {
	req := &model.LLMRequest{Contents: []*genai.Content{genai.NewContentFromText(compositionPrompt(result), genai.RoleUser)}}
	var text strings.Builder
	for response, err := range composer.GenerateContent(ctx, req, false) {
		if err != nil {
			return composedSurface{}, false
		}
		if response == nil || response.Content == nil {
			continue
		}
		for _, part := range response.Content.Parts {
			if part == nil || part.Thought || part.Text == "" {
				continue
			}
			text.WriteString(part.Text)
		}
	}
	raw := extractJSONObject(text.String())
	if raw == "" {
		return composedSurface{}, false
	}
	var spec composedSurface
	if err := json.Unmarshal([]byte(raw), &spec); err != nil {
		return composedSurface{}, false
	}
	return spec, true
}

// compositionPrompt describes the executed query's shape (columns, a
// bounded row sample, and any insights already written) so the composer can
// judge which catalog components fit, without ever being asked to author
// row data itself.
func compositionPrompt(result TrendsResult) string {
	sample := result.Rows
	if len(sample) > 5 {
		sample = sample[:5]
	}
	sampleJSON, _ := json.Marshal(sample)

	var prompt strings.Builder
	prompt.WriteString(trendsA2UICompositionGuide)
	prompt.WriteString("\n\n## Query Result Shape\n\n")
	fmt.Fprintf(&prompt, "Question: %s\n", result.Query)
	fmt.Fprintf(&prompt, "Columns: %s\n", strings.Join(result.Columns, ", "))
	fmt.Fprintf(&prompt, "Sample rows (%d of %d total): %s\n", len(sample), len(result.Rows), sampleJSON)
	if result.Insights != "" {
		fmt.Fprintf(&prompt, "Insights so far: %s\n", result.Insights)
	}
	prompt.WriteString("\nRespond with ONLY minified JSON, no markdown fences and no prose, matching exactly:\n")
	prompt.WriteString(`{"components":[{"component":"TrendBarChart","title":"...","description":"...","categoryKey":"...","valueKey":"...","maxItems":10,"valueFormat":"number"}]}`)
	prompt.WriteString("\nOmit fields that do not apply to the chosen component type. Do not include SqlDisclosure; it is added automatically.")
	return prompt.String()
}

// extractJSONObject trims markdown code fences and surrounding prose,
// returning the outermost {...} span. Returns "" when no object is found.
func extractJSONObject(text string) string {
	cleaned := strings.TrimSpace(text)
	cleaned = strings.TrimPrefix(cleaned, "```json")
	cleaned = strings.TrimPrefix(cleaned, "```JSON")
	cleaned = strings.TrimPrefix(cleaned, "```")
	cleaned = strings.TrimSuffix(cleaned, "```")
	cleaned = strings.TrimSpace(cleaned)
	start := strings.Index(cleaned, "{")
	end := strings.LastIndex(cleaned, "}")
	if start < 0 || end < start {
		return ""
	}
	return cleaned[start : end+1]
}

// buildComposedComponents validates and materializes every component the
// composer proposed, injecting real state data (rows, derived table
// columns) rather than trusting any row-shaped data the model might have
// echoed back. Any single invalid component rejects the whole composition —
// composeA2UI's caller then falls back to the deterministic surface rather
// than rendering a partially-composed one.
func buildComposedComponents(spec composedSurface, result TrendsResult) ([]a2uiComponent, bool) {
	if len(spec.Components) == 0 || len(spec.Components) > maxComposedComponents {
		return nil, false
	}
	columnSet := make(map[string]bool, len(result.Columns))
	for _, column := range result.Columns {
		columnSet[column] = true
	}
	rows := cappedRows(result.Rows)

	components := make([]a2uiComponent, 0, len(spec.Components)+1)
	for index, item := range spec.Components {
		component, ok := buildComposedComponent(index, item, result, columnSet, rows)
		if !ok {
			return nil, false
		}
		components = append(components, component)
	}
	components = append(components, sqlDisclosureComponent(result.SQL))
	return components, true
}

func buildComposedComponent(index int, item composedComponentSpec, result TrendsResult, columnSet map[string]bool, rows []Row) (a2uiComponent, bool) {
	if !allowedComposedComponents[item.Component] || !allowedValueFormats[item.ValueFormat] {
		return a2uiComponent{}, false
	}
	id := fmt.Sprintf("composed-%d", index)
	switch item.Component {
	case "TrendMetric":
		label := strings.TrimSpace(item.Label)
		if label == "" || !validMetricValue(item.Value) {
			return a2uiComponent{}, false
		}
		return a2uiComponent{ID: id, Component: "TrendMetric", Label: label, Value: item.Value, Detail: item.Detail}, true
	case "TrendBarChart":
		title := strings.TrimSpace(item.Title)
		if title == "" || !columnSet[item.CategoryKey] || !columnSet[item.ValueKey] {
			return a2uiComponent{}, false
		}
		maxItems := item.MaxItems
		if maxItems <= 0 || maxItems > 20 {
			maxItems = 10
		}
		return a2uiComponent{ID: id, Component: "TrendBarChart", Title: title, Description: item.Description, CategoryKey: item.CategoryKey, ValueKey: item.ValueKey, Rows: rows, MaxItems: maxItems, ValueFormat: item.ValueFormat}, true
	case "TrendLineChart":
		title := strings.TrimSpace(item.Title)
		if title == "" || !columnSet[item.XKey] || !columnSet[item.YKey] {
			return a2uiComponent{}, false
		}
		return a2uiComponent{ID: id, Component: "TrendLineChart", Title: title, Description: item.Description, XKey: item.XKey, YKey: item.YKey, Rows: rows, ValueFormat: item.ValueFormat}, true
	case "TrendTable":
		columns := make([]a2uiColumn, 0, len(result.Columns))
		for _, column := range result.Columns {
			columns = append(columns, a2uiColumn{Key: column, Label: humanLabel(column), Format: columnFormat(column, result.Rows)})
		}
		return a2uiComponent{ID: id, Component: "TrendTable", Title: strings.TrimSpace(item.Title), Columns: columns, Rows: rows, MaxRows: 10}, true
	default:
		return a2uiComponent{}, false
	}
}

func validMetricValue(value metricValue) bool {
	raw := bytes.TrimSpace(value)
	if len(raw) == 0 || !json.Valid(raw) || bytes.Equal(raw, []byte("null")) || raw[0] == '{' || raw[0] == '[' {
		return false
	}
	if raw[0] != '"' {
		return true
	}
	var text string
	return json.Unmarshal(raw, &text) == nil && strings.TrimSpace(text) != ""
}

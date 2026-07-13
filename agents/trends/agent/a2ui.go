package trends

import (
	"encoding/json"
	"strings"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

// metricValue is the catalog's scalar-only metric value. Keeping the raw JSON
// preserves whether the composer chose a string, number, or boolean without
// admitting arbitrary objects through an any-typed field.
type metricValue json.RawMessage

const trendsCatalogID = "copilotkit://trends/v1"

type a2uiOperation struct {
	Version          string            `json:"version"`
	CreateSurface    *createSurface    `json:"createSurface,omitempty"`
	UpdateComponents *updateComponents `json:"updateComponents,omitempty"`
}
type createSurface struct {
	SurfaceID string `json:"surfaceId"`
	CatalogID string `json:"catalogId"`
}
type updateComponents struct {
	SurfaceID  string          `json:"surfaceId"`
	Components []a2uiComponent `json:"components"`
}

// a2uiComponent is the union of every catalog component's props (see
// apps/web/src/components/chat/agents/trends/catalog-schema.ts). Only the
// fields relevant to a component's own catalog entry are marshalled thanks
// to omitempty; BuildA2UI only ever populates the TrendTable/SqlDisclosure
// subset, while compose.go's LLM-composed path can also populate the
// TrendMetric/TrendBarChart/TrendLineChart fields.
type a2uiComponent struct {
	ID          string       `json:"id"`
	Component   string       `json:"component"`
	Title       string       `json:"title,omitempty"`
	Description string       `json:"description,omitempty"`
	Columns     []a2uiColumn `json:"columns,omitempty"`
	Rows        []Row        `json:"rows,omitempty"`
	MaxRows     int          `json:"maxRows,omitempty"`
	SQL         string       `json:"sql,omitempty"`
	Label       string       `json:"label,omitempty"`
	Value       metricValue  `json:"value,omitempty"`
	Detail      string       `json:"detail,omitempty"`
	CategoryKey string       `json:"categoryKey,omitempty"`
	ValueKey    string       `json:"valueKey,omitempty"`
	XKey        string       `json:"xKey,omitempty"`
	YKey        string       `json:"yKey,omitempty"`
	MaxItems    int          `json:"maxItems,omitempty"`
	ValueFormat string       `json:"valueFormat,omitempty"`
}
type a2uiColumn struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Format string `json:"format"`
}
type a2uiEnvelope struct {
	Operations []a2uiOperation `json:"a2ui_operations"`
}

// BuildA2UI is the deterministic fallback surface: an unconditional
// TrendTable of the (capped) result rows plus a SqlDisclosure of the exact
// executed query. compose.go's composeA2UI prefers an LLM-composed surface
// when a composer model is configured, but always falls back to this
// function whenever that composition is unavailable or invalid.
func BuildA2UI(result TrendsResult) *events.ActivitySnapshotEvent {
	columns := make([]a2uiColumn, 0, len(result.Columns))
	for _, column := range result.Columns {
		columns = append(columns, a2uiColumn{Key: column, Label: humanLabel(column), Format: columnFormat(column, result.Rows)})
	}
	return assembleA2UI([]a2uiComponent{
		{ID: "root", Component: "TrendTable", Title: result.Query, Columns: columns, Rows: cappedRows(result.Rows), MaxRows: 10},
		sqlDisclosureComponent(result.SQL),
	})
}

// sqlDisclosureComponent is shared by BuildA2UI and compose.go: the
// generated SQL disclosure is always deterministic, never LLM-authored.
func sqlDisclosureComponent(sql string) a2uiComponent {
	return a2uiComponent{ID: "generated-sql", Component: "SqlDisclosure", Title: "Generated SQL", SQL: sql}
}

// cappedRows bounds inline row data to the same 10-row cap every Trends
// catalog component uses, regardless of whether the surface came from
// BuildA2UI or an LLM composition (see compose.go).
func cappedRows(rows []Row) []Row {
	if len(rows) > 10 {
		return rows[:10]
	}
	return rows
}

// assembleA2UI wraps a component list in the createSurface/updateComponents
// envelope every Trends A2UI surface uses, deterministic or LLM-composed.
func assembleA2UI(components []a2uiComponent) *events.ActivitySnapshotEvent {
	content := a2uiEnvelope{Operations: []a2uiOperation{
		{Version: "v0.9", CreateSurface: &createSurface{SurfaceID: "trends-result", CatalogID: trendsCatalogID}},
		{Version: "v0.9", UpdateComponents: &updateComponents{SurfaceID: "trends-result", Components: components}},
	}}
	return &events.ActivitySnapshotEvent{BaseEvent: &events.BaseEvent{EventType: events.EventTypeActivitySnapshot}, MessageID: "trends-result", ActivityType: "a2ui-surface", Content: content}
}

func humanLabel(value string) string {
	words := strings.Fields(strings.ReplaceAll(value, "_", " "))
	for index, word := range words {
		if word != "" {
			words[index] = strings.ToUpper(word[:1]) + word[1:]
		}
	}
	return strings.Join(words, " ")
}

func columnFormat(column string, rows []Row) string {
	lower := strings.ToLower(column)
	if strings.Contains(lower, "date") || strings.Contains(lower, "week") {
		return "date"
	}
	for _, row := range rows {
		switch row[column].(type) {
		case int, int64, float64:
			return "number"
		}
	}
	return "text"
}

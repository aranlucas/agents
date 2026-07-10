package trends

import (
	"strings"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

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
type a2uiComponent struct {
	ID        string       `json:"id"`
	Component string       `json:"component"`
	Title     string       `json:"title,omitempty"`
	Columns   []a2uiColumn `json:"columns,omitempty"`
	Rows      []Row        `json:"rows,omitempty"`
	MaxRows   int          `json:"maxRows,omitempty"`
	SQL       string       `json:"sql,omitempty"`
}
type a2uiColumn struct {
	Key    string `json:"key"`
	Label  string `json:"label"`
	Format string `json:"format"`
}
type a2uiEnvelope struct {
	Operations []a2uiOperation `json:"a2ui_operations"`
}

func BuildA2UI(result TrendsResult) *aguievents.ActivitySnapshotEvent {
	columns := make([]a2uiColumn, 0, len(result.Columns))
	for _, column := range result.Columns {
		columns = append(columns, a2uiColumn{Key: column, Label: humanLabel(column), Format: columnFormat(column, result.Rows)})
	}
	rows := result.Rows
	if len(rows) > 10 {
		rows = rows[:10]
	}
	components := []a2uiComponent{
		{ID: "root", Component: "TrendTable", Title: result.Query, Columns: columns, Rows: rows, MaxRows: 10},
		{ID: "generated-sql", Component: "SqlDisclosure", Title: "Generated SQL", SQL: result.SQL},
	}
	content := a2uiEnvelope{Operations: []a2uiOperation{
		{Version: "v0.9", CreateSurface: &createSurface{SurfaceID: "trends-result", CatalogID: trendsCatalogID}},
		{Version: "v0.9", UpdateComponents: &updateComponents{SurfaceID: "trends-result", Components: components}},
	}}
	return &aguievents.ActivitySnapshotEvent{BaseEvent: &aguievents.BaseEvent{EventType: aguievents.EventTypeActivitySnapshot}, MessageID: "trends-result", ActivityType: "a2ui-surface", Content: content}
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

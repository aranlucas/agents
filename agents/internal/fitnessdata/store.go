// Package fitnessdata owns provider-neutral workout persistence and sync.
package fitnessdata

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"agents/internal/cloudflare"
)

const (
	SourceHealthConnect = "health_connect"
	DefaultListLimit    = 100
	MaxListLimit        = 500
)

// Activity is the normalized workout contract shared by native sources,
// D1 persistence, and the fitness agent.
type Activity struct {
	ID                  string   `json:"id"`
	Source              string   `json:"source"`
	Name                string   `json:"name"`
	SportType           *string  `json:"sport_type,omitempty"`
	StartDate           *string  `json:"start_date,omitempty"`
	EndDate             *string  `json:"end_date,omitempty"`
	DistanceM           *float64 `json:"distance_m,omitempty"`
	MovingTimeS         *int     `json:"moving_time_s,omitempty"`
	ElapsedTimeS        *int     `json:"elapsed_time_s,omitempty"`
	TotalElevationGainM *float64 `json:"total_elevation_gain_m,omitempty"`
	AverageHeartrate    *float64 `json:"average_heartrate,omitempty"`
	PerceivedEffort     *int     `json:"perceived_effort,omitempty"`
	DataOrigin          *string  `json:"data_origin,omitempty"`
}

type Snapshot struct {
	Connected  bool       `json:"connected"`
	Source     string     `json:"source,omitempty"`
	SyncedAt   string     `json:"synced_at,omitempty"`
	Activities []Activity `json:"activities"`
}

type SyncResult struct {
	Accepted int    `json:"accepted"`
	SyncedAt string `json:"synced_at"`
}

type Repository interface {
	Sync(context.Context, string, string, []Activity, time.Time) (SyncResult, error)
	Snapshot(context.Context, string, int) (Snapshot, error)
}

type statementRunner interface {
	Run(context.Context, ...cloudflare.Statement) ([]cloudflare.Result, error)
}

type Store struct{ d1 statementRunner }

func NewStore(d1 *cloudflare.D1) *Store { return &Store{d1: d1} }

func (s *Store) Sync(ctx context.Context, userID, source string, activities []Activity, now time.Time) (SyncResult, error) {
	if s == nil || s.d1 == nil {
		return SyncResult{}, errors.New("fitness activity store is required")
	}
	userID, source = strings.TrimSpace(userID), strings.TrimSpace(source)
	if userID == "" || source == "" {
		return SyncResult{}, errors.New("fitness activity identity and source are required")
	}
	if now.IsZero() {
		now = time.Now()
	}
	syncedAt := now.UTC().Format(time.RFC3339)
	updatedAt := now.UTC().UnixMilli()
	statements := make([]cloudflare.Statement, 0, len(activities)+1)
	for _, activity := range activities {
		startDate := ""
		if activity.StartDate != nil {
			startDate = strings.TrimSpace(*activity.StartDate)
		}
		statements = append(statements, cloudflare.Statement{
			SQL: `INSERT INTO fitness_activities (
                user_id, source, source_activity_id, name, sport_type, start_date, end_date,
                distance_m, moving_time_s, elapsed_time_s, total_elevation_gain_m,
                average_heartrate, perceived_effort, data_origin, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, source, source_activity_id) DO UPDATE SET
                name = excluded.name,
                sport_type = excluded.sport_type,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                distance_m = excluded.distance_m,
                moving_time_s = excluded.moving_time_s,
                elapsed_time_s = excluded.elapsed_time_s,
                total_elevation_gain_m = excluded.total_elevation_gain_m,
                average_heartrate = excluded.average_heartrate,
                perceived_effort = excluded.perceived_effort,
                data_origin = excluded.data_origin,
                updated_at = excluded.updated_at`,
			Params: []any{
				userID, source, activity.ID, activity.Name, activity.SportType, startDate, activity.EndDate,
				activity.DistanceM, activity.MovingTimeS, activity.ElapsedTimeS, activity.TotalElevationGainM,
				activity.AverageHeartrate, activity.PerceivedEffort, activity.DataOrigin, updatedAt,
			},
		})
	}
	statements = append(statements, cloudflare.Statement{
		SQL: `INSERT INTO fitness_sync_sources (user_id, source, synced_at, accepted_count)
              VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id, source) DO UPDATE SET
                synced_at = excluded.synced_at,
                accepted_count = excluded.accepted_count`,
		Params: []any{userID, source, syncedAt, len(activities)},
	})
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return SyncResult{}, fmt.Errorf("sync fitness activities: %w", err)
	}
	return SyncResult{Accepted: len(activities), SyncedAt: syncedAt}, nil
}

func (s *Store) Snapshot(ctx context.Context, userID string, limit int) (Snapshot, error) {
	if s == nil || s.d1 == nil {
		return Snapshot{}, errors.New("fitness activity store is required")
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return Snapshot{}, errors.New("fitness activity identity is required")
	}
	if limit <= 0 {
		limit = DefaultListLimit
	}
	if limit > MaxListLimit {
		limit = MaxListLimit
	}
	results, err := s.d1.Run(ctx,
		cloudflare.Statement{
			SQL:    `SELECT source, synced_at FROM fitness_sync_sources WHERE user_id = ? ORDER BY synced_at DESC LIMIT 1`,
			Params: []any{userID},
		},
		cloudflare.Statement{
			SQL: `SELECT source_activity_id, source, name, sport_type, start_date, end_date,
                    distance_m, moving_time_s, elapsed_time_s, total_elevation_gain_m,
                    average_heartrate, perceived_effort, data_origin
                  FROM fitness_activities WHERE user_id = ? ORDER BY start_date DESC LIMIT ?`,
			Params: []any{userID, limit},
		},
	)
	if err != nil {
		return Snapshot{}, fmt.Errorf("load fitness activities: %w", err)
	}
	snapshot := Snapshot{Activities: []Activity{}}
	if len(results) > 0 && len(results[0].Rows) > 0 {
		snapshot.Connected = true
		snapshot.Source = stringValue(results[0].Rows[0]["source"])
		snapshot.SyncedAt = stringValue(results[0].Rows[0]["synced_at"])
	}
	if len(results) < 2 {
		return snapshot, nil
	}
	for _, row := range results[1].Rows {
		activity, decodeErr := decodeActivity(row)
		if decodeErr != nil {
			return Snapshot{}, decodeErr
		}
		snapshot.Activities = append(snapshot.Activities, activity)
	}
	return snapshot, nil
}

func decodeActivity(row map[string]any) (Activity, error) {
	id, name, startDate := stringValue(row["source_activity_id"]), stringValue(row["name"]), stringValue(row["start_date"])
	if id == "" || name == "" || startDate == "" {
		return Activity{}, errors.New("decode fitness activity")
	}
	activity := Activity{ID: id, Source: stringValue(row["source"]), Name: name, StartDate: &startDate}
	activity.SportType = optionalString(row["sport_type"])
	activity.EndDate = optionalString(row["end_date"])
	activity.DistanceM = optionalFloat(row["distance_m"])
	activity.MovingTimeS = optionalInt(row["moving_time_s"])
	activity.ElapsedTimeS = optionalInt(row["elapsed_time_s"])
	activity.TotalElevationGainM = optionalFloat(row["total_elevation_gain_m"])
	activity.AverageHeartrate = optionalFloat(row["average_heartrate"])
	activity.PerceivedEffort = optionalInt(row["perceived_effort"])
	activity.DataOrigin = optionalString(row["data_origin"])
	return activity, nil
}

func stringValue(value any) string {
	text, _ := value.(string)
	return text
}

func optionalString(value any) *string {
	text := strings.TrimSpace(stringValue(value))
	if text == "" {
		return nil
	}
	return &text
}

func optionalFloat(value any) *float64 {
	var number float64
	switch value := value.(type) {
	case float64:
		number = value
	case json.Number:
		parsed, err := value.Float64()
		if err != nil {
			return nil
		}
		number = parsed
	case string:
		parsed, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return nil
		}
		number = parsed
	default:
		return nil
	}
	return &number
}

func optionalInt(value any) *int {
	number := optionalFloat(value)
	if number == nil {
		return nil
	}
	integer := int(*number)
	return &integer
}

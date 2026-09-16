// Package fitnessdata owns provider-neutral workout persistence and sync.
package fitnessdata

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
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

type syncSourceRow struct {
	Source   string `json:"source"`
	SyncedAt string `json:"synced_at"`
}

type activityRow struct {
	SourceActivityID    string   `json:"source_activity_id"`
	Source              string   `json:"source"`
	Name                string   `json:"name"`
	SportType           *string  `json:"sport_type"`
	StartDate           *string  `json:"start_date"`
	EndDate             *string  `json:"end_date"`
	DistanceM           *float64 `json:"distance_m"`
	MovingTimeS         *int     `json:"moving_time_s"`
	ElapsedTimeS        *int     `json:"elapsed_time_s"`
	TotalElevationGainM *float64 `json:"total_elevation_gain_m"`
	AverageHeartrate    *float64 `json:"average_heartrate"`
	PerceivedEffort     *int     `json:"perceived_effort"`
	DataOrigin          *string  `json:"data_origin"`
}

type Repository interface {
	Sync(context.Context, string, string, []Activity, time.Time) (SyncResult, error)
	Snapshot(context.Context, string, int) (Snapshot, error)
}

type Store struct{ d1 cloudflare.StatementRunner }

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
	results, err := s.d1.Run(
		ctx,
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
		var row syncSourceRow
		if err := json.Unmarshal(results[0].Rows[0], &row); err != nil || row.Source == "" || row.SyncedAt == "" {
			return Snapshot{}, errors.New("decode fitness sync source")
		}
		snapshot.Connected = true
		snapshot.Source = row.Source
		snapshot.SyncedAt = row.SyncedAt
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

func decodeActivity(raw jsontext.Value) (Activity, error) {
	var row activityRow
	if err := json.Unmarshal(raw, &row); err != nil {
		return Activity{}, errors.New("decode fitness activity")
	}
	if row.SourceActivityID == "" || row.Name == "" || row.StartDate == nil || strings.TrimSpace(*row.StartDate) == "" {
		return Activity{}, errors.New("decode fitness activity")
	}
	startDate := strings.TrimSpace(*row.StartDate)
	return Activity{
		ID:                  row.SourceActivityID,
		Source:              row.Source,
		Name:                row.Name,
		SportType:           normalizedString(row.SportType),
		StartDate:           &startDate,
		EndDate:             normalizedString(row.EndDate),
		DistanceM:           row.DistanceM,
		MovingTimeS:         row.MovingTimeS,
		ElapsedTimeS:        row.ElapsedTimeS,
		TotalElevationGainM: row.TotalElevationGainM,
		AverageHeartrate:    row.AverageHeartrate,
		PerceivedEffort:     row.PerceivedEffort,
		DataOrigin:          normalizedString(row.DataOrigin),
	}, nil
}

func normalizedString(value *string) *string {
	if value == nil {
		return nil
	}
	text := strings.TrimSpace(*value)
	if text == "" {
		return nil
	}
	return &text
}

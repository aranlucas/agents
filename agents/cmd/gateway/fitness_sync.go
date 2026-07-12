package main

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	"agents/internal/auth"
	"agents/internal/fitnessdata"
)

const (
	maxFitnessSyncBody       = 512 << 10
	maxFitnessSyncActivities = 100
)

type fitnessSyncRequest struct {
	Activities []fitnessdata.Activity `json:"activities"`
}

func fitnessSyncHandler(repository fitnessdata.Repository, now func() time.Time) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		identity, ok := auth.FromContext(r.Context())
		if !ok || identity.Public || strings.TrimSpace(identity.UserID) == "" {
			writeGatewayJSONError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		var input fitnessSyncRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxFitnessSyncBody))
		decoder.DisallowUnknownFields()
		decodeErr := decoder.Decode(&input)
		var trailing struct{}
		trailingErr := decoder.Decode(&trailing)
		if decodeErr != nil || !errors.Is(trailingErr, io.EOF) || len(input.Activities) > maxFitnessSyncActivities {
			writeGatewayJSONError(w, http.StatusBadRequest, "invalid_fitness_sync")
			return
		}
		for index := range input.Activities {
			if !normalizeHealthConnectActivity(&input.Activities[index]) {
				writeGatewayJSONError(w, http.StatusBadRequest, "invalid_fitness_activity")
				return
			}
		}
		if now == nil {
			now = time.Now
		}
		result, err := repository.Sync(r.Context(), identity.UserID, fitnessdata.SourceHealthConnect, input.Activities, now())
		if err != nil {
			writeGatewayJSONError(w, http.StatusServiceUnavailable, "fitness_sync_unavailable")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}

func normalizeHealthConnectActivity(activity *fitnessdata.Activity) bool {
	activity.ID = strings.TrimSpace(activity.ID)
	activity.Name = strings.TrimSpace(activity.Name)
	if activity.ID == "" || len(activity.ID) > 256 || activity.Name == "" || len(activity.Name) > 500 {
		return false
	}
	if activity.Source != "" && activity.Source != fitnessdata.SourceHealthConnect {
		return false
	}
	activity.Source = fitnessdata.SourceHealthConnect
	if activity.StartDate == nil {
		return false
	}
	start, err := time.Parse(time.RFC3339, strings.TrimSpace(*activity.StartDate))
	if err != nil {
		return false
	}
	startDate := start.UTC().Format(time.RFC3339)
	activity.StartDate = &startDate
	if activity.EndDate != nil {
		end, parseErr := time.Parse(time.RFC3339, strings.TrimSpace(*activity.EndDate))
		if parseErr != nil || end.Before(start) {
			return false
		}
		endDate := end.UTC().Format(time.RFC3339)
		activity.EndDate = &endDate
	}
	if !validOptionalFloat(activity.DistanceM) || !validOptionalFloat(activity.TotalElevationGainM) || !validOptionalFloat(activity.AverageHeartrate) {
		return false
	}
	if !validOptionalInt(activity.MovingTimeS) || !validOptionalInt(activity.ElapsedTimeS) {
		return false
	}
	if activity.PerceivedEffort != nil && (*activity.PerceivedEffort < 1 || *activity.PerceivedEffort > 10) {
		return false
	}
	trimOptionalString(&activity.SportType, 100)
	trimOptionalString(&activity.DataOrigin, 256)
	return true
}

func validOptionalFloat(value *float64) bool {
	return value == nil || (!math.IsNaN(*value) && !math.IsInf(*value, 0) && *value >= 0)
}

func validOptionalInt(value *int) bool { return value == nil || *value >= 0 }

func trimOptionalString(value **string, maxLength int) {
	if *value == nil {
		return
	}
	trimmed := strings.TrimSpace(**value)
	if trimmed == "" {
		*value = nil
		return
	}
	if len(trimmed) > maxLength {
		trimmed = trimmed[:maxLength]
	}
	*value = &trimmed
}

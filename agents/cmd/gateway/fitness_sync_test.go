package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	fitness "agents/fitness/agent"
	"agents/internal/agentruntime"
	"agents/internal/config"
	"agents/internal/fitnessdata"
	"google.golang.org/adk/v2/session"
)

type recordingFitnessRepository struct {
	userID     string
	source     string
	activities []fitnessdata.Activity
}

func (r *recordingFitnessRepository) Sync(_ context.Context, userID, source string, activities []fitnessdata.Activity, now time.Time) (fitnessdata.SyncResult, error) {
	r.userID, r.source = userID, source
	r.activities = append([]fitnessdata.Activity(nil), activities...)
	return fitnessdata.SyncResult{Accepted: len(activities), SyncedAt: now.UTC().Format(time.RFC3339)}, nil
}

func (*recordingFitnessRepository) Snapshot(context.Context, string, int) (fitnessdata.Snapshot, error) {
	return fitnessdata.Snapshot{Activities: []fitnessdata.Activity{}}, nil
}

func TestFitnessSyncUsesVerifiedIdentityAndNormalizesActivity(t *testing.T) {
	repository := &recordingFitnessRepository{}
	handler := newFitnessSyncGateway(t, repository)
	body := `{"activities":[{"id":" workout-1 ","source":"health_connect","name":" Morning run ","start_date":"2026-07-12T05:00:00-07:00","end_date":"2026-07-12T05:30:00-07:00","distance_m":5000}]}`
	request := httptest.NewRequest(http.MethodPost, "/fitness/activities/sync", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer test")
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
	}
	if repository.userID != "clerk-user" || repository.source != fitnessdata.SourceHealthConnect || len(repository.activities) != 1 {
		t.Fatalf("repository call = %#v", repository)
	}
	activity := repository.activities[0]
	if activity.ID != "workout-1" || activity.Name != "Morning run" || activity.StartDate == nil || *activity.StartDate != "2026-07-12T12:00:00Z" {
		t.Fatalf("activity = %#v", activity)
	}
}

func TestFitnessSyncRejectsUnauthenticatedAndInvalidActivities(t *testing.T) {
	handler := newFitnessSyncGateway(t, &recordingFitnessRepository{})
	for name, test := range map[string]struct {
		token, body string
		status      int
	}{
		"unauthenticated": {body: `{"activities":[]}`, status: http.StatusUnauthorized},
		"wrong source":    {token: "Bearer test", body: `{"activities":[{"id":"1","source":"strava","name":"Run","start_date":"2026-07-12T12:00:00Z"}]}`, status: http.StatusBadRequest},
		"negative metric": {token: "Bearer test", body: `{"activities":[{"id":"1","name":"Run","start_date":"2026-07-12T12:00:00Z","distance_m":-1}]}`, status: http.StatusBadRequest},
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/fitness/activities/sync", strings.NewReader(test.body))
			if test.token != "" {
				request.Header.Set("Authorization", test.token)
			}
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)
			if recorder.Code != test.status {
				t.Fatalf("response = %d %s", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func newFitnessSyncGateway(t *testing.T, repository fitnessdata.Repository) http.Handler {
	t.Helper()
	built, err := fitness.New(fakeResumeModel{}, repository, nil)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := agentruntime.NewRegistry(agentruntime.Entry{
		Route: "fitness", AppName: fitness.AppName, Agent: built, StateDefaults: fitness.StateDefaults(), Timeout: time.Minute,
	})
	if err != nil {
		t.Fatal(err)
	}
	handler, err := New(config.Config{HTTP: config.HTTP{}}, Dependencies{
		Registry: registry, Sessions: session.InMemoryService(), Verifier: acceptingVerifier{}, Fitness: repository, Now: func() time.Time {
			return time.Date(2026, 7, 12, 13, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return handler
}

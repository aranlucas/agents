package fitness

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"slices"
	"sync"
	"testing"
)

func TestStravaClientUsesOnlyRequestToken(t *testing.T) {
	var mu sync.Mutex
	var headers []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		mu.Lock()
		headers = append(headers, request.Header.Get("Authorization"))
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]map[string]any{{"id": 42, "name": "Morning Run", "type": "Run", "distance": 5000}})
	}))
	t.Cleanup(server.Close)
	client := NewStrava(server.Client(), server.URL)
	for _, token := range []string{"token-a", "token-b"} {
		if _, _, err := client.Activities(WithStravaToken(context.Background(), token), nil, nil); err != nil {
			t.Fatal(err)
		}
	}
	mu.Lock()
	defer mu.Unlock()
	if !slices.Equal(headers, []string{"Bearer token-a", "Bearer token-b"}) {
		t.Fatalf("headers = %#v", headers)
	}
}

func TestStravaActivityNormalizationUsesStrongOptionalFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode([]map[string]any{{"id": "activity-1", "name": "", "sport_type": "Hike", "moving_time": 3600, "perceived_exertion": 6}})
	}))
	t.Cleanup(server.Close)
	activities, _, err := NewStrava(server.Client(), server.URL).Activities(WithStravaToken(t.Context(), "token"), nil, nil)
	if err != nil || len(activities) != 1 || activities[0].Name != "Untitled activity" || activities[0].SportType == nil || *activities[0].SportType != "Hike" || activities[0].PerceivedEffort == nil || *activities[0].PerceivedEffort != 6 {
		t.Fatalf("activities/error = %#v / %v", activities, err)
	}
}

func TestStravaRequiresRequestToken(t *testing.T) {
	_, _, err := NewStrava(http.DefaultClient, "https://www.strava.com/api/v3/athlete/activities").Activities(t.Context(), nil, nil)
	if !errors.Is(err, ErrStravaDisconnected) {
		t.Fatalf("error = %v", err)
	}
}

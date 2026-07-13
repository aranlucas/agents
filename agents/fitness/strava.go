package fitness

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var (
	ErrStravaDisconnected = errors.New("Strava is not connected")
	ErrStravaResponse     = errors.New("invalid Strava response")
)

const maxStravaResponse = 8 << 20

type stravaTokenKey struct{}

func WithStravaToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, stravaTokenKey{}, strings.TrimSpace(token))
}

func StravaToken(ctx context.Context) (string, bool) {
	token, ok := ctx.Value(stravaTokenKey{}).(string)
	return token, ok && token != ""
}

type Strava struct {
	client   *http.Client
	endpoint string
}

func NewStrava(client *http.Client, endpoint string) *Strava {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &Strava{client: client, endpoint: strings.TrimRight(endpoint, "/")}
}

type rawActivity struct {
	ID                json.RawMessage `json:"id"`
	Name              string          `json:"name"`
	SportType         *string         `json:"sport_type"`
	LegacyType        *string         `json:"type"`
	StartDate         *string         `json:"start_date"`
	Distance          *float64        `json:"distance"`
	MovingTime        *int            `json:"moving_time"`
	ElapsedTime       *int            `json:"elapsed_time"`
	ElevationGain     *float64        `json:"total_elevation_gain"`
	AverageHeartrate  *float64        `json:"average_heartrate"`
	PerceivedExertion *int            `json:"perceived_exertion"`
}

func (c *Strava) Activities(ctx context.Context, after *int64, page *string) ([]Activity, string, error) {
	token, ok := StravaToken(ctx)
	if !ok {
		return nil, "", ErrStravaDisconnected
	}
	parsed, err := url.Parse(c.endpoint)
	if err != nil || parsed.Host == "" || !secureStravaEndpoint(parsed) {
		return nil, "", errors.New("invalid Strava endpoint")
	}
	pageNumber := 1
	if page != nil && strings.TrimSpace(*page) != "" {
		pageNumber, err = strconv.Atoi(*page)
		if err != nil || pageNumber < 1 || pageNumber > 10_000 {
			return nil, "", errors.New("invalid Strava page token")
		}
	}
	values := parsed.Query()
	values.Set("per_page", "200")
	values.Set("page", strconv.Itoa(pageNumber))
	if after != nil {
		if *after < 0 {
			return nil, "", errors.New("invalid Strava after timestamp")
		}
		values.Set("after", strconv.FormatInt(*after, 10))
	}
	parsed.RawQuery = values.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, "", errors.New("create Strava request")
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Accept", "application/json")
	response, err := c.client.Do(request)
	if err != nil {
		return nil, "", errors.New("Strava request failed")
	}
	defer func() { _ = response.Body.Close() }()
	if response.StatusCode == http.StatusUnauthorized || response.StatusCode == http.StatusForbidden {
		return nil, "", ErrStravaDisconnected
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, "", fmt.Errorf("Strava request returned status %d", response.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxStravaResponse+1))
	if err != nil || len(data) > maxStravaResponse {
		return nil, "", ErrStravaResponse
	}
	var payload []rawActivity
	if json.Unmarshal(data, &payload) != nil || len(payload) > 200 {
		return nil, "", ErrStravaResponse
	}
	activities := make([]Activity, 0, len(payload))
	for _, raw := range payload {
		activity, err := normalizeActivity(raw)
		if err != nil {
			return nil, "", ErrStravaResponse
		}
		activities = append(activities, activity)
	}
	next := ""
	if len(payload) == 200 {
		next = strconv.Itoa(pageNumber + 1)
	}
	return activities, next, nil
}

func normalizeActivity(raw rawActivity) (Activity, error) {
	id, err := activityID(raw.ID)
	if err != nil {
		return Activity{}, err
	}
	if id == "" || id == "null" || len(id) > 100 {
		return Activity{}, ErrStravaResponse
	}
	name := strings.TrimSpace(raw.Name)
	if name == "" {
		name = "Untitled activity"
	}
	if len(name) > 500 {
		return Activity{}, ErrStravaResponse
	}
	sport := raw.SportType
	if sport == nil {
		sport = raw.LegacyType
	}
	sport = cleanOptionalString(sport)
	startDate := cleanOptionalString(raw.StartDate)
	if invalidActivityNumber(raw.Distance) || invalidActivityNumber(raw.ElevationGain) || invalidActivityNumber(raw.AverageHeartrate) || invalidActivityInt(raw.MovingTime) || invalidActivityInt(raw.ElapsedTime) || raw.PerceivedExertion != nil && (*raw.PerceivedExertion < 0 || *raw.PerceivedExertion > 10) {
		return Activity{}, ErrStravaResponse
	}
	return Activity{ID: id, Name: name, SportType: sport, StartDate: startDate, DistanceM: raw.Distance, MovingTimeS: raw.MovingTime, ElapsedTimeS: raw.ElapsedTime, TotalElevationGainM: raw.ElevationGain, AverageHeartrate: raw.AverageHeartrate, PerceivedEffort: raw.PerceivedExertion}, nil
}

func activityID(raw json.RawMessage) (string, error) {
	var text string
	if json.Unmarshal(raw, &text) == nil {
		return text, nil
	}
	var number json.Number
	if json.Unmarshal(raw, &number) == nil {
		return number.String(), nil
	}
	return "", ErrStravaResponse
}

func cleanOptionalString(value *string) *string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	return &trimmed
}

func invalidActivityNumber(value *float64) bool { return value != nil && *value < 0 }
func invalidActivityInt(value *int) bool        { return value != nil && *value < 0 }

func secureStravaEndpoint(parsed *url.URL) bool {
	if parsed.Scheme == "https" {
		return true
	}
	ip := net.ParseIP(parsed.Hostname())
	return parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || ip != nil && ip.IsLoopback())
}

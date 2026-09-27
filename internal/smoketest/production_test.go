package smoketest

import (
	"context"
	json "encoding/json/v2"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestProductionSmokeProfiles(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/ready"):
			_, _ = fmt.Fprint(w, `{"status":"ok","checks":{"d1":"ok","r2":"ok"}}`)
		case strings.HasSuffix(path, "/health"):
			_, _ = fmt.Fprint(w, `{"status":"ok"}`)
		case strings.HasSuffix(path, "/agui/capabilities"):
			_, _ = fmt.Fprint(w, `{"transport":{"streaming":true},"state":{"persistentState":true},"tools":{"clientProvided":true}}`)
		case path == "/travel/agents/state":
			if r.Header.Get("authorization") == "" {
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = fmt.Fprint(w, `{"error":"unauthorized"}`)
				return
			}
			_, _ = fmt.Fprint(w, `{"threadId":"smoke-protected"}`)
		case path == "/resume/agents/state":
			raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
			if err != nil {
				http.Error(w, "body", http.StatusBadRequest)
				return
			}
			var input struct {
				ThreadID string `json:"threadId"`
			}
			if err := json.Unmarshal(raw, &input); err != nil {
				http.Error(w, "json", http.StatusBadRequest)
				return
			}
			encoded, err := json.Marshal(map[string]any{"threadId": input.ThreadID, "messages": []any{map[string]any{}}})
			if err != nil {
				http.Error(w, "encode", http.StatusInternalServerError)
				return
			}
			_, _ = w.Write(encoded)
		case strings.HasSuffix(path, "/agui"):
			body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
			if err != nil {
				http.Error(w, "body", http.StatusBadRequest)
				return
			}
			w.Header().Set("content-type", "text/event-stream")
			if strings.Contains(string(body), "highlight_resume_section") {
				_, _ = fmt.Fprint(w, "TOOL_CALL_START\n")
			} else {
				_, _ = fmt.Fprint(w, "RUN_STARTED\nRUN_FINISHED\n")
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	script, err := filepath.Abs("../../scripts/production-smoke.sh")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name  string
		env   []string
		want  string
		fails bool
	}{
		{name: "gateway", want: "SKIP: Telegram worker readiness"},
		{name: "url only", env: []string{"TELEGRAM_HEALTH_URL=" + server.URL + "/telegram"}, want: "SKIP: Telegram worker readiness"},
		{name: "telegram", env: []string{"REQUIRE_TELEGRAM_HEALTH=1", "TELEGRAM_HEALTH_URL=" + server.URL + "/telegram"}, want: "PASS: Telegram worker readiness"},
		{name: "missing url", env: []string{"REQUIRE_TELEGRAM_HEALTH=1"}, want: "TELEGRAM_HEALTH_URL is required when REQUIRE_TELEGRAM_HEALTH=1", fails: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
			defer cancel()
			cmd := exec.CommandContext(ctx, "bash", script)
			for _, value := range os.Environ() {
				key, _, _ := strings.Cut(value, "=")
				if key != "AGENTS_BASE_URL" && key != "SMOKE_AUTH_TOKEN" && key != "TELEGRAM_HEALTH_URL" && key != "REQUIRE_TELEGRAM_HEALTH" {
					cmd.Env = append(cmd.Env, value)
				}
			}
			cmd.Env = append(cmd.Env, "AGENTS_BASE_URL="+server.URL, "SMOKE_AUTH_TOKEN=smoke-token")
			cmd.Env = append(cmd.Env, tc.env...)
			output, err := cmd.CombinedOutput()
			if (err != nil) != tc.fails {
				t.Fatalf("smoke: %v\n%s", err, output)
			}
			if !strings.Contains(string(output), tc.want) {
				t.Fatalf("missing %q:\n%s", tc.want, output)
			}
			if !tc.fails && !strings.Contains(string(output), "PASS: all 13 registered AG-UI routes") {
				t.Fatalf("routes not checked:\n%s", output)
			}
		})
	}
}

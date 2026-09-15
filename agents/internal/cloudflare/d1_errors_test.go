package cloudflare

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"agents/internal/agui"
	cfapi "github.com/cloudflare/cloudflare-go/v7"
)

func TestD1PreservesRequestCancellationAndDeadlines(t *testing.T) {
	for _, operation := range []string{"query", "pending tools"} {
		for _, failure := range []string{"cancel", "deadline", "client timeout"} {
			t.Run(operation+"/"+failure, func(t *testing.T) {
				ctx, cancel := context.WithCancel(t.Context())
				defer cancel()
				want := context.Canceled
				if failure == "deadline" {
					var stop context.CancelFunc
					ctx, stop = context.WithDeadline(ctx, time.Now().Add(-time.Second))
					defer stop()
					want = context.DeadlineExceeded
				}
				server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
					_, _ = io.Copy(io.Discard, r.Body)
					if failure == "cancel" {
						cancel()
					}
					<-r.Context().Done()
				}))
				defer server.Close()
				client := server.Client()
				if failure == "client timeout" {
					client.Timeout = 20 * time.Millisecond
					want = context.DeadlineExceeded
				}
				d1, err := newD1(testCloudflare("secret"), client, server.URL)
				if err != nil {
					t.Fatal(err)
				}
				if operation == "query" {
					_, err = d1.Run(ctx, Statement{SQL: "SELECT 1"})
				} else {
					err = NewPendingStore(d1, time.Now).Register(ctx,
						agui.ToolScope{AppName: "resume_agent", UserID: "user", ThreadID: "thread"},
						"call-1", "ask_question", []byte(`{"question":"hello"}`))
				}
				if !errors.Is(err, want) {
					t.Fatalf("error = %v, want %v", err, want)
				}
			})
		}
	}
}

func TestD1HTTPFailuresRetainSafeMetadataWithoutRetryingWrites(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusTooManyRequests, http.StatusServiceUnavailable} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"success":false,"errors":[{"code":7500,"message":"secret SQL and credentials"}]}`))
			}))
			defer server.Close()
			d1, err := newD1(testCloudflare("secret"), server.Client(), server.URL)
			if err != nil {
				t.Fatal(err)
			}
			_, err = d1.Run(t.Context(), Statement{SQL: "INSERT INTO provider_limits VALUES (?, ?, ?, ?)", Params: []any{"openrouter", 1, 1, 2}})
			want := fmt.Sprintf("D1 query failed (HTTP %d, code 7500)", status)
			if err == nil || err.Error() != want {
				t.Fatalf("error = %v, want %q", err, want)
			}
			if _, ok := errors.AsType[*cfapi.Error](err); ok || strings.Contains(err.Error(), "secret") {
				t.Fatal("error retains sensitive SDK data")
			}
			if calls.Load() != 1 {
				t.Fatalf("write attempts = %d, want 1", calls.Load())
			}
		})
	}
}

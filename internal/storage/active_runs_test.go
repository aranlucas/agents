package storage

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/aranlucas/agents/internal/agui"

	_ "github.com/glebarez/go-sqlite"
)

func TestD1ActiveRunLeaseReplayStopAndReplacement(t *testing.T) {
	db := newTestDB(t)
	now := time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC)
	service := &SessionService{db: db, now: func() time.Time { return now }}
	key := agui.ActiveRunKey{AppName: "resume_agent", UserID: "user-1", ThreadID: "thread-1"}

	if err := service.BeginActiveRun(t.Context(), key, "run-1", now.Add(time.Minute)); err != nil {
		t.Fatal(err)
	}
	if err := service.BeginActiveRun(t.Context(), key, "run-2", now.Add(time.Minute)); !errors.Is(err, agui.ErrActiveRunExists) {
		t.Fatalf("second lease error = %v", err)
	}
	if err := service.BeginActiveRun(t.Context(), key, "run-1", now.Add(time.Minute)); !errors.Is(err, agui.ErrActiveRunExists) {
		t.Fatalf("same-ID second lease error = %v", err)
	}
	started := []byte(`{"type":"RUN_STARTED","threadId":"thread-1","runId":"run-1"}`)
	finished := []byte(`{"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1"}`)
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 1, finished, true); !errors.Is(err, agui.ErrActiveRunNotFound) {
		t.Fatalf("out-of-order event error = %v", err)
	}
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 0, started, false); err != nil {
		t.Fatal(err)
	}
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 0, started, false); err != nil {
		t.Fatalf("idempotent event retry: %v", err)
	}
	conflicting := []byte(`{"type":"RUN_STARTED","threadId":"thread-1","runId":"other"}`)
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 0, conflicting, false); err == nil {
		t.Fatal("conflicting event retry succeeded")
	}
	if err := service.AppendActiveRunEvent(t.Context(), key, "run-1", 1, finished, true); err != nil {
		t.Fatal(err)
	}
	snapshot, err := service.LoadActiveRun(t.Context(), key, "run-1", 0)
	if err != nil || !snapshot.Finished || len(snapshot.Events) != 2 {
		t.Fatalf("finished snapshot = %#v, %v", snapshot, err)
	}
	if _, err := service.CurrentActiveRun(t.Context(), key); !errors.Is(err, agui.ErrActiveRunNotFound) {
		t.Fatalf("finished run remained current: %v", err)
	}

	if err := service.BeginActiveRun(t.Context(), key, "run-2", now.Add(time.Minute)); err != nil {
		t.Fatalf("replacement lease: %v", err)
	}
	stopped, err := service.RequestActiveRunStop(t.Context(), key)
	if err != nil || !stopped {
		t.Fatalf("RequestActiveRunStop() = %t, %v", stopped, err)
	}
	snapshot, err = service.CurrentActiveRun(t.Context(), key)
	if err != nil || !snapshot.StopRequested || snapshot.RunID != "run-2" || len(snapshot.Events) != 0 {
		t.Fatalf("replacement snapshot = %#v, %v", snapshot, err)
	}
}

func TestActiveRunSameIDHasOnlyOneOwnerAcrossServices(t *testing.T) {
	db := newTestDB(t)
	now := time.Date(2026, 8, 29, 12, 0, 0, 0, time.UTC)
	key := agui.ActiveRunKey{AppName: "grocery_agent", UserID: "user-1", ThreadID: "thread-1"}
	start := make(chan struct{})
	outcomes := make(chan error, 2)
	var group sync.WaitGroup
	for range 2 {
		service := &SessionService{db: db, now: func() time.Time { return now }}
		group.Go(func() {
			<-start
			outcomes <- service.BeginActiveRun(t.Context(), key, "same-client-run", now.Add(time.Minute))
		})
	}
	close(start)
	group.Wait()
	close(outcomes)
	successes, rejected := 0, 0
	for err := range outcomes {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, agui.ErrActiveRunExists):
			rejected++
		default:
			t.Fatalf("unexpected acquisition error: %v", err)
		}
	}
	if successes != 1 || rejected != 1 {
		t.Fatalf("acquisition outcomes: successes=%d rejected=%d", successes, rejected)
	}
}

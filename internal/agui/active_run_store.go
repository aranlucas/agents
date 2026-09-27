package agui

import (
	"context"
	"errors"
	"time"
)

var (
	ErrActiveRunExists   = errors.New("AG-UI run already active")
	ErrActiveRunNotFound = errors.New("AG-UI active run not found")
)

// ActiveRunKey is the durable authorization and ownership boundary for one
// active AG-UI execution.
type ActiveRunKey struct {
	AppName  string
	UserID   string
	ThreadID string
}

// ActiveRunSnapshot is an immutable view of one SQLite-journaled live run.
type ActiveRunSnapshot struct {
	RunID         string
	Events        [][]byte
	Finished      bool
	StopRequested bool
}

// ActiveRunStore coordinates execution ownership and replay across gateway
// replicas. The production session service implements it using the same
// SQLite database as ADK session persistence.
type ActiveRunStore interface {
	BeginActiveRun(context.Context, ActiveRunKey, string, time.Time) error
	AppendActiveRunEvent(context.Context, ActiveRunKey, string, int64, []byte, bool) error
	CurrentActiveRun(context.Context, ActiveRunKey) (*ActiveRunSnapshot, error)
	// LoadActiveRun returns events beginning at fromEvent. A negative index
	// loads status only, keeping cross-replica stop polling lightweight.
	LoadActiveRun(context.Context, ActiveRunKey, string, int64) (*ActiveRunSnapshot, error)
	FinishActiveRun(context.Context, ActiveRunKey, string, time.Time) error
	RequestActiveRunStop(context.Context, ActiveRunKey) (bool, error)
}

package agui

import (
	"context"
	"errors"
	"sync"
	"time"
)

const (
	maximumActiveReplayBytes  = 8 << 20
	maximumActiveReplayEvents = 16 << 10
	terminalReplayByteReserve = 64 << 10
	terminalEventReserve      = 16
	activeRunLeaseGrace       = time.Minute
)

var errActiveReplayLimit = errors.New("active AG-UI replay limit exceeded")

type runKey struct {
	AppName    string
	AgentRoute string
	UserID     string
	ThreadID   string
}

// activeRuns owns process-local execution control and the low-latency replay
// path. When configured, ActiveRunStore mirrors ownership and validated events
// to the database so other gateway processes can connect or request cancellation.
type activeRuns struct {
	mu    sync.Mutex
	runs  map[runKey]*activeRun
	store ActiveRunStore
}

type activeRun struct {
	mu       sync.Mutex
	cancel   context.CancelFunc
	events   [][]byte
	bytes    int
	changed  chan struct{}
	done     bool
	terminal bool
	key      ActiveRunKey
	runID    string
	store    ActiveRunStore
	sequence int64
}

type activeRunLease struct {
	owner *activeRuns
	key   runKey
	run   *activeRun
}

func newActiveRuns(stores ...ActiveRunStore) *activeRuns {
	var store ActiveRunStore
	if len(stores) > 0 {
		store = stores[0]
	}
	return &activeRuns{runs: make(map[runKey]*activeRun), store: store}
}

func (r *activeRuns) start(key runKey, cancel context.CancelFunc) (*activeRunLease, bool) {
	lease, err := r.startDurable(context.Background(), key, "local", time.Now().Add(time.Hour), cancel)
	return lease, err == nil
}

func (r *activeRuns) startDurable(ctx context.Context, key runKey, runID string, expiresAt time.Time, cancel context.CancelFunc) (*activeRunLease, error) {
	if r == nil {
		return nil, nil
	}
	durableKey := ActiveRunKey{AppName: key.AppName, UserID: key.UserID, ThreadID: key.ThreadID}
	if r.store != nil {
		if err := r.store.BeginActiveRun(ctx, durableKey, runID, expiresAt); err != nil {
			return nil, err
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.runs[key]; exists {
		return nil, ErrActiveRunExists
	}
	started := &activeRun{cancel: cancel, changed: make(chan struct{}), key: durableKey, runID: runID, store: r.store}
	r.runs[key] = started
	return &activeRunLease{owner: r, key: key, run: started}, nil
}

func (r *activeRuns) lookup(key runKey) *activeRun {
	if r == nil {
		return nil
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.runs[key]
}

func (r *activeRuns) stop(key runKey) bool {
	run := r.lookup(key)
	if run == nil {
		return false
	}
	run.mu.Lock()
	cancel := run.cancel
	run.mu.Unlock()
	cancel()
	return true
}

func (r *activeRuns) requestStop(ctx context.Context, key runKey) (bool, error) {
	if r.stop(key) {
		return true, nil
	}
	if r == nil || r.store == nil {
		return false, nil
	}
	return r.store.RequestActiveRunStop(ctx, ActiveRunKey{AppName: key.AppName, UserID: key.UserID, ThreadID: key.ThreadID})
}

func (l *activeRunLease) publish(ctx context.Context, encoded []byte, terminal bool) error {
	if l == nil || len(encoded) == 0 {
		return nil
	}
	l.run.mu.Lock()
	defer l.run.mu.Unlock()
	if l.run.done || l.run.terminal {
		return errEventAfterTerminal
	}
	byteLimit := maximumActiveReplayBytes - terminalReplayByteReserve
	eventLimit := maximumActiveReplayEvents - terminalEventReserve
	if terminal {
		byteLimit = maximumActiveReplayBytes
		eventLimit = maximumActiveReplayEvents
	}
	if l.run.bytes+len(encoded) > byteLimit || len(l.run.events)+1 > eventLimit {
		return errActiveReplayLimit
	}
	if l.run.store != nil {
		if err := l.run.store.AppendActiveRunEvent(ctx, l.run.key, l.run.runID, l.run.sequence, encoded, terminal); err != nil {
			return err
		}
	}
	l.run.events = append(l.run.events, append([]byte(nil), encoded...))
	l.run.bytes += len(encoded)
	l.run.sequence++
	l.run.terminal = terminal
	close(l.run.changed)
	l.run.changed = make(chan struct{})
	return nil
}

func (l *activeRunLease) finish(contexts ...context.Context) error {
	if l == nil {
		return nil
	}
	l.run.mu.Lock()
	if !l.run.done {
		l.run.done = true
		close(l.run.changed)
	}
	l.run.mu.Unlock()

	l.owner.mu.Lock()
	if l.owner.runs[l.key] == l.run {
		delete(l.owner.runs, l.key)
	}
	l.owner.mu.Unlock()
	if l.run.store != nil {
		ctx := context.Background()
		if len(contexts) > 0 {
			ctx = contexts[0]
		}
		return l.run.store.FinishActiveRun(ctx, l.run.key, l.run.runID, time.Now().Add(time.Minute))
	}
	return nil
}

// replay streams every event already emitted by the run, then follows new
// events until the run finishes or the connecting request is canceled.
func (r *activeRun) replay(ctx context.Context, emit func([]byte) error) error {
	cursor := 0
	for {
		r.mu.Lock()
		pending := make([][]byte, len(r.events[cursor:]))
		for index, encoded := range r.events[cursor:] {
			pending[index] = append([]byte(nil), encoded...)
		}
		cursor = len(r.events)
		done := r.done
		changed := r.changed
		r.mu.Unlock()

		for _, encoded := range pending {
			if err := emit(encoded); err != nil {
				return err
			}
		}
		if done {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-changed:
		}
	}
}

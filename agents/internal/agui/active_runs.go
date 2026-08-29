package agui

import (
	"context"
	"sync"
)

type runKey struct {
	AgentRoute string
	UserID     string
	ThreadID   string
}

// activeRuns owns process-local execution control and live event replay. D1
// remains the durable source of truth; this registry only covers runs owned by
// the current gateway process so CopilotKit connect and stop requests can join
// or cancel them while they are active.
type activeRuns struct {
	mu   sync.Mutex
	runs map[runKey]*activeRun
}

type activeRun struct {
	mu       sync.Mutex
	cancel   context.CancelFunc
	events   [][]byte
	changed  chan struct{}
	done     bool
	terminal bool
}

type activeRunLease struct {
	owner *activeRuns
	key   runKey
	run   *activeRun
}

func newActiveRuns() *activeRuns {
	return &activeRuns{runs: make(map[runKey]*activeRun)}
}

func (r *activeRuns) start(key runKey, cancel context.CancelFunc) (*activeRunLease, bool) {
	if r == nil {
		return nil, true
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.runs[key]; exists {
		return nil, false
	}
	started := &activeRun{cancel: cancel, changed: make(chan struct{})}
	r.runs[key] = started
	return &activeRunLease{owner: r, key: key, run: started}, true
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

func (l *activeRunLease) publish(encoded []byte, terminal bool) {
	if l == nil || len(encoded) == 0 {
		return
	}
	l.run.mu.Lock()
	defer l.run.mu.Unlock()
	if l.run.done || l.run.terminal {
		return
	}
	l.run.events = append(l.run.events, append([]byte(nil), encoded...))
	l.run.terminal = terminal
	close(l.run.changed)
	l.run.changed = make(chan struct{})
}

func (l *activeRunLease) finish() {
	if l == nil {
		return
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

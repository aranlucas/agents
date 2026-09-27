package agui

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

type shortWriter struct{ writes int }

func (w *shortWriter) Write(payload []byte) (int, error) {
	w.writes++
	return max(0, len(payload)-1), nil
}

type flushErrorWriter struct {
	bytes.Buffer
	flushes int
}

type deadlineWriter struct {
	bytes.Buffer
	header    http.Header
	deadlines []time.Time
}

func (w *deadlineWriter) Header() http.Header { return w.header }
func (*deadlineWriter) WriteHeader(int)       {}
func (*deadlineWriter) Flush()                {}
func (w *deadlineWriter) SetWriteDeadline(deadline time.Time) error {
	w.deadlines = append(w.deadlines, deadline)
	return nil
}

func (w *flushErrorWriter) Flush() error {
	w.flushes++
	return errors.New("flush failed")
}

type encodingFailureEvent struct{ *events.BaseEvent }

func (*encodingFailureEvent) ToJSON() ([]byte, error) { return nil, errors.New("encode failed") }

type invalidJSONEvent struct{ *events.BaseEvent }

func (*invalidJSONEvent) ToJSON() ([]byte, error) { return []byte(`{"type":`), nil }

type prettyJSONEvent struct{ *events.BaseEvent }

func (*prettyJSONEvent) ToJSON() ([]byte, error) {
	return []byte("{\n  \"type\": \"CUSTOM\",\n  \"name\": \"pretty\",\n  \"value\": true\n}"), nil
}

func TestEmitterRejectsMalformedAndUnencodableEventsBeforeReplayAdmission(t *testing.T) {
	active := newActiveRuns()
	lease, ok := active.start(runKey{AgentRoute: "resume", UserID: "user", ThreadID: "thread"}, func() {})
	if !ok {
		t.Fatal("active run did not start")
	}
	defer func() { _ = lease.finish() }()
	emitter := newReplayAwareEmitter(io.Discard, lease)

	if err := emitter.Emit(t.Context(), events.NewRunStartedEvent("thread", "run")); err != nil {
		t.Fatal(err)
	}
	for _, event := range []events.Event{
		events.NewToolCallStartEvent("call", ""),
		&encodingFailureEvent{BaseEvent: events.NewBaseEvent(events.EventTypeCustom)},
		&invalidJSONEvent{BaseEvent: events.NewBaseEvent(events.EventTypeCustom)},
	} {
		err := emitter.Emit(t.Context(), event)
		if _, ok := errors.AsType[*eventEncodingError](err); !ok {
			t.Fatalf("Emit(%s) error = %v, want eventEncodingError", event.Type(), err)
		}
	}
	if got := len(lease.run.events); got != 1 {
		t.Fatalf("replay events = %d, want only validated RUN_STARTED", got)
	}
}

func TestEmitterCompactsValidMultilineJSONBeforeSSEFraming(t *testing.T) {
	var output bytes.Buffer
	emitter := newReplayAwareEmitter(&output, nil)
	if err := emitter.Emit(t.Context(), events.NewRunStartedEvent("thread", "run")); err != nil {
		t.Fatal(err)
	}
	if err := emitter.Emit(t.Context(), &prettyJSONEvent{BaseEvent: events.NewBaseEvent(events.EventTypeCustom)}); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(output.String(), "\n  \"") || !strings.Contains(output.String(), `data: {"type":"CUSTOM","name":"pretty","value":true}`) {
		t.Fatalf("multiline JSON was not compacted: %q", output.String())
	}
}

func TestEmitterUsesSDKEventValidationWithoutExtraLifecycleRules(t *testing.T) {
	active := newActiveRuns()
	lease, ok := active.start(runKey{AgentRoute: "resume", UserID: "user", ThreadID: "thread"}, func() {})
	if !ok {
		t.Fatal("active run did not start")
	}
	defer func() { _ = lease.finish() }()
	emitter := newReplayAwareEmitter(io.Discard, lease)
	if err := emitter.Emit(t.Context(), events.NewRunStartedEvent("thread", "run")); err != nil {
		t.Fatal(err)
	}
	if err := emitter.Emit(t.Context(), events.NewTextMessageContentEvent("missing", "content")); err != nil {
		t.Fatalf("schema-valid event was rejected: %v", err)
	}
	if len(lease.run.events) != 2 {
		t.Fatalf("replay events = %d, want both schema-valid events", len(lease.run.events))
	}
}

func TestEmitterBoundsActiveReplayAndStillAdmitsTerminalError(t *testing.T) {
	active := newActiveRuns()
	lease, ok := active.start(runKey{AgentRoute: "resume", UserID: "user", ThreadID: "thread"}, func() {})
	if !ok {
		t.Fatal("active run did not start")
	}
	defer func() { _ = lease.finish() }()
	emitter := newReplayAwareEmitter(io.Discard, lease)
	if err := emitter.Emit(t.Context(), events.NewRunStartedEvent("thread", "run")); err != nil {
		t.Fatal(err)
	}
	err := emitter.Emit(t.Context(), events.NewCustomEvent("oversized", events.WithValue(strings.Repeat("x", maximumActiveReplayBytes))))
	if !errors.Is(err, errActiveReplayLimit) {
		t.Fatalf("oversized replay error = %v", err)
	}
	if err := emitter.Emit(t.Context(), sanitizeRunError("run", err)); err != nil {
		t.Fatalf("terminal RUN_ERROR did not fit reserved replay capacity: %v", err)
	}
	if len(lease.run.events) != 2 || !lease.run.terminal {
		t.Fatalf("bounded replay state = events:%d terminal:%t", len(lease.run.events), lease.run.terminal)
	}
}

func TestEmitterTransportFailuresDetachSinkButRetainReplay(t *testing.T) {
	active := newActiveRuns()
	lease, ok := active.start(runKey{AgentRoute: "resume", UserID: "user", ThreadID: "thread"}, func() {})
	if !ok {
		t.Fatal("active run did not start")
	}
	defer func() { _ = lease.finish() }()
	broken := &shortWriter{}
	emitter := newReplayAwareEmitter(broken, lease)

	err := emitter.Emit(t.Context(), events.NewRunStartedEvent("thread", "run"))
	if _, ok := errors.AsType[*eventTransportError](err); !ok || !errors.Is(err, io.ErrShortWrite) {
		t.Fatalf("short write error = %v, want transport io.ErrShortWrite", err)
	}
	if err := emitter.Emit(t.Context(), events.NewStateSnapshotEvent(map[string]any{"ready": true})); err != nil {
		t.Fatalf("detached sink rejected later replay event: %v", err)
	}
	if err := emitter.Emit(t.Context(), events.NewRunFinishedEvent("thread", "run")); err != nil {
		t.Fatalf("detached sink rejected terminal replay event: %v", err)
	}
	if broken.writes != 1 || len(lease.run.events) != 3 {
		t.Fatalf("writes=%d replay=%d, want 1 write and 3 replay events", broken.writes, len(lease.run.events))
	}
	if err := emitter.Emit(t.Context(), events.NewStateSnapshotEvent(map[string]any{})); !errors.Is(err, errEventAfterTerminal) {
		t.Fatalf("post-terminal Emit error = %v", err)
	}
}

func TestEmitterReportsFlushFailureAsTransportFailure(t *testing.T) {
	writer := &flushErrorWriter{}
	err := newReplayAwareEmitter(writer, nil).Emit(t.Context(), events.NewRunStartedEvent("thread", "run"))
	if _, ok := errors.AsType[*eventTransportError](err); !ok || writer.flushes != 1 {
		t.Fatalf("flush error = %v, flushes=%d", err, writer.flushes)
	}
}

func TestEmitterBoundsSupportedHTTPResponseWritesWithDeadline(t *testing.T) {
	writer := &deadlineWriter{header: make(http.Header)}
	if err := newReplayAwareEmitter(writer, nil).Emit(t.Context(), events.NewRunStartedEvent("thread", "run")); err != nil {
		t.Fatal(err)
	}
	if len(writer.deadlines) != 2 || writer.deadlines[0].IsZero() || !writer.deadlines[1].IsZero() {
		t.Fatalf("write deadlines = %#v", writer.deadlines)
	}
}

func TestActiveReplayFollowsAfterOriginalTransportDisconnect(t *testing.T) {
	active := newActiveRuns()
	lease, ok := active.start(runKey{AgentRoute: "resume", UserID: "user", ThreadID: "thread"}, func() {})
	if !ok {
		t.Fatal("active run did not start")
	}
	original := newReplayAwareEmitter(&shortWriter{}, lease)
	if err := original.Emit(t.Context(), events.NewRunStartedEvent("thread", "run")); err == nil {
		t.Fatal("original sink did not fail")
	}

	var reconnected bytes.Buffer
	follower := newReplayAwareEmitter(&reconnected, nil)
	done := make(chan error, 1)
	go func() {
		done <- lease.run.replay(context.Background(), func(encoded []byte) error {
			return follower.emitEncoded(context.Background(), encoded)
		})
	}()
	if err := original.Emit(t.Context(), events.NewStateSnapshotEvent(map[string]any{"ready": true})); err != nil {
		t.Fatal(err)
	}
	if err := original.Emit(t.Context(), events.NewRunFinishedEvent("thread", "run")); err != nil {
		t.Fatal(err)
	}
	if err := lease.finish(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	frames := parseSSEFrames(t, reconnected.Bytes())
	assertAGUISequence(t, frames)
}

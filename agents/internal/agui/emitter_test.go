package agui

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

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

func (w *flushErrorWriter) Flush() error {
	w.flushes++
	return errors.New("flush failed")
}

type encodingFailureEvent struct{ *events.BaseEvent }

func (*encodingFailureEvent) ToJSON() ([]byte, error) { return nil, errors.New("encode failed") }

type invalidJSONEvent struct{ *events.BaseEvent }

func (*invalidJSONEvent) ToJSON() ([]byte, error) { return []byte(`{"type":`), nil }

func TestEmitterRejectsMalformedAndUnencodableEventsBeforeReplayAdmission(t *testing.T) {
	active := newActiveRuns()
	lease, ok := active.start(runKey{AgentRoute: "resume", UserID: "user", ThreadID: "thread"}, func() {})
	if !ok {
		t.Fatal("active run did not start")
	}
	defer lease.finish()
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
		var encodingErr *eventEncodingError
		if !errors.As(err, &encodingErr) {
			t.Fatalf("Emit(%s) error = %v, want eventEncodingError", event.Type(), err)
		}
	}
	if got := len(lease.run.events); got != 1 {
		t.Fatalf("replay events = %d, want only validated RUN_STARTED", got)
	}
}

func TestEmitterTransportFailuresDetachSinkButRetainReplay(t *testing.T) {
	active := newActiveRuns()
	lease, ok := active.start(runKey{AgentRoute: "resume", UserID: "user", ThreadID: "thread"}, func() {})
	if !ok {
		t.Fatal("active run did not start")
	}
	defer lease.finish()
	broken := &shortWriter{}
	emitter := newReplayAwareEmitter(broken, lease)

	err := emitter.Emit(t.Context(), events.NewRunStartedEvent("thread", "run"))
	var transportErr *eventTransportError
	if !errors.As(err, &transportErr) || !errors.Is(err, io.ErrShortWrite) {
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
	var transportErr *eventTransportError
	if !errors.As(err, &transportErr) || writer.flushes != 1 {
		t.Fatalf("flush error = %v, flushes=%d", err, writer.flushes)
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
	lease.finish()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	frames := parseSSEFrames(t, reconnected.Bytes())
	assertStrictAGUISequence(t, frames)
}

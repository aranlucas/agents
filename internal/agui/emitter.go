package agui

import (
	"context"
	"encoding/json/jsontext"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/encoding/sse"
)

var errEventAfterTerminal = errors.New("AG-UI event follows terminal event")

const sseWriteTimeout = 5 * time.Second

// eventEncodingError means an event was rejected before it became observable
// on either the live response or the active-run replay stream.
type eventEncodingError struct {
	stage string
	err   error
}

func (e *eventEncodingError) Error() string {
	return fmt.Sprintf("AG-UI event %s failed: %v", e.stage, e.err)
}
func (e *eventEncodingError) Unwrap() error { return e.err }

// eventTransportError means a valid, encoded event was admitted to replay but
// could not be written or flushed to this particular response.
type eventTransportError struct{ err error }

func (e *eventTransportError) Error() string { return fmt.Sprintf("AG-UI transport failed: %v", e.err) }
func (e *eventTransportError) Unwrap() error { return e.err }

// replayAwareEmitter validates and encodes each event before publishing its
// immutable JSON bytes to the active-run replay buffer. A failed response is
// detached after its first transport error while later events continue to be
// admitted for /connect followers.
type replayAwareEmitter struct {
	writer          io.Writer
	active          *activeRunLease
	transportFailed bool
	sse             *sse.SSEWriter
}

func newReplayAwareEmitter(writer io.Writer, active *activeRunLease) *replayAwareEmitter {
	return &replayAwareEmitter{writer: writer, active: active, sse: sse.NewSSEWriter()}
}

func (e *replayAwareEmitter) Emit(ctx context.Context, event events.Event) error {
	encoded, err := encodeReplayEvent(event)
	if err != nil {
		return err
	}
	terminal := isTerminalEvent(event)
	if e.active != nil {
		if err := e.active.publish(ctx, encoded, terminal); err != nil {
			return &eventEncodingError{stage: "replay admission", err: err}
		}
	}

	if e.transportFailed || e.writer == nil {
		return nil
	}
	if err := e.write(ctx, encoded); err != nil {
		e.transportFailed = true
		return &eventTransportError{err: err}
	}
	return nil
}

// emitEncoded is only for immutable bytes previously admitted by Emit through
// activeRun.publish or its D1 mirror. It defensively revalidates those bytes and
// writes them to a reconnect response.
// The context is retained to match replay callbacks; transport writes are
// bounded by a per-frame response deadline instead of request cancellation.
func (e *replayAwareEmitter) emitEncoded(ctx context.Context, encoded []byte) error {
	encoded, err := validateEncodedReplayEvent(encoded)
	if err != nil {
		return err
	}
	if e.transportFailed || e.writer == nil {
		return nil
	}
	if err := e.write(ctx, encoded); err != nil {
		e.transportFailed = true
		return &eventTransportError{err: err}
	}
	return nil
}

type errorFlusher interface{ Flush() error }

func (e *replayAwareEmitter) write(ctx context.Context, encoded []byte) error {
	if responseWriter, ok := e.writer.(http.ResponseWriter); ok {
		controller := http.NewResponseController(responseWriter)
		if err := controller.SetWriteDeadline(time.Now().Add(sseWriteTimeout)); err == nil {
			defer controller.SetWriteDeadline(time.Time{}) //nolint:errcheck // best-effort deadline cleanup after a completed frame
		}
	}
	return e.sse.WriteBytes(ctx, checkedStreamWriter{e.writer}, encoded)
}

// checkedStreamWriter enforces io.Writer's short-write contract at the SDK
// boundary while preserving the response's flushing behavior.
type checkedStreamWriter struct{ io.Writer }

func (w checkedStreamWriter) Write(p []byte) (int, error) {
	n, err := w.Writer.Write(p)
	if err == nil && n != len(p) {
		err = io.ErrShortWrite
	}
	return n, err
}

func (w checkedStreamWriter) Flush() error {
	if flusher, ok := w.Writer.(errorFlusher); ok {
		return flusher.Flush()
	}
	if flusher, ok := w.Writer.(http.Flusher); ok {
		flusher.Flush()
	}
	return nil
}

func encodeReplayEvent(event events.Event) ([]byte, error) {
	if event == nil {
		return nil, &eventEncodingError{stage: "validation", err: errors.New("event is nil")}
	}
	if err := event.Validate(); err != nil {
		return nil, &eventEncodingError{stage: "validation", err: err}
	}
	encoded, err := event.ToJSON()
	if err != nil {
		return nil, &eventEncodingError{stage: "encoding", err: err}
	}
	return validateEncodedReplayEvent(encoded)
}

func validateEncodedReplayEvent(encoded []byte) ([]byte, error) {
	value := jsontext.Value(encoded).Clone()
	if len(value) == 0 || !value.IsValid() {
		return nil, &eventEncodingError{stage: "encoding", err: errors.New("event produced invalid JSON")}
	}
	if err := value.Compact(); err != nil {
		return nil, &eventEncodingError{stage: "encoding", err: errors.New("event produced invalid JSON")}
	}
	decoded, err := events.EventFromJSON(value)
	if err != nil {
		return nil, &eventEncodingError{stage: "replay decoding", err: err}
	}
	if err := decoded.Validate(); err != nil {
		return nil, &eventEncodingError{stage: "replay validation", err: err}
	}
	return value, nil
}

func isTerminalEvent(event events.Event) bool {
	return event.Type() == events.EventTypeRunError || event.Type() == events.EventTypeRunFinished
}

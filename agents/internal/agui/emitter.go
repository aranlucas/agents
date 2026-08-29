package agui

import (
	"context"
	"encoding/json/jsontext"
	json "encoding/json/v2"
	"errors"
	"fmt"
	"io"
	"net/http"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

var errEventAfterTerminal = errors.New("AG-UI event follows terminal event")

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
	terminal        bool
}

func newReplayAwareEmitter(writer io.Writer, active *activeRunLease) *replayAwareEmitter {
	return &replayAwareEmitter{writer: writer, active: active}
}

func (e *replayAwareEmitter) Emit(_ context.Context, event events.Event) error {
	if e.terminal {
		return errEventAfterTerminal
	}
	encoded, err := encodeReplayEvent(event)
	if err != nil {
		return err
	}
	terminal := isTerminalEvent(event)
	if e.active != nil {
		e.active.publish(encoded, terminal)
	}
	e.terminal = terminal

	if e.transportFailed || e.writer == nil {
		return nil
	}
	if err := writeSSEFrame(e.writer, encoded); err != nil {
		e.transportFailed = true
		return &eventTransportError{err: err}
	}
	return nil
}

// emitEncoded is only for immutable bytes previously admitted by Emit through
// activeRun.publish. It intentionally does not revalidate trusted replay data.
func (e *replayAwareEmitter) emitEncoded(_ context.Context, encoded []byte) error {
	if e.terminal {
		return errEventAfterTerminal
	}
	var envelope struct {
		Type events.EventType `json:"type"`
	}
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		return &eventEncodingError{stage: "replay decoding", err: err}
	}
	e.terminal = envelope.Type == events.EventTypeRunError || envelope.Type == events.EventTypeRunFinished
	if e.transportFailed || e.writer == nil {
		return nil
	}
	if err := writeSSEFrame(e.writer, encoded); err != nil {
		e.transportFailed = true
		return &eventTransportError{err: err}
	}
	return nil
}

type errorFlusher interface{ Flush() error }

func writeSSEFrame(writer io.Writer, encoded []byte) error {
	frame := make([]byte, 0, len(encoded)+8)
	frame = append(frame, "data: "...)
	frame = append(frame, encoded...)
	frame = append(frame, '\n', '\n')
	n, err := writer.Write(frame)
	if err != nil {
		return fmt.Errorf("write SSE frame: %w", err)
	}
	if n != len(frame) {
		return fmt.Errorf("write SSE frame: %w", io.ErrShortWrite)
	}
	if flusher, ok := writer.(errorFlusher); ok {
		if err := flusher.Flush(); err != nil {
			return fmt.Errorf("flush SSE frame: %w", err)
		}
		return nil
	}
	if flusher, ok := writer.(http.Flusher); ok {
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
	if len(encoded) == 0 || !jsontext.Value(encoded).IsValid() {
		return nil, &eventEncodingError{stage: "encoding", err: errors.New("event produced invalid JSON")}
	}
	return encoded, nil
}

func isTerminalEvent(event events.Event) bool {
	return event.Type() == events.EventTypeRunError || event.Type() == events.EventTypeRunFinished
}

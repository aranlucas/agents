package agui

import (
	json "encoding/json/v2"
	"errors"
	"fmt"
	"maps"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
)

// sequenceGuard enforces the stateful lifecycle expected by the default
// TypeScript AG-UI client. It is deliberately stricter at successful
// completion by requiring reasoning lanes to be balanced too.
type sequenceGuard struct {
	started  bool
	terminal bool
	threadID string
	runID    string

	text              map[string]bool
	textSeen          map[string]bool
	reasoning         map[string]bool
	reasoningMessages map[string]bool
	reasoningSeen     map[string]bool
	tools             map[string]bool
	toolSeen          map[string]bool
	steps             map[string]bool
}

func (g *sequenceGuard) clone() *sequenceGuard {
	cloned := *g
	cloned.text = maps.Clone(g.text)
	cloned.textSeen = maps.Clone(g.textSeen)
	cloned.reasoning = maps.Clone(g.reasoning)
	cloned.reasoningMessages = maps.Clone(g.reasoningMessages)
	cloned.reasoningSeen = maps.Clone(g.reasoningSeen)
	cloned.tools = maps.Clone(g.tools)
	cloned.toolSeen = maps.Clone(g.toolSeen)
	cloned.steps = maps.Clone(g.steps)
	return &cloned
}

func newSequenceGuard() *sequenceGuard {
	return &sequenceGuard{
		text:              make(map[string]bool),
		textSeen:          make(map[string]bool),
		reasoning:         make(map[string]bool),
		reasoningMessages: make(map[string]bool),
		reasoningSeen:     make(map[string]bool),
		tools:             make(map[string]bool),
		toolSeen:          make(map[string]bool),
		steps:             make(map[string]bool),
	}
}

func (g *sequenceGuard) admit(encoded []byte) error {
	if g.terminal {
		return errEventAfterTerminal
	}
	var object map[string]any
	if err := json.Unmarshal(encoded, &object); err != nil {
		return fmt.Errorf("decode event sequence: %w", err)
	}
	typeName, _ := object["type"].(string)
	typeValue := events.EventType(typeName)
	if !g.started && typeValue != events.EventTypeRunStarted && typeValue != events.EventTypeRunError {
		return errors.New("first AG-UI event must be RUN_STARTED or RUN_ERROR")
	}

	switch typeValue {
	case events.EventTypeRunStarted:
		if g.started {
			return errors.New("RUN_STARTED while a run is active")
		}
		g.started = true
		g.threadID = eventString(object, "threadId")
		g.runID = eventString(object, "runId")
	case events.EventTypeRunFinished:
		if !g.started || eventString(object, "threadId") != g.threadID || eventString(object, "runId") != g.runID {
			return errors.New("RUN_FINISHED does not match RUN_STARTED")
		}
		if len(g.text)+len(g.reasoning)+len(g.reasoningMessages)+len(g.tools)+len(g.steps) != 0 {
			return errors.New("RUN_FINISHED has open protocol lanes")
		}
		g.terminal = true
	case events.EventTypeRunError:
		g.terminal = true
	case events.EventTypeTextMessageStart:
		return startUniqueLane(g.text, g.textSeen, eventString(object, "messageId"), "text message")
	case events.EventTypeTextMessageContent:
		return requireLane(g.text, eventString(object, "messageId"), "text content")
	case events.EventTypeTextMessageEnd:
		return endLane(g.text, eventString(object, "messageId"), "text message")
	case events.EventTypeReasoningStart:
		return startUniqueLane(g.reasoning, g.reasoningSeen, eventString(object, "messageId"), "reasoning")
	case events.EventTypeReasoningMessageStart:
		return startLane(g.reasoningMessages, eventString(object, "messageId"), "reasoning message")
	case events.EventTypeReasoningMessageContent:
		return requireLane(g.reasoningMessages, eventString(object, "messageId"), "reasoning content")
	case events.EventTypeReasoningMessageEnd:
		return endLane(g.reasoningMessages, eventString(object, "messageId"), "reasoning message")
	case events.EventTypeReasoningEnd:
		return endLane(g.reasoning, eventString(object, "messageId"), "reasoning")
	case events.EventTypeToolCallStart:
		if parent := eventString(object, "parentMessageId"); parent != "" && !g.textSeen[parent] {
			return fmt.Errorf("tool call parent message %q does not exist", parent)
		}
		return startUniqueLane(g.tools, g.toolSeen, eventString(object, "toolCallId"), "tool call")
	case events.EventTypeToolCallArgs:
		return requireLane(g.tools, eventString(object, "toolCallId"), "tool arguments")
	case events.EventTypeToolCallEnd:
		return endLane(g.tools, eventString(object, "toolCallId"), "tool call")
	case events.EventTypeStepStarted:
		return startLane(g.steps, eventString(object, "stepName"), "step")
	case events.EventTypeStepFinished:
		return endLane(g.steps, eventString(object, "stepName"), "step")
	}
	return nil
}

func eventString(object map[string]any, key string) string {
	value, _ := object[key].(string)
	return value
}

func startLane(active map[string]bool, id, kind string) error {
	if id == "" || active[id] {
		return fmt.Errorf("%s %q already active or invalid", kind, id)
	}
	active[id] = true
	return nil
}

func startUniqueLane(active, seen map[string]bool, id, kind string) error {
	if seen[id] {
		return fmt.Errorf("%s %q was already used", kind, id)
	}
	if err := startLane(active, id, kind); err != nil {
		return err
	}
	seen[id] = true
	return nil
}

func requireLane(active map[string]bool, id, kind string) error {
	if !active[id] {
		return fmt.Errorf("%s has no active lane %q", kind, id)
	}
	return nil
}

func endLane(active map[string]bool, id, kind string) error {
	if !active[id] {
		return fmt.Errorf("%s has no active lane %q", kind, id)
	}
	delete(active, id)
	return nil
}

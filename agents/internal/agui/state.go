package agui

import (
	"bytes"
	"encoding/json"
	"errors"
	"maps"
	"net/http"
	"strings"

	"github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"github.com/wI2L/jsondiff"
	"google.golang.org/adk/v2/session"
)

// ErrSessionNotFound is the error an injected session.Service must return
// (directly, or wrapped so errors.Is still matches) from Get/AppendEvent
// when the requested app/user/thread identity does not address a live
// session. Handler and StateHandler depend only on this value and the
// session.Service interface — never on a concrete backend package — so any
// session.Service implementation can be plugged in.
var ErrSessionNotFound = errors.New("agui: session not found")

// stateDocument is the JSON document sent to AG-UI clients. ADK state values
// are intentionally open at the session boundary, but the client-facing
// document is stricter: every retained value has already been validated and
// encoded as JSON.
type stateDocument map[string]json.RawMessage

// stateHeaderOverlay maps inbound HTTP headers carrying ephemeral OAuth
// bearer tokens to invocation-scoped temp: state keys. session.KeyPrefixTemp
// keys are excluded by SessionService.AppendEvent before anything reaches
// D1, so these values live only for the duration of one run.
var stateHeaderOverlay = map[string]string{
	"X-Kroger-Access-Token": session.KeyPrefixTemp + "kroger_token",
	"X-Strava-Access-Token": session.KeyPrefixTemp + "strava_token",
}

// requestStateOverlay extracts request-scoped OAuth bearer tokens forwarded
// by the web proxy and derives the route's public connected flags. Tokens use
// temp: keys and are stripped before persistence; the non-secret booleans may
// persist and are authoritatively overwritten on every applicable run. The
// delta still reaches the in-memory session.State() that tools observe.
func requestStateOverlay(r *http.Request, route string) map[string]any {
	overlay := make(map[string]any)
	for header, key := range stateHeaderOverlay {
		if value := strings.TrimSpace(r.Header.Get(header)); value != "" {
			overlay[key] = value
		}
	}
	switch route {
	case "fitness":
		_, overlay["strava_connected"] = overlay[session.KeyPrefixTemp+"strava_token"]
	case "grocery":
		_, overlay["kroger_connected"] = overlay[session.KeyPrefixTemp+"kroger_token"]
	case "wellness":
		_, overlay["strava_connected"] = overlay[session.KeyPrefixTemp+"strava_token"]
		_, overlay["kroger_connected"] = overlay[session.KeyPrefixTemp+"kroger_token"]
	}
	if len(overlay) == 0 {
		return nil
	}
	return overlay
}

// persistentSnapshot copies public session state for STATE_SNAPSHOT payloads
// and as the JSON Patch base line. Invocation-local temp: keys and the
// sidebar-only session name are not part of the agent's client state document.
func persistentSnapshot(state session.ReadonlyState) (stateDocument, error) {
	snapshot := make(stateDocument)
	if state == nil {
		return snapshot, nil
	}
	for key, value := range state.All() {
		if strings.HasPrefix(key, session.KeyPrefixTemp) || key == sessionNameStateKey {
			continue
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		// ADK deltas use nil as a tombstone. Treat every Go representation
		// that encodes as JSON null (including typed nils) the same way so a
		// deleted value cannot reappear as a client-visible null.
		if bytes.Equal(bytes.TrimSpace(encoded), []byte("null")) {
			continue
		}
		snapshot[key] = encoded
	}
	return snapshot, nil
}

// statePatch applies one ADK state delta to current and delegates RFC 6902
// generation, including JSON Pointer escaping, to jsondiff. A nil delta value
// deletes the key. Temporary values remain invocation-local and never reach
// the client state document.
func statePatch(current stateDocument, delta map[string]any) ([]events.JSONPatchOperation, error) {
	if len(delta) == 0 {
		return nil, nil
	}
	target := maps.Clone(current)
	if target == nil {
		target = make(stateDocument)
	}
	changed := false
	for key, value := range delta {
		if strings.HasPrefix(key, session.KeyPrefixTemp) || key == sessionNameStateKey {
			continue
		}
		encoded, err := json.Marshal(value)
		if err != nil {
			return nil, err
		}
		if bytes.Equal(bytes.TrimSpace(encoded), []byte("null")) {
			if _, ok := target[key]; ok {
				delete(target, key)
				changed = true
			}
			continue
		}
		target[key] = encoded
		changed = true
	}
	if !changed {
		return nil, nil
	}
	currentJSON, err := json.Marshal(current)
	if err != nil {
		return nil, err
	}
	targetJSON, err := json.Marshal(target)
	if err != nil {
		return nil, err
	}
	patch, err := jsondiff.CompareJSON(currentJSON, targetJSON)
	if err != nil {
		return nil, err
	}
	operations := make([]events.JSONPatchOperation, len(patch))
	for i, operation := range patch {
		operations[i] = events.JSONPatchOperation{
			Op:    operation.Type,
			Path:  operation.Path,
			Value: operation.Value,
			From:  operation.From,
		}
	}
	clear(current)
	maps.Copy(current, target)
	return operations, nil
}

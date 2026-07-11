package agui

import (
	"errors"
	"net/http"
	"sort"
	"strings"

	aguievents "github.com/ag-ui-protocol/ag-ui/sdks/community/go/pkg/core/events"
	"google.golang.org/adk/v2/session"
)

// ErrSessionNotFound is the error an injected session.Service must return
// (directly, or wrapped so errors.Is still matches) from Get/AppendEvent
// when the requested app/user/thread identity does not address a live
// session. Handler and StateHandler depend only on this value and the
// session.Service interface — never on a concrete backend package — so any
// session.Service implementation can be plugged in.
var ErrSessionNotFound = errors.New("agui: session not found")

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

// persistentSnapshot copies session state excluding temp: keys for
// STATE_SNAPSHOT payloads and as the JSON Patch base line. Defense in
// depth: the production SessionService already excludes temp: keys from
// persisted/returned state, but this guards against any session.Service
// implementation (including test doubles) that does not.
func persistentSnapshot(state session.ReadonlyState) map[string]any {
	snapshot := make(map[string]any)
	if state == nil {
		return snapshot
	}
	for key, value := range state.All() {
		if strings.HasPrefix(key, session.KeyPrefixTemp) {
			continue
		}
		snapshot[key] = value
	}
	return snapshot
}

// knownKeySet builds the initial "known key" set a statePatch call series
// uses to disambiguate RFC 6902 "add" from "replace".
func knownKeySet(snapshot map[string]any) map[string]bool {
	known := make(map[string]bool, len(snapshot))
	for key := range snapshot {
		known[key] = true
	}
	return known
}

// statePatch converts one raw ADK state delta map into RFC 6902 JSON Patch
// operations. New keys emit "add"; keys already present in known emit
// "replace"; a nil value for an already-known key emits "remove" (mirrors
// agentruntime.Transaction.Delete, the sole producer of nil deltas in this
// codebase). known is mutated in place so repeated calls across one SSE
// stream stay consistent with each other. temp: keys are always excluded so
// they never appear in an emitted event.
func statePatch(known map[string]bool, delta map[string]any) []aguievents.JSONPatchOperation {
	if len(delta) == 0 {
		return nil
	}
	keys := make([]string, 0, len(delta))
	for key := range delta {
		if strings.HasPrefix(key, session.KeyPrefixTemp) {
			continue
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		return nil
	}
	sort.Strings(keys)
	patches := make([]aguievents.JSONPatchOperation, 0, len(keys))
	for _, key := range keys {
		value := delta[key]
		path := "/" + escapeJSONPointer(key)
		switch {
		case value == nil && known[key]:
			patches = append(patches, aguievents.JSONPatchOperation{Op: "remove", Path: path})
			delete(known, key)
		case known[key]:
			patches = append(patches, aguievents.JSONPatchOperation{Op: "replace", Path: path, Value: value})
		case value == nil:
			// Deleting a key that was never known is a no-op.
		default:
			patches = append(patches, aguievents.JSONPatchOperation{Op: "add", Path: path, Value: value})
			known[key] = true
		}
	}
	return patches
}

// escapeJSONPointer escapes a state key for use as an RFC 6901 JSON Pointer
// path segment (mirrors agentruntime.escapeJSONPointer's escaping rules).
func escapeJSONPointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

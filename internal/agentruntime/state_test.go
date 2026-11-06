package agentruntime

import "testing"

func TestStateOverlayPreservesDefaults(t *testing.T) {
	type state struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	}
	defaults := state{Name: "default", Count: 7}
	if got := ReadState(nil, defaults); got != defaults {
		t.Fatalf("absent = %#v", got)
	}
	if got := DecodeState(map[string]any{"name": "saved"}, defaults); got != (state{Name: "saved", Count: 7}) {
		t.Fatalf("overlay = %#v", got)
	}
	if got := DecodeState(map[string]any{"bad": make(chan int)}, defaults); got != defaults {
		t.Fatalf("unencodable = %#v", got)
	}
	if got := StateMap(defaults); got["name"] != "default" || got["count"] != float64(7) {
		t.Fatalf("JSON defaults = %#v", got)
	}
}

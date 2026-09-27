package main

import (
	"bytes"
	"context"
	"errors"
	"os"
	"testing"
)

func TestDispatch(t *testing.T) {
	for _, tc := range []struct {
		name    string
		args    []string
		command string
		status  int
	}{
		{name: "default", command: "serve"},
		{name: "serve", args: []string{"serve"}, command: "serve"},
		{name: "migrate", args: []string{"migrate"}, command: "migrate"},
		{name: "help", args: []string{"--help"}},
		{name: "unknown", args: []string{"unknown"}, status: 2},
		{name: "extra argument", args: []string{"serve", "unexpected"}, status: 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := ""
			commands := make(map[string]command)
			for _, name := range []string{"serve", "migrate"} {
				commands[name] = func(context.Context) error { called = name; return nil }
			}
			var output bytes.Buffer
			if got := dispatch(t.Context(), tc.args, &output, commands); got != tc.status {
				t.Fatalf("status = %d, want %d", got, tc.status)
			}
			if called != tc.command {
				t.Fatalf("command = %q, want %q", called, tc.command)
			}
		})
	}
}

func TestDispatchReturnsFailureStatus(t *testing.T) {
	commands := map[string]command{"migrate": func(context.Context) error { return errors.New("boom") }}
	if got := dispatch(t.Context(), []string{"migrate"}, &bytes.Buffer{}, commands); got != 1 {
		t.Fatalf("status = %d, want 1", got)
	}
}

// Railway builds with Railpack defaults, which compile the first directory
// under cmd/. A new command that sorts before "agents" would silently change
// what production runs.
func TestAgentsIsRailpacksDefaultCommand(t *testing.T) {
	entries, err := os.ReadDir("..")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.IsDir() {
			if entry.Name() != "agents" {
				t.Fatalf("first cmd/ directory is %q; Railpack would build it instead of cmd/agents", entry.Name())
			}
			return
		}
	}
	t.Fatal("cmd/ has no command directories")
}

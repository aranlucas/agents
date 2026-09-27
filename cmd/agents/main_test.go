package main

import (
	"bytes"
	"context"
	"errors"
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
		{name: "telegram", args: []string{"telegram"}, command: "telegram"},
		{name: "help", args: []string{"--help"}},
		{name: "unknown", args: []string{"unknown"}, status: 2},
		{name: "extra argument", args: []string{"serve", "unexpected"}, status: 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			called := ""
			commands := make(map[string]command)
			for _, name := range []string{"serve", "migrate", "telegram"} {
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

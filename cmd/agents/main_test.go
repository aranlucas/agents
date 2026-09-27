package main

import (
	"bytes"
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
			commands := make(map[string]func())
			for _, name := range []string{"serve", "migrate", "telegram"} {
				commands[name] = func() { called = name }
			}
			var output bytes.Buffer
			if got := dispatch(tc.args, &output, commands); got != tc.status {
				t.Fatalf("status = %d, want %d", got, tc.status)
			}
			if called != tc.command {
				t.Fatalf("command = %q, want %q", called, tc.command)
			}
		})
	}
}

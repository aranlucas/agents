// Command agents runs the HTTP gateway, with a migration mode.
package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/aranlucas/agents/internal/gateway"
	"github.com/aranlucas/agents/internal/migrate"
)

const usage = "usage: agents [serve|migrate]"

type command func(context.Context) error

func main() {
	// JSON lines let Railway index level and fields; the standard logger is
	// routed through the same handler.
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	slog.SetDefault(logger)
	log.SetFlags(0)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	status := dispatch(ctx, os.Args[1:], os.Stderr, map[string]command{
		"serve":   gateway.Run,
		"migrate": migrate.Run,
	})
	stop()
	os.Exit(status)
}

func dispatch(ctx context.Context, args []string, output io.Writer, commands map[string]command) int {
	name := "serve"
	if len(args) > 0 {
		name = args[0]
	}
	if len(args) <= 1 && (name == "help" || name == "-h" || name == "--help") {
		_, _ = fmt.Fprintln(output, usage)
		return 0
	}
	run, ok := commands[name]
	if !ok || len(args) > 1 {
		_, _ = fmt.Fprintln(output, usage)
		return 2
	}
	if err := run(ctx); err != nil {
		slog.Error("command failed", "command", name, "error", err)
		return 1
	}
	return 0
}

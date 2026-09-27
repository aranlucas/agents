// Command agents runs the HTTP gateway, with migration and Telegram worker modes.
package main

import (
	"fmt"
	"io"
	"os"

	"github.com/aranlucas/agents/internal/gateway"
	"github.com/aranlucas/agents/internal/migrate"
	"github.com/aranlucas/agents/internal/telegramworker"
)

func main() {
	os.Exit(dispatch(os.Args[1:], os.Stderr, map[string]func(){
		"serve":    gateway.Run,
		"migrate":  migrate.Run,
		"telegram": telegramworker.Run,
	}))
}

func dispatch(args []string, output io.Writer, commands map[string]func()) int {
	command := "serve"
	if len(args) > 0 {
		command = args[0]
	}
	if len(args) <= 1 && (command == "help" || command == "-h" || command == "--help") {
		if _, err := fmt.Fprintln(output, "usage: agents [serve|migrate|telegram]"); err != nil {
			return 1
		}
		return 0
	}
	run, ok := commands[command]
	if !ok || len(args) > 1 {
		if _, err := fmt.Fprintln(output, "usage: agents [serve|migrate|telegram]"); err != nil {
			return 1
		}
		return 2
	}
	run()
	return 0
}

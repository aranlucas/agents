package telegram

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"sync"
	"time"

	"agents/internal/agui"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/artifact"
	"google.golang.org/adk/v2/runner"
	"google.golang.org/adk/v2/session"
	"google.golang.org/genai"
)

type (
	ProgressFunc func(context.Context, string) error
	Executor     interface {
		Run(context.Context, SessionIdentity, Route, string, ProgressFunc) (string, error)
		Reset(context.Context, SessionIdentity) error
	}
)

type taskSet struct {
	mu     sync.Mutex
	values map[string]context.CancelFunc
}

func newTaskSet() *taskSet { return &taskSet{values: make(map[string]context.CancelFunc)} }
func (t *taskSet) Start(id string, cancel context.CancelFunc) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, exists := t.values[id]; exists {
		return false
	}
	t.values[id] = cancel
	return true
}
func (t *taskSet) Finish(id string) { t.mu.Lock(); delete(t.values, id); t.mu.Unlock() }
func (t *taskSet) Stop(id string) bool {
	t.mu.Lock()
	cancel, exists := t.values[id]
	if exists {
		delete(t.values, id)
	}
	t.mu.Unlock()
	if exists {
		cancel()
	}
	return exists
}

func (t *taskSet) Has(id string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	_, exists := t.values[id]
	return exists
}

type Runner struct {
	client      Client
	router      *Router
	links       *LinkStore
	executor    Executor
	tasks       *taskSet
	config      Config
	timeout     time.Duration
	pollTimeout int
	offset      int64
}

func NewRunner(client Client, router *Router, links *LinkStore, executor Executor, cfg Config, timeout time.Duration) (*Runner, error) {
	if client == nil || router == nil || links == nil || executor == nil {
		return nil, errors.New("telegram runner dependencies are required")
	}
	if timeout <= 0 {
		timeout = 180 * time.Second
	}
	return &Runner{client: client, router: router, links: links, executor: executor, tasks: newTaskSet(), config: cfg, timeout: timeout, pollTimeout: 50}, nil
}

func (r *Runner) Run(ctx context.Context) error {
	for ctx.Err() == nil {
		updates, err := r.client.GetUpdates(ctx, r.offset, r.pollTimeout)
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			select {
			case <-ctx.Done():
				return nil
			case <-time.After(time.Second):
				continue
			}
		}
		for _, update := range updates {
			if update.UpdateID >= r.offset {
				r.offset = update.UpdateID + 1
			}
			if update.Message != nil {
				_ = r.HandleMessage(ctx, *update.Message)
			}
		}
	}
	return nil
}

func (r *Runner) HandleMessage(parent context.Context, message Message) error {
	if !AllowMessage(r.config, message) {
		return nil
	}
	link := AccountLink{}
	if message.From != nil {
		if found, ok, err := r.links.Lookup(parent, message.From.ID); err == nil && ok {
			link = found
		}
	}
	identity := SessionIdentityFor(message, link)
	if parseCommand(cleanAddressedText(message.Text, r.config.BotUsername)) == "stop" {
		if r.tasks.Stop(identity.SessionID) {
			return r.sendText(parent, message, "Stopped.")
		}
		return r.sendText(parent, message, "Nothing is running for this conversation.")
	}
	ctx, cancel := context.WithTimeout(parent, r.timeout)
	if !r.tasks.Start(identity.SessionID, cancel) {
		cancel()
		return r.sendText(parent, message, "A request is already running for this conversation. Send /stop to cancel it.")
	}
	defer r.tasks.Finish(identity.SessionID)
	defer cancel()
	route, err := r.router.Route(ctx, message, identity)
	if err != nil {
		switch {
		case errors.Is(err, ErrLoginRequired):
			return r.sendText(ctx, message, "Sign in is required. Send /login to link this Telegram account.")
		case errors.Is(err, ErrCredentialRequired):
			return r.sendText(ctx, message, missingCredentialText(route.Missing, r.config.ConnectURL))
		default:
			return nil
		}
	}
	if route.Kind == RouteCommand {
		return r.handleCommand(ctx, message, identity, route.Command)
	}
	_ = r.client.SendChatAction(ctx, message.Chat.ID, message.MessageThreadID, "typing")
	seenProgress := map[string]bool{}
	progress := func(progressCtx context.Context, label string) error {
		label = strings.TrimSpace(label)
		if label == "" || seenProgress[label] {
			return nil
		}
		seenProgress[label] = true
		return r.sendText(progressCtx, message, label)
	}
	output, err := r.executor.Run(ctx, identity, route, route.Text, progress)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return r.sendText(parent, message, "I couldn't complete that request. Please try again.")
	}
	if strings.TrimSpace(output) == "" {
		output = "Done."
	}
	return r.sendText(ctx, message, output)
}

func (r *Runner) handleCommand(ctx context.Context, message Message, identity SessionIdentity, command string) error {
	switch command {
	case "start", "help":
		return r.sendText(ctx, message, "Send a request and I'll route it to the right specialist. Commands: /login, /logout, /new, /reset, /stop, /chat_id.")
	case "chat_id":
		return r.sendText(ctx, message, fmt.Sprintf("Chat ID: %d", message.Chat.ID))
	case "login":
		if message.From == nil || r.config.LinkBaseURL == "" {
			return r.sendText(ctx, message, "Account linking is not configured.")
		}
		token, err := r.links.CreateForChat(ctx, message.From.ID, message.Chat.ID, 10*time.Minute)
		if err != nil {
			return r.sendText(ctx, message, "I couldn't create a sign-in link. Please try again.")
		}
		separator := "?"
		if strings.Contains(r.config.LinkBaseURL, "?") {
			separator = "&"
		}
		return r.sendText(ctx, message, r.config.LinkBaseURL+separator+url.Values{"token": {token}}.Encode())
	case "logout", "unlink":
		if message.From == nil {
			return nil
		}
		unlinked, err := r.links.Unlink(ctx, message.From.ID)
		if err != nil {
			return r.sendText(ctx, message, "I couldn't unlink the account.")
		}
		if !unlinked {
			return r.sendText(ctx, message, "This Telegram account is not linked.")
		}
		if r.router.clerk != nil {
			_ = r.router.clerk.MirrorTelegramUnlink(ctx, message.From.ID)
		}
		return r.sendText(ctx, message, "Telegram account unlinked.")
	case "new", "reset":
		if err := r.executor.Reset(ctx, identity); err != nil {
			return r.sendText(ctx, message, "I couldn't reset this conversation.")
		}
		return r.sendText(ctx, message, "Started a fresh conversation.")
	default:
		return r.sendText(ctx, message, "Unknown command. Send /help.")
	}
}

func (r *Runner) sendText(ctx context.Context, message Message, text string) error {
	for _, chunk := range ChunkMarkdownV2(text, 4096) {
		if _, err := r.client.SendMessage(ctx, SendMessageRequest{ChatID: message.Chat.ID, MessageThreadID: message.MessageThreadID, Text: chunk, ParseMode: "MarkdownV2", DisableWebPagePreview: true}); err != nil {
			return err
		}
	}
	return nil
}

func missingCredentialText(missing []string, connectURL string) string {
	names := strings.Join(missing, " and ")
	text := "Your account is linked, but " + names + " is not connected yet."
	if connectURL != "" {
		text += " Connect it here: " + connectURL
	}
	return text
}
func (r *Runner) HasTask(id string) bool { return r.tasks.Has(id) }

type ADKExecutor struct {
	sessions session.Service
	agents   map[string]boundAgent
}

type boundAgent struct {
	agent  agent.Agent
	runner *runner.Runner
}

func NewADKExecutor(sessions session.Service, artifacts artifact.Service, agents map[string]agent.Agent) (*ADKExecutor, error) {
	if sessions == nil || len(agents) == 0 {
		return nil, errors.New("telegram ADK sessions and agents are required")
	}
	bound := make(map[string]boundAgent, len(agents))
	for route, built := range agents {
		if built == nil {
			return nil, fmt.Errorf("telegram agent %q is required", route)
		}
		run, err := runner.New(runner.Config{AppName: built.Name(), Agent: built, SessionService: sessions, ArtifactService: artifacts, AutoCreateSession: true})
		if err != nil {
			return nil, fmt.Errorf("build Telegram ADK runner for %q: %w", route, err)
		}
		bound[route] = boundAgent{agent: built, runner: run}
	}
	return &ADKExecutor{sessions: sessions, agents: bound}, nil
}

func (e *ADKExecutor) Run(ctx context.Context, identity SessionIdentity, route Route, text string, progress ProgressFunc) (string, error) {
	bound, ok := e.agents[route.Agent]
	if !ok {
		bound, ok = e.agents["orchestrator"]
	}
	if !ok {
		return "", errors.New("telegram route has no agent")
	}
	built := bound.agent
	state := map[string]any{"sender_linked": identity.ClerkUserID != ""}
	if route.KrogerToken != "" {
		state[session.KeyPrefixTemp+"kroger_token"] = route.KrogerToken
		state["kroger_connected"] = true
	}
	if route.StravaToken != "" {
		state[session.KeyPrefixTemp+"strava_token"] = route.StravaToken
		state["strava_connected"] = true
	}
	var texts []string
	seen := map[string]bool{}
	lastAuthor := ""
	for event, runErr := range bound.runner.Run(ctx, identity.UserID, identity.SessionID, genai.NewContentFromText(text, genai.RoleUser), agent.RunConfig{StreamingMode: agent.StreamingModeNone}, runner.WithStateDelta(state)) {
		if runErr != nil {
			return "", runErr
		}
		if event == nil {
			continue
		}
		if event.Author != "" && event.Author != lastAuthor && event.Author != built.Name() {
			lastAuthor = event.Author
			_ = progress(ctx, "Working with "+event.Author+"…")
		}
		if event.Content != nil {
			for _, part := range event.Content.Parts {
				if part != nil && !part.Thought && strings.TrimSpace(part.Text) != "" && !seen[part.Text] {
					seen[part.Text] = true
					texts = append(texts, part.Text)
				}
			}
		}
	}
	return strings.TrimSpace(strings.Join(texts, "\n")), nil
}

func (e *ADKExecutor) Reset(ctx context.Context, identity SessionIdentity) error {
	for _, bound := range e.agents {
		err := e.sessions.Delete(ctx, &session.DeleteRequest{AppName: bound.agent.Name(), UserID: identity.UserID, SessionID: identity.SessionID})
		if err != nil && !errors.Is(err, agui.ErrSessionNotFound) {
			return err
		}
	}
	return nil
}

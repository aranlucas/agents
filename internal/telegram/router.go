package telegram

import (
	"context"
	"errors"
	"slices"
	"strings"

	"github.com/aranlucas/agents/internal/clerk"
)

var (
	ErrMessageNotAllowed  = errors.New("telegram message is not allowed")
	ErrLoginRequired      = errors.New("telegram account link required")
	ErrCredentialRequired = errors.New("required Telegram integration is not connected")
)

type Config struct {
	BotUsername    string
	AllowedChatIDs []int64
	LinkBaseURL    string
	ConnectURL     string
}

func AllowMessage(cfg Config, message Message) bool {
	if len(cfg.AllowedChatIDs) > 0 && !slices.Contains(cfg.AllowedChatIDs, message.Chat.ID) {
		return false
	}
	if message.From == nil || message.From.IsBot || strings.TrimSpace(message.Text) == "" {
		return false
	}
	if message.Chat.Type == "private" {
		return true
	}
	username := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(cfg.BotUsername)), "@")
	mentioned := username != "" && strings.Contains(strings.ToLower(message.Text), "@"+username)
	replied := message.ReplyToMessage != nil && message.ReplyToMessage.From != nil && message.ReplyToMessage.From.IsBot && (username == "" || strings.EqualFold(message.ReplyToMessage.From.Username, username))
	return mentioned || replied || strings.HasPrefix(strings.TrimSpace(message.Text), "/")
}

type RouteKind string

const (
	RouteAgent   RouteKind = "agent"
	RouteCommand RouteKind = "command"
)

type Route struct {
	Kind        RouteKind
	Agent       string
	Command     string
	Text        string
	Missing     []string
	KrogerToken string
}

type Router struct {
	cfg   Config
	clerk clerk.Backend
}

func NewRouter(cfg Config, clerk clerk.Backend) *Router {
	return &Router{cfg: cfg, clerk: clerk}
}

func (r *Router) Route(ctx context.Context, message Message, identity SessionIdentity) (Route, error) {
	if !AllowMessage(r.cfg, message) {
		return Route{}, ErrMessageNotAllowed
	}
	text := cleanAddressedText(message.Text, r.cfg.BotUsername)
	if command := parseCommand(text); command != "" {
		switch command {
		case "start", "help", "login", "logout", "unlink", "new", "reset", "stop", "chat_id":
			return Route{Kind: RouteCommand, Command: command, Text: text}, nil
		default:
			return Route{Kind: RouteCommand, Command: "help", Text: text}, nil
		}
	}
	agentName := specialistForText(text)
	missing := requiredCredentials(agentName)
	if len(missing) > 0 {
		if identity.ClerkUserID == "" {
			return Route{}, ErrLoginRequired
		}
		if r.clerk == nil {
			return Route{Missing: missing}, ErrCredentialRequired
		}
		state, err := r.clerk.OAuthConnections(ctx, identity.ClerkUserID)
		if err != nil {
			return Route{}, ErrCredentialRequired
		}
		missing = missing[:0]
		if (agentName == "grocery" || agentName == "wellness") && !state.Kroger {
			missing = append(missing, "Kroger")
		}
		if len(missing) > 0 {
			return Route{Missing: missing}, ErrCredentialRequired
		}
		return Route{Kind: RouteAgent, Agent: agentName, Text: text, KrogerToken: state.KrogerToken}, nil
	}
	return Route{Kind: RouteAgent, Agent: agentName, Text: text}, nil
}

func parseCommand(text string) string {
	fields := strings.Fields(text)
	if len(fields) == 0 || !strings.HasPrefix(fields[0], "/") {
		return ""
	}
	return strings.SplitN(strings.TrimPrefix(fields[0], "/"), "@", 2)[0]
}

func cleanAddressedText(text, username string) string {
	username = strings.TrimPrefix(strings.TrimSpace(username), "@")
	if username != "" {
		text = strings.ReplaceAll(text, "@"+username, "")
		text = strings.ReplaceAll(text, "@"+strings.ToLower(username), "")
	}
	return strings.TrimSpace(text)
}

func specialistForText(text string) string {
	lower := strings.ToLower(text)
	if containsAny(lower, "wellness", "meals and workout", "food and training") {
		return "wellness"
	}
	if containsAny(lower, "grocery", "groceries", "meal plan", "kroger", "pantry") {
		return "grocery"
	}
	if containsAny(lower, "fitness", "workout", "training plan", "run plan") {
		return "fitness"
	}
	return "orchestrator"
}

func requiredCredentials(agent string) []string {
	switch agent {
	case "grocery":
		return []string{"Kroger"}
	case "wellness":
		return []string{"Kroger"}
	default:
		return nil
	}
}

func containsAny(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if strings.Contains(value, candidate) {
			return true
		}
	}
	return false
}

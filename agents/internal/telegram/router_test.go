package telegram

import (
	"context"
	"errors"
	"testing"

	"agents/internal/clerk"
)

func TestTopicSessionUsesSharedGroupPartition(t *testing.T) {
	message := Message{Chat: Chat{ID: -100, Type: "supergroup"}, MessageThreadID: 7, From: &User{ID: 9}}
	identity := SessionIdentityFor(message, AccountLink{})
	if identity.SessionID != "telegram:-100:topic:7:orchestrator" || identity.UserID != "telegram:group:-100:topic:7" || !identity.Shared {
		t.Fatalf("identity=%#v", identity)
	}
}

func TestPrivateSessionUsesLinkedClerkIdentity(t *testing.T) {
	message := Message{Chat: Chat{ID: 100, Type: "private"}, From: &User{ID: 9}}
	identity := SessionIdentityFor(message, AccountLink{ClerkUserID: "user-a"})
	if identity.SessionID != "telegram:100:orchestrator" || identity.UserID != "user-a" {
		t.Fatalf("identity=%#v", identity)
	}
}

func TestGroupMessageRequiresMentionOrReply(t *testing.T) {
	cfg := Config{BotUsername: "agents_bot"}
	base := Message{Chat: Chat{ID: -1, Type: "group"}, From: &User{ID: 9}}
	message := base
	message.Text = "plan meals"
	if AllowMessage(cfg, message) {
		t.Fatal("unmentioned group message accepted")
	}
	message.Text = "@agents_bot plan meals"
	if !AllowMessage(cfg, message) {
		t.Fatal("mention rejected")
	}
	message.Text = "plan meals"
	message.ReplyToMessage = &Message{From: &User{ID: 1, IsBot: true, Username: "agents_bot"}}
	if !AllowMessage(cfg, message) {
		t.Fatal("reply rejected")
	}
}

func TestAllowedChatIDsFailClosed(t *testing.T) {
	message := Message{Chat: Chat{ID: 2, Type: "private"}, From: &User{ID: 9}, Text: "hello"}
	if AllowMessage(Config{AllowedChatIDs: []int64{1}}, message) {
		t.Fatal("unlisted chat accepted")
	}
}

type fakeClerk struct{ state clerk.ConnectionState }

func (f fakeClerk) OAuthConnections(context.Context, string) (clerk.ConnectionState, error) {
	return f.state, nil
}

func TestCredentialGatesUseLinkedSenderConnections(t *testing.T) {
	message := Message{Chat: Chat{ID: 1, Type: "private"}, From: &User{ID: 9}, Text: "make a wellness plan"}
	identity := SessionIdentityFor(message, AccountLink{ClerkUserID: "user-a"})
	_, err := NewRouter(Config{}, fakeClerk{}).Route(t.Context(), message, identity)
	if !errors.Is(err, ErrCredentialRequired) {
		t.Fatalf("error=%v", err)
	}
	route, err := NewRouter(Config{}, fakeClerk{state: clerk.ConnectionState{Kroger: true}}).Route(t.Context(), message, identity)
	if err != nil || route.Agent != "wellness" {
		t.Fatalf("route=%#v err=%v", route, err)
	}
}

func TestFitnessDoesNotRequireOAuthCredential(t *testing.T) {
	message := Message{Chat: Chat{ID: 1, Type: "private"}, From: &User{ID: 9}, Text: "make a fitness plan"}
	route, err := NewRouter(Config{}, nil).Route(t.Context(), message, SessionIdentityFor(message, AccountLink{}))
	if err != nil || route.Agent != "fitness" {
		t.Fatalf("route=%#v err=%v", route, err)
	}
}

func TestCommandsBypassCredentialRouting(t *testing.T) {
	message := Message{Chat: Chat{ID: 1, Type: "private"}, From: &User{ID: 9}, Text: "/login"}
	route, err := NewRouter(Config{}, nil).Route(t.Context(), message, SessionIdentityFor(message, AccountLink{}))
	if err != nil || route.Kind != RouteCommand || route.Command != "login" {
		t.Fatalf("route=%#v err=%v", route, err)
	}
}

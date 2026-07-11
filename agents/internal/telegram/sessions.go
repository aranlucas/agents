package telegram

import "fmt"

const OrchestratorAppName = "telegram_orchestrator_agent"

type SessionIdentity struct {
	SessionID   string `json:"session_id"`
	UserID      string `json:"user_id"`
	ClerkUserID string `json:"clerk_user_id,omitempty"`
	Shared      bool   `json:"shared"`
}

func SessionIdentityFor(message Message, link AccountLink) SessionIdentity {
	if message.MessageThreadID != 0 {
		return SessionIdentity{SessionID: fmt.Sprintf("telegram:%d:topic:%d:orchestrator", message.Chat.ID, message.MessageThreadID), UserID: fmt.Sprintf("telegram:group:%d:topic:%d", message.Chat.ID, message.MessageThreadID), ClerkUserID: link.ClerkUserID, Shared: true}
	}
	userID := link.ClerkUserID
	if userID == "" {
		senderID := int64(0)
		if message.From != nil {
			senderID = message.From.ID
		}
		userID = fmt.Sprintf("telegram:anon:%d", senderID)
	}
	return SessionIdentity{SessionID: fmt.Sprintf("telegram:%d:orchestrator", message.Chat.ID), UserID: userID, ClerkUserID: link.ClerkUserID}
}

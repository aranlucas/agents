package telegram

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGetUpdatesUsesLongPollTimeoutAndOffset(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		if !strings.HasSuffix(request.URL.Path, "/bottest-token/getUpdates") {
			t.Fatalf("path=%s", request.URL.Path)
		}
		if err := request.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if request.Form.Get("timeout") != "50" || request.Form.Get("offset") != "101" || request.Form.Get("allowed_updates") != `["message"]` {
			t.Fatalf("form=%#v", request.Form)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "result": []any{
			map[string]any{"update_id": 1, "message": map[string]any{"message_id": 2, "chat": map[string]any{"id": 3, "type": "private"}, "text": "hello"}},
			map[string]any{"update_id": 2, "edited_message": map[string]any{"text": "ignored"}},
		}})
	}))
	defer server.Close()
	client, err := NewHTTPClient(server.Client(), server.URL, "test-token")
	if err != nil {
		t.Fatal(err)
	}
	updates, err := client.GetUpdates(t.Context(), 101, 99)
	if err != nil {
		t.Fatal(err)
	}
	if len(updates) != 1 || updates[0].Message.Text != "hello" {
		t.Fatalf("updates=%#v", updates)
	}
}

func TestSendMessageNeverLeaksTokenInErrors(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "bad", http.StatusBadRequest) }))
	defer server.Close()
	client, err := NewHTTPClient(server.Client(), server.URL, "secret-token")
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.SendMessage(t.Context(), SendMessageRequest{ChatID: 1, Text: "hello"})
	if err == nil || strings.Contains(err.Error(), "secret-token") {
		t.Fatalf("error=%v", err)
	}
}

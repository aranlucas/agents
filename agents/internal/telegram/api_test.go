package telegram

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type telegramRoundTripFunc func(*http.Request) (*http.Response, error)

func (f telegramRoundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func TestTelegramResultDecodesConcreteTypeWithoutNetwork(t *testing.T) {
	client := &HTTPClient{client: &http.Client{Transport: telegramRoundTripFunc(func(request *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Status:     "200 OK",
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"ok":true,"result":{"message_id":7,"chat":{"id":3,"type":"private"},"date":1,"text":"hello"}}`)),
			Request:    request,
		}, nil
	})}}
	request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, "https://api.telegram.test/sendMessage", nil)
	if err != nil {
		t.Fatal(err)
	}
	message, err := telegramResult[Message](client, request)
	if err != nil {
		t.Fatal(err)
	}
	if message.MessageID != 7 || message.Text != "hello" {
		t.Fatalf("message = %#v", message)
	}
}

func TestTelegramResultRejectsMissingNullOrWrongTypeWithoutNetwork(t *testing.T) {
	for name, body := range map[string]string{
		"missing":           `{"ok":true}`,
		"null":              `{"ok":true,"result":null}`,
		"wrong result type": `{"ok":true,"result":""}`,
	} {
		t.Run(name, func(t *testing.T) {
			client := &HTTPClient{client: &http.Client{Transport: telegramRoundTripFunc(func(request *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: http.StatusOK,
					Status:     "200 OK",
					Header:     make(http.Header),
					Body:       io.NopCloser(strings.NewReader(body)),
					Request:    request,
				}, nil
			})}}
			request, err := http.NewRequestWithContext(t.Context(), http.MethodPost, "https://api.telegram.test/sendMessage", nil)
			if err != nil {
				t.Fatal(err)
			}
			if result, err := telegramResult[Message](client, request); err == nil {
				t.Fatalf("telegramResult() = %#v, want error", result)
			}
		})
	}
}

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

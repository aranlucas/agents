package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const maxTelegramBody = 2 << 20

type User struct {
	ID        int64  `json:"id"`
	IsBot     bool   `json:"is_bot"`
	FirstName string `json:"first_name"`
	Username  string `json:"username,omitempty"`
}
type Chat struct {
	ID       int64  `json:"id"`
	Type     string `json:"type"`
	Title    string `json:"title,omitempty"`
	Username string `json:"username,omitempty"`
}
type Message struct {
	MessageID       int64    `json:"message_id"`
	MessageThreadID int64    `json:"message_thread_id,omitempty"`
	From            *User    `json:"from,omitempty"`
	Chat            Chat     `json:"chat"`
	Date            int64    `json:"date"`
	Text            string   `json:"text,omitempty"`
	ReplyToMessage  *Message `json:"reply_to_message,omitempty"`
}
type Update struct {
	UpdateID int64    `json:"update_id"`
	Message  *Message `json:"message,omitempty"`
}
type ForumTopic struct {
	MessageThreadID int64  `json:"message_thread_id"`
	Name            string `json:"name"`
}

type Client interface {
	GetUpdates(context.Context, int64, int) ([]Update, error)
	SendMessage(context.Context, SendMessageRequest) (Message, error)
	SendChatAction(context.Context, int64, int64, string) error
}

type HTTPClient struct {
	client  *http.Client
	baseURL string
	token   string
}

func NewHTTPClient(client *http.Client, baseURL, token string) (*HTTPClient, error) {
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	if client.Timeout <= 0 {
		copied := *client
		copied.Timeout = 60 * time.Second
		client = &copied
	}
	parsed, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/"))
	if err != nil || parsed.Hostname() == "" {
		return nil, errors.New("invalid Telegram API base URL")
	}
	if parsed.Scheme != "https" && (parsed.Scheme != "http" || !isTelegramLoopback(parsed.Hostname())) {
		return nil, errors.New("telegram API must use HTTPS")
	}
	if strings.TrimSpace(token) == "" {
		return nil, errors.New("telegram bot token is required")
	}
	return &HTTPClient{client: client, baseURL: strings.TrimRight(parsed.String(), "/"), token: token}, nil
}

func (c *HTTPClient) GetUpdates(ctx context.Context, offset int64, timeout int) ([]Update, error) {
	if timeout < 1 || timeout > 50 {
		timeout = 50
	}
	form := url.Values{"offset": {strconv.FormatInt(offset, 10)}, "timeout": {strconv.Itoa(timeout)}, "allowed_updates": {`["message"]`}}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.methodURL("getUpdates"), strings.NewReader(form.Encode()))
	if err != nil {
		return nil, errors.New("build Telegram request")
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	var updates []Update
	if err := c.do(request, &updates); err != nil {
		return nil, err
	}
	filtered := updates[:0]
	for _, update := range updates {
		if update.Message != nil && strings.TrimSpace(update.Message.Text) != "" {
			filtered = append(filtered, update)
		}
	}
	return filtered, nil
}

type SendMessageRequest struct {
	ChatID                int64  `json:"chat_id"`
	MessageThreadID       int64  `json:"message_thread_id,omitempty"`
	Text                  string `json:"text"`
	ParseMode             string `json:"parse_mode,omitempty"`
	DisableWebPagePreview bool   `json:"disable_web_page_preview,omitempty"`
}

func (c *HTTPClient) SendMessage(ctx context.Context, input SendMessageRequest) (Message, error) {
	if input.ChatID == 0 || strings.TrimSpace(input.Text) == "" {
		return Message{}, errors.New("telegram chat and text are required")
	}
	request, err := c.jsonRequest(ctx, "sendMessage", input)
	if err != nil {
		return Message{}, err
	}
	var message Message
	if err := c.do(request, &message); err != nil {
		return Message{}, err
	}
	return message, nil
}

func (c *HTTPClient) SendChatAction(ctx context.Context, chatID, threadID int64, action string) error {
	if chatID == 0 || strings.TrimSpace(action) == "" {
		return errors.New("telegram chat and action are required")
	}
	request, err := c.jsonRequest(ctx, "sendChatAction", struct {
		ChatID          int64  `json:"chat_id"`
		MessageThreadID int64  `json:"message_thread_id,omitempty"`
		Action          string `json:"action"`
	}{chatID, threadID, action})
	if err != nil {
		return err
	}
	var accepted bool
	return c.do(request, &accepted)
}

func (c *HTTPClient) jsonRequest(ctx context.Context, method string, input any) (*http.Request, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return nil, errors.New("encode Telegram request")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.methodURL(method), bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("build Telegram request")
	}
	request.Header.Set("Content-Type", "application/json")
	return request, nil
}
func (c *HTTPClient) methodURL(method string) string {
	return c.baseURL + "/bot" + c.token + "/" + method
}
func (c *HTTPClient) do(request *http.Request, output any) error {
	response, err := c.client.Do(request)
	if err != nil {
		return errors.New("telegram request failed")
	}
	defer func() { _ = response.Body.Close() }()
	data, err := io.ReadAll(io.LimitReader(response.Body, maxTelegramBody+1))
	if err != nil || len(data) > maxTelegramBody {
		return errors.New("telegram response invalid or too large")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("telegram returned HTTP %d", response.StatusCode)
	}
	var envelope struct {
		OK        bool            `json:"ok"`
		Result    json.RawMessage `json:"result"`
		ErrorCode int             `json:"error_code"`
	}
	if json.Unmarshal(data, &envelope) != nil || !envelope.OK {
		return errors.New("telegram API rejected request")
	}
	if output != nil && json.Unmarshal(envelope.Result, output) != nil {
		return errors.New("telegram response is malformed")
	}
	return nil
}
func isTelegramLoopback(host string) bool {
	ip := net.ParseIP(host)
	return strings.EqualFold(host, "localhost") || ip != nil && ip.IsLoopback()
}

// Package bravesearch provides a bounded client for Brave Web Search.
package bravesearch

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/aranlucas/agents/internal/common"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

const defaultMaxBody = 2 << 20

var ErrEmptyQuery = errors.New("search query is required")

type Result struct {
	Title       string `json:"title"`
	URL         string `json:"url"`
	Description string `json:"description"`
}

// SearchToolArgs and SearchToolResult are the shared ADK boundary for the
// web_search tool exposed by agents that use Brave.
type SearchToolArgs struct {
	Query string `json:"query"`
	Count int    `json:"count"`
}

type SearchToolResult struct {
	Results []Result `json:"results"`
}

type Client struct {
	client   *common.HTTPClient
	endpoint *url.URL
	apiKey   string
	maximum  int
}

func New(client *http.Client, endpoint, apiKey string, maximum int) (*Client, error) {
	if client == nil {
		client = common.NewHTTPClient(15*time.Second, defaultMaxBody).Client
	}
	endpoint = strings.TrimRight(endpoint, "/")
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || !secureOrLoopback(parsed) {
		return nil, errors.New("invalid Brave endpoint")
	}
	if strings.TrimSpace(apiKey) == "" {
		return nil, errors.New("missing Brave API key")
	}
	if maximum <= 0 || maximum > 20 {
		maximum = 10
	}
	return &Client{
		client:   &common.HTTPClient{Client: client, MaxBody: defaultMaxBody},
		endpoint: parsed,
		apiKey:   apiKey,
		maximum:  maximum,
	}, nil
}

func (s *Client) Search(ctx context.Context, query string, count int) ([]Result, error) {
	if s == nil || s.endpoint == nil {
		return nil, errors.New("brave search endpoint is not configured")
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, ErrEmptyQuery
	}
	if len(query) > 500 {
		return nil, errors.New("search query exceeds limit")
	}
	if count < 1 {
		count = 1
	}
	if count > s.maximum {
		count = s.maximum
	}
	parsed := s.endpoint.Clone()
	values := parsed.Query()
	values.Set("q", query)
	values.Set("count", strconv.Itoa(count))
	parsed.RawQuery = values.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return nil, errors.New("create Brave request")
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-Subscription-Token", s.apiKey)
	type braveResponse struct {
		Web struct {
			Results []struct {
				Title       string `json:"title"`
				URL         string `json:"url"`
				Description string `json:"description"`
			} `json:"results"`
		} `json:"web"`
	}
	response, err := s.client.DecodeJSON[braveResponse](ctx, request)
	if err != nil {
		return nil, err
	}
	results := make([]Result, 0, min(len(response.Web.Results), count))
	for _, result := range response.Web.Results {
		if len(results) == count {
			break
		}
		parsedURL, err := url.Parse(result.URL)
		if err != nil || parsedURL.Scheme != "https" {
			continue
		}
		results = append(results, Result{Title: result.Title, URL: result.URL, Description: result.Description})
	}
	return results, nil
}

// SearchTool adapts this client's bounded search operation to an ADK function
// tool. Keeping the adapter here gives every agent the same input/output
// schema and error propagation while callers retain control of the tool
// description shown to the model.
func (s *Client) SearchTool(description string) (tool.Tool, error) {
	if s == nil {
		return nil, errors.New("brave search client is required")
	}
	return functiontool.New(functiontool.Config{
		Name:        "web_search",
		Description: description,
	}, func(ctx agent.Context, input SearchToolArgs) (SearchToolResult, error) {
		results, err := s.Search(ctx, input.Query, input.Count)
		return SearchToolResult{Results: results}, err
	})
}

func secureOrLoopback(parsed *url.URL) bool {
	return parsed.Scheme == "https" || parsed.Scheme == "http" && (parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost" || parsed.Hostname() == "::1")
}

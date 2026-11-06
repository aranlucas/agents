package config

import (
	"log"
	"strconv"
	"strings"
	"time"
)

// StreamSmoothing controls server-side pacing for AG-UI text streaming.
type StreamSmoothing struct {
	Enabled       bool
	Chunking      string
	CharsPerChunk int
	ChunkDelay    time.Duration
}

func DefaultStreamSmoothing() StreamSmoothing {
	return StreamSmoothing{Enabled: true, Chunking: "word", CharsPerChunk: 64, ChunkDelay: 18 * time.Millisecond}
}

// Normalize also accepts programmatically constructed policies. A zero delay
// explicitly disables pacing delays; a zero policy disables smoothing.
func (cfg StreamSmoothing) Normalize() StreamSmoothing {
	switch strings.ToLower(cfg.Chunking) {
	case "line", "char":
		cfg.Chunking = strings.ToLower(cfg.Chunking)
	default:
		cfg.Chunking = "word"
	}
	if cfg.CharsPerChunk <= 0 {
		cfg.CharsPerChunk = DefaultStreamSmoothing().CharsPerChunk
	}
	if cfg.ChunkDelay < 0 {
		cfg.ChunkDelay = 0
	}
	return cfg
}

func loadStreamSmoothing(getenv func(string) string) StreamSmoothing {
	result := DefaultStreamSmoothing()
	if rawChunking := strings.TrimSpace(strings.ToLower(getenv("AGUI_STREAM_CHUNKING"))); rawChunking != "" {
		result.Chunking = rawChunking
	}
	if rawEnabled := strings.TrimSpace(getenv("AGUI_STREAM_SMOOTHING")); rawEnabled != "" {
		parsed, err := strconv.ParseBool(rawEnabled)
		if err != nil {
			log.Printf("invalid AGUI_STREAM_SMOOTHING=%q, defaulting to true", rawEnabled)
		} else {
			result.Enabled = parsed
		}
	}
	if rawChunkSize := strings.TrimSpace(getenv("AGUI_STREAM_CHUNK_SIZE")); rawChunkSize != "" {
		parsed, err := strconv.Atoi(rawChunkSize)
		switch {
		case err != nil:
			log.Printf("invalid AGUI_STREAM_CHUNK_SIZE=%q, defaulting to %d", rawChunkSize, result.CharsPerChunk)
		case parsed > 0:
			result.CharsPerChunk = parsed
		default:
			log.Printf("AGUI_STREAM_CHUNK_SIZE=%d must be >0, using %d", parsed, result.CharsPerChunk)
		}
	}
	if rawDelay := strings.TrimSpace(getenv("AGUI_STREAM_CHUNK_DELAY_MS")); rawDelay != "" {
		parsed, err := strconv.Atoi(rawDelay)
		switch {
		case err != nil:
			log.Printf("invalid AGUI_STREAM_CHUNK_DELAY_MS=%q, defaulting to %s", rawDelay, result.ChunkDelay)
		case parsed >= 0:
			result.ChunkDelay = time.Duration(parsed) * time.Millisecond
		default:
			log.Printf("AGUI_STREAM_CHUNK_DELAY_MS=%d is negative, using %s", parsed, DefaultStreamSmoothing().ChunkDelay)
		}
	}
	return result.Normalize()
}

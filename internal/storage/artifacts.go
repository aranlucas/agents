package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	json "encoding/json/v2"
	"errors"
	"strings"
	"time"
	"unicode"

	"google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

const maxArtifactBytes = 20 << 20

// ErrInvalidArtifactKey rejects identity components that are empty, oversized,
// or contain path or control characters.
var ErrInvalidArtifactKey = errors.New("invalid artifact key")

// ArtifactService stores versioned ADK artifacts in the SQLite artifacts
// table. Every query is scoped by app, user, and session.
type ArtifactService struct {
	db  StatementRunner
	now func() time.Time
}

var _ artifact.Service = (*ArtifactService)(nil)

// NewArtifactService constructs the SQLite-backed ADK artifact service.
func NewArtifactService(db StatementRunner) artifact.Service {
	return &ArtifactService{db: db, now: time.Now}
}

type artifactRow struct {
	Version   int64  `json:"version"`
	PartJSON  string `json:"part_json"`
	MimeType  string `json:"mime_type"`
	SHA256    string `json:"sha256"`
	CreatedAt int64  `json:"created_at"`
}

func (s *ArtifactService) Save(ctx context.Context, req *artifact.SaveRequest) (*artifact.SaveResponse, error) {
	if req == nil {
		return nil, errors.New("save request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	if err := validArtifactScope(req.AppName, req.UserID, req.SessionID, req.FileName); err != nil {
		return nil, err
	}
	if req.Version < 0 {
		return nil, errors.New("artifact version cannot be negative")
	}
	data, err := json.Marshal(req.Part)
	if err != nil {
		return nil, errors.New("encode artifact")
	}
	if len(data) > maxArtifactBytes {
		return nil, errors.New("artifact exceeds size limit")
	}
	mimeType := "text/plain; charset=utf-8"
	if req.Part.InlineData != nil && req.Part.InlineData.MIMEType != "" {
		mimeType = req.Part.InlineData.MIMEType
	}
	digest := sha256.Sum256(data)
	scope := []any{req.AppName, req.UserID, req.SessionID, req.FileName}
	// The version is allocated inside the same transaction as the insert, and
	// an explicit version never overwrites an existing one.
	version := any(req.Version)
	if req.Version == 0 {
		version = nil
	}
	results, err := s.db.Run(ctx, Statement{
		SQL: `INSERT INTO artifacts (app_name, user_id, session_id, file_name, version, part_json, mime_type, sha256, created_at)
			SELECT ?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(version), 0) + 1 FROM artifacts
				WHERE app_name = ? AND user_id = ? AND session_id = ? AND file_name = ?)), ?, ?, ?, ?
			WHERE true
			ON CONFLICT DO NOTHING
			RETURNING version`,
		Params: append(append(append(append([]any{}, scope...), version), scope...),
			string(data), mimeType, hex.EncodeToString(digest[:]), s.now().UTC().UnixMilli()),
	})
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Version int64 `json:"version"`
	}
	if err := decodeRows(results, 0, &rows); err != nil {
		return nil, err
	}
	if len(rows) != 1 {
		return nil, errors.New("artifact version already exists")
	}
	return &artifact.SaveResponse{Version: rows[0].Version}, nil
}

func (s *ArtifactService) Load(ctx context.Context, req *artifact.LoadRequest) (*artifact.LoadResponse, error) {
	if req == nil {
		return nil, errors.New("load request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	_, part, err := s.load(ctx, req.AppName, req.UserID, req.SessionID, req.FileName, req.Version)
	if err != nil {
		return nil, err
	}
	return &artifact.LoadResponse{Part: part}, nil
}

func (s *ArtifactService) Delete(ctx context.Context, req *artifact.DeleteRequest) error {
	if req == nil {
		return errors.New("delete request is required")
	}
	if err := req.Validate(); err != nil {
		return err
	}
	if err := validArtifactScope(req.AppName, req.UserID, req.SessionID, req.FileName); err != nil {
		return err
	}
	statement := Statement{
		SQL:    `DELETE FROM artifacts WHERE app_name = ? AND user_id = ? AND session_id = ? AND file_name = ?`,
		Params: []any{req.AppName, req.UserID, req.SessionID, req.FileName},
	}
	if req.Version != 0 {
		statement.SQL += ` AND version = ?`
		statement.Params = append(statement.Params, req.Version)
	}
	_, err := s.db.Run(ctx, statement)
	return err
}

func (s *ArtifactService) List(ctx context.Context, req *artifact.ListRequest) (*artifact.ListResponse, error) {
	if req == nil {
		return nil, errors.New("list request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	if err := validArtifactScope(req.AppName, req.UserID, req.SessionID, "list"); err != nil {
		return nil, err
	}
	results, err := s.db.Run(ctx, Statement{
		SQL: `SELECT DISTINCT file_name FROM artifacts WHERE app_name = ? AND user_id = ? AND session_id = ?
			ORDER BY file_name`,
		Params: []any{req.AppName, req.UserID, req.SessionID},
	})
	if err != nil {
		return nil, err
	}
	var rows []struct {
		FileName string `json:"file_name"`
	}
	if err := decodeRows(results, 0, &rows); err != nil {
		return nil, err
	}
	response := &artifact.ListResponse{}
	for _, row := range rows {
		response.FileNames = append(response.FileNames, row.FileName)
	}
	return response, nil
}

func (s *ArtifactService) Versions(ctx context.Context, req *artifact.VersionsRequest) (*artifact.VersionsResponse, error) {
	if req == nil {
		return nil, errors.New("versions request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	if err := validArtifactScope(req.AppName, req.UserID, req.SessionID, req.FileName); err != nil {
		return nil, err
	}
	results, err := s.db.Run(ctx, Statement{
		SQL: `SELECT version FROM artifacts WHERE app_name = ? AND user_id = ? AND session_id = ? AND file_name = ?
			ORDER BY version`,
		Params: []any{req.AppName, req.UserID, req.SessionID, req.FileName},
	})
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Version int64 `json:"version"`
	}
	if err := decodeRows(results, 0, &rows); err != nil {
		return nil, err
	}
	response := &artifact.VersionsResponse{}
	for _, row := range rows {
		response.Versions = append(response.Versions, row.Version)
	}
	return response, nil
}

func (s *ArtifactService) GetArtifactVersion(ctx context.Context, req *artifact.GetArtifactVersionRequest) (*artifact.GetArtifactVersionResponse, error) {
	if req == nil {
		return nil, errors.New("artifact version request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	row, _, err := s.load(ctx, req.AppName, req.UserID, req.SessionID, req.FileName, req.Version)
	if err != nil {
		return nil, err
	}
	return &artifact.GetArtifactVersionResponse{ArtifactVersion: &artifact.ArtifactVersion{
		Version:        row.Version,
		CustomMetadata: map[string]any{"sha256": row.SHA256},
		CreateTime:     time.UnixMilli(row.CreatedAt).UTC(),
		MimeType:       row.MimeType,
	}}, nil
}

// load reads one version (the latest when version is 0) and verifies the
// stored digest before decoding it.
func (s *ArtifactService) load(ctx context.Context, app, user, session, fileName string, version int64) (artifactRow, *genai.Part, error) {
	if err := validArtifactScope(app, user, session, fileName); err != nil {
		return artifactRow{}, nil, err
	}
	statement := Statement{
		SQL: `SELECT version, part_json, mime_type, sha256, created_at FROM artifacts
			WHERE app_name = ? AND user_id = ? AND session_id = ? AND file_name = ?`,
		Params: []any{app, user, session, fileName},
	}
	if version != 0 {
		statement.SQL += ` AND version = ?`
		statement.Params = append(statement.Params, version)
	}
	statement.SQL += ` ORDER BY version DESC LIMIT 1`
	results, err := s.db.Run(ctx, statement)
	if err != nil {
		return artifactRow{}, nil, err
	}
	var rows []artifactRow
	if err := decodeRows(results, 0, &rows); err != nil {
		return artifactRow{}, nil, err
	}
	if len(rows) == 0 {
		return artifactRow{}, nil, errors.New("artifact not found")
	}
	row := rows[0]
	digest := sha256.Sum256([]byte(row.PartJSON))
	if !strings.EqualFold(row.SHA256, hex.EncodeToString(digest[:])) {
		return artifactRow{}, nil, errors.New("artifact integrity check failed")
	}
	var part genai.Part
	if err := json.Unmarshal([]byte(row.PartJSON), &part); err != nil {
		return artifactRow{}, nil, errors.New("decode artifact")
	}
	return row, &part, nil
}

func validArtifactScope(components ...string) error {
	for _, value := range components {
		if value == "" || len(value) > 512 || strings.ContainsAny(value, "/\\") || strings.Contains(value, "..") {
			return ErrInvalidArtifactKey
		}
		for _, char := range value {
			if unicode.IsControl(char) {
				return ErrInvalidArtifactKey
			}
		}
	}
	return nil
}

func decodeRows(results []Result, index int, target any) error {
	if len(results) <= index {
		return errors.New("missing query result")
	}
	encoded, err := json.Marshal(results[index].Rows)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(encoded, target); err != nil {
		return errors.New("decode rows")
	}
	return nil
}

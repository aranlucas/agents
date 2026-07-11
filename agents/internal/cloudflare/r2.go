package cloudflare

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode"

	"agents/internal/config"
	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	"google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

const (
	maxArtifactBytes   = 20 << 20
	maxListPages       = 10
	maxVersionAttempts = 16
	artifactSuffix     = ".artifact"
)

// ErrInvalidArtifactKey rejects keys that could escape an identity scope.
var ErrInvalidArtifactKey = errors.New("invalid artifact key")

var errArtifactVersionConflict = errors.New("artifact version already exists")

type s3Client interface {
	PutObject(context.Context, *s3.PutObjectInput, ...func(*s3.Options)) (*s3.PutObjectOutput, error)
	GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error)
	DeleteObject(context.Context, *s3.DeleteObjectInput, ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
	ListObjectsV2(context.Context, *s3.ListObjectsV2Input, ...func(*s3.Options)) (*s3.ListObjectsV2Output, error)
}

// R2 provides scoped, bounded object operations over Cloudflare R2.
type R2 struct {
	client s3Client
	bucket string
}

// NewR2 creates an R2 client using static, process-scoped credentials.
func NewR2(cfg config.Cloudflare) (*R2, error) {
	for name, value := range map[string]string{
		"CF_ACCOUNT_ID": cfg.AccountID, "CF_R2_BUCKET_NAME": cfg.R2Bucket,
		"CF_R2_ACCESS_KEY_ID": cfg.R2AccessKeyID, "CF_R2_SECRET_ACCESS_KEY": cfg.R2SecretAccessKey,
	} {
		if strings.TrimSpace(value) == "" {
			return nil, fmt.Errorf("%s is required", name)
		}
	}
	endpoint := "https://" + cfg.AccountID + ".r2.cloudflarestorage.com"
	loaded, err := awsconfig.LoadDefaultConfig(
		context.Background(),
		awsconfig.WithRegion("auto"),
		awsconfig.WithBaseEndpoint(endpoint),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.R2AccessKeyID, cfg.R2SecretAccessKey, "")),
	)
	if err != nil {
		return nil, errors.New("configure R2 client")
	}
	client := s3.NewFromConfig(loaded, func(options *s3.Options) { options.UsePathStyle = true })
	return &R2{client: client, bucket: cfg.R2Bucket}, nil
}

func newR2(client s3Client, bucket string) *R2 { return &R2{client: client, bucket: bucket} }

// ObjectKey constructs a key whose first three components are the complete
// authorization scope. No caller can inject another path component.
func (r *R2) ObjectKey(app, user, thread, name string) (string, error) {
	for _, component := range []string{app, user, thread, name} {
		if !validObjectComponent(component) {
			return "", ErrInvalidArtifactKey
		}
	}
	return path.Join(app, user, thread, name), nil
}

// Put writes a bounded private object with a SHA-256 integrity marker.
func (r *R2) Put(ctx context.Context, app, user, thread, name string, data []byte, contentType string) error {
	key, err := r.ObjectKey(app, user, thread, name)
	if err != nil {
		return err
	}
	return r.putKey(ctx, key, data, contentType, false)
}

func (r *R2) putKey(ctx context.Context, key string, data []byte, contentType string, createOnly bool) error {
	if len(data) > maxArtifactBytes {
		return errors.New("artifact exceeds size limit")
	}
	digest := sha256.Sum256(data)
	input := &s3.PutObjectInput{
		Bucket: aws.String(r.bucket), Key: aws.String(key), Body: bytes.NewReader(data),
		ContentLength: aws.Int64(int64(len(data))), ContentType: aws.String(contentType),
		Metadata: map[string]string{"sha256": hex.EncodeToString(digest[:])},
	}
	if createOnly {
		input.IfNoneMatch = aws.String("*")
	}
	if _, err := r.client.PutObject(ctx, input); err != nil {
		var apiError smithy.APIError
		if errors.As(err, &apiError) && (apiError.ErrorCode() == "PreconditionFailed" || apiError.ErrorCode() == "ConditionalRequestConflict") {
			return errArtifactVersionConflict
		}
		return errors.New("write R2 artifact")
	}
	return nil
}

// Get reads and integrity-checks a bounded private object.
func (r *R2) Get(ctx context.Context, app, user, thread, name string) ([]byte, map[string]string, error) {
	key, err := r.ObjectKey(app, user, thread, name)
	if err != nil {
		return nil, nil, err
	}
	return r.getKey(ctx, key)
}

func (r *R2) getKey(ctx context.Context, key string) ([]byte, map[string]string, error) {
	output, err := r.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(r.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, nil, errors.New("read R2 artifact")
	}
	defer func() { _ = output.Body.Close() }()
	if output.ContentLength != nil && *output.ContentLength > maxArtifactBytes {
		return nil, nil, errors.New("artifact exceeds size limit")
	}
	data, err := io.ReadAll(io.LimitReader(output.Body, maxArtifactBytes+1))
	if err != nil {
		return nil, nil, errors.New("read R2 artifact body")
	}
	if len(data) > maxArtifactBytes {
		return nil, nil, errors.New("artifact exceeds size limit")
	}
	expected := output.Metadata["sha256"]
	if expected == "" {
		return nil, nil, errors.New("artifact integrity metadata missing")
	}
	digest := sha256.Sum256(data)
	if !strings.EqualFold(expected, hex.EncodeToString(digest[:])) {
		return nil, nil, errors.New("artifact integrity check failed")
	}
	return data, output.Metadata, nil
}

// Health verifies R2 accepts a bounded, harmless list request. It never
// reads or writes object data, so it is safe to call on every gateway
// health check without touching tenant artifacts.
func (r *R2) Health(ctx context.Context) error {
	_, err := r.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: aws.String(r.bucket), MaxKeys: aws.Int32(1)})
	if err != nil {
		return errors.New("R2 health check failed")
	}
	return nil
}

// Delete removes one private object. Missing objects are not errors.
func (r *R2) Delete(ctx context.Context, app, user, thread, name string) error {
	key, err := r.ObjectKey(app, user, thread, name)
	if err != nil {
		return err
	}
	_, err = r.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(r.bucket), Key: aws.String(key)})
	if err != nil {
		return errors.New("delete R2 artifact")
	}
	return nil
}

func (r *R2) listKeys(ctx context.Context, prefix string) ([]types.Object, error) {
	var objects []types.Object
	var continuation *string
	for range maxListPages {
		output, err := r.client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
			Bucket: aws.String(r.bucket), Prefix: aws.String(prefix), ContinuationToken: continuation, MaxKeys: aws.Int32(1000),
		})
		if err != nil {
			return nil, errors.New("list R2 artifacts")
		}
		objects = append(objects, output.Contents...)
		if !aws.ToBool(output.IsTruncated) {
			return objects, nil
		}
		if output.NextContinuationToken == nil || *output.NextContinuationToken == "" {
			return nil, errors.New("invalid R2 pagination response")
		}
		continuation = output.NextContinuationToken
	}
	return nil, errors.New("R2 artifact listing exceeds page limit")
}

func validObjectComponent(value string) bool {
	if value == "" || value == "." || value == ".." || len(value) > 512 || strings.ContainsAny(value, "/\\") || strings.Contains(value, "..") {
		return false
	}
	for _, char := range value {
		if unicode.IsControl(char) {
			return false
		}
	}
	return true
}

// ArtifactService adapts scoped R2 objects to the ADK artifact contract.
type ArtifactService struct{ r2 *R2 }

var _ artifact.Service = (*ArtifactService)(nil)

func NewArtifactService(r2 *R2) artifact.Service { return &ArtifactService{r2: r2} }

type artifactEnvelope struct {
	Part       *genai.Part `json:"part"`
	Version    int64       `json:"version"`
	CreateTime float64     `json:"create_time"`
	MimeType   string      `json:"mime_type"`
}

func (s *ArtifactService) Save(ctx context.Context, req *artifact.SaveRequest) (*artifact.SaveResponse, error) {
	if req == nil {
		return nil, errors.New("save request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	if s == nil || s.r2 == nil {
		return nil, errors.New("R2 artifact service is required")
	}
	if req.Version < 0 {
		return nil, errors.New("artifact version cannot be negative")
	}
	mimeType := "text/plain; charset=utf-8"
	if req.Part.InlineData != nil && req.Part.InlineData.MIMEType != "" {
		mimeType = req.Part.InlineData.MIMEType
	}
	for attempt := 0; attempt < maxVersionAttempts; attempt++ {
		version := req.Version
		if version == 0 {
			versions, err := s.versions(ctx, req.AppName, req.UserID, req.SessionID, req.FileName)
			if err != nil {
				return nil, err
			}
			version = 1
			if len(versions) > 0 {
				version = versions[len(versions)-1] + 1
			}
		}
		envelope := artifactEnvelope{Part: req.Part, Version: version, CreateTime: float64(time.Now().UTC().UnixMilli()) / 1000, MimeType: mimeType}
		data, err := json.Marshal(envelope)
		if err != nil {
			return nil, errors.New("encode artifact")
		}
		key, err := artifactObjectName(req.FileName, version)
		if err != nil {
			return nil, err
		}
		fullKey, _ := s.r2.ObjectKey(req.AppName, req.UserID, req.SessionID, key)
		err = s.r2.putKey(ctx, fullKey, data, "application/json", true)
		if err == nil {
			return &artifact.SaveResponse{Version: version}, nil
		}
		if !errors.Is(err, errArtifactVersionConflict) || req.Version != 0 {
			return nil, err
		}
	}
	return nil, errors.New("artifact version allocation conflicted repeatedly")
}

func (s *ArtifactService) Load(ctx context.Context, req *artifact.LoadRequest) (*artifact.LoadResponse, error) {
	if req == nil {
		return nil, errors.New("load request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	envelope, _, err := s.load(ctx, req.AppName, req.UserID, req.SessionID, req.FileName, req.Version)
	if err != nil {
		return nil, err
	}
	return &artifact.LoadResponse{Part: envelope.Part}, nil
}

func (s *ArtifactService) Delete(ctx context.Context, req *artifact.DeleteRequest) error {
	if req == nil {
		return errors.New("delete request is required")
	}
	if err := req.Validate(); err != nil {
		return err
	}
	versions := []int64{req.Version}
	if req.Version == 0 {
		var err error
		versions, err = s.versions(ctx, req.AppName, req.UserID, req.SessionID, req.FileName)
		if err != nil {
			return err
		}
	}
	for _, version := range versions {
		name, _ := artifactObjectName(req.FileName, version)
		if err := s.r2.Delete(ctx, req.AppName, req.UserID, req.SessionID, name); err != nil {
			return err
		}
	}
	return nil
}

func (s *ArtifactService) List(ctx context.Context, req *artifact.ListRequest) (*artifact.ListResponse, error) {
	if req == nil {
		return nil, errors.New("list request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	prefix, err := s.r2.ObjectKey(req.AppName, req.UserID, req.SessionID, "objects")
	if err != nil {
		return nil, err
	}
	prefix = strings.TrimSuffix(prefix, "objects")
	objects, err := s.r2.listKeys(ctx, prefix)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, object := range objects {
		fileName, _, ok := parseArtifactObjectName(path.Base(aws.ToString(object.Key)))
		if ok {
			seen[fileName] = true
		}
	}
	response := &artifact.ListResponse{}
	for fileName := range seen {
		response.FileNames = append(response.FileNames, fileName)
	}
	slices.Sort(response.FileNames)
	return response, nil
}

func (s *ArtifactService) Versions(ctx context.Context, req *artifact.VersionsRequest) (*artifact.VersionsResponse, error) {
	if req == nil {
		return nil, errors.New("versions request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	versions, err := s.versions(ctx, req.AppName, req.UserID, req.SessionID, req.FileName)
	if err != nil {
		return nil, err
	}
	return &artifact.VersionsResponse{Versions: versions}, nil
}

func (s *ArtifactService) GetArtifactVersion(ctx context.Context, req *artifact.GetArtifactVersionRequest) (*artifact.GetArtifactVersionResponse, error) {
	if req == nil {
		return nil, errors.New("artifact version request is required")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	envelope, metadata, err := s.load(ctx, req.AppName, req.UserID, req.SessionID, req.FileName, req.Version)
	if err != nil {
		return nil, err
	}
	name, _ := artifactObjectName(req.FileName, envelope.Version)
	key, _ := s.r2.ObjectKey(req.AppName, req.UserID, req.SessionID, name)
	return &artifact.GetArtifactVersionResponse{ArtifactVersion: &artifact.ArtifactVersion{
		Version: envelope.Version, CanonicalURI: "r2://" + s.r2.bucket + "/" + key,
		CustomMetadata: map[string]any{"sha256": metadata["sha256"]}, CreateTime: secondsToTime(envelope.CreateTime), MimeType: envelope.MimeType,
	}}, nil
}

// secondsToTime converts the artifact envelope's Unix-seconds-with-fraction
// timestamp back into a time.Time for the ADK v2 artifact.ArtifactVersion API.
func secondsToTime(seconds float64) time.Time {
	return time.UnixMilli(int64(seconds*1000 + 0.5)).UTC()
}

func (s *ArtifactService) load(ctx context.Context, app, user, thread, fileName string, version int64) (artifactEnvelope, map[string]string, error) {
	if version == 0 {
		versions, err := s.versions(ctx, app, user, thread, fileName)
		if err != nil {
			return artifactEnvelope{}, nil, err
		}
		if len(versions) == 0 {
			return artifactEnvelope{}, nil, errors.New("artifact not found")
		}
		version = versions[len(versions)-1]
	}
	name, err := artifactObjectName(fileName, version)
	if err != nil {
		return artifactEnvelope{}, nil, err
	}
	data, metadata, err := s.r2.Get(ctx, app, user, thread, name)
	if err != nil {
		return artifactEnvelope{}, nil, err
	}
	var envelope artifactEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return artifactEnvelope{}, nil, errors.New("decode artifact")
	}
	if envelope.Version != version || envelope.Part == nil {
		return artifactEnvelope{}, nil, errors.New("invalid artifact envelope")
	}
	return envelope, metadata, nil
}

func (s *ArtifactService) versions(ctx context.Context, app, user, thread, fileName string) ([]int64, error) {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(fileName)) + ".v"
	prefix, err := s.r2.ObjectKey(app, user, thread, encoded)
	if err != nil {
		return nil, err
	}
	objects, err := s.r2.listKeys(ctx, prefix)
	if err != nil {
		return nil, err
	}
	var versions []int64
	for _, object := range objects {
		parsedFile, version, ok := parseArtifactObjectName(path.Base(aws.ToString(object.Key)))
		if ok && parsedFile == fileName {
			versions = append(versions, version)
		}
	}
	slices.Sort(versions)
	return slices.Compact(versions), nil
}

func artifactObjectName(fileName string, version int64) (string, error) {
	if !validObjectComponent(fileName) || version <= 0 {
		return "", ErrInvalidArtifactKey
	}
	return base64.RawURLEncoding.EncodeToString([]byte(fileName)) + ".v" + fmt.Sprintf("%020d", version) + artifactSuffix, nil
}

func parseArtifactObjectName(name string) (string, int64, bool) {
	if !strings.HasSuffix(name, artifactSuffix) {
		return "", 0, false
	}
	name = strings.TrimSuffix(name, artifactSuffix)
	separator := strings.LastIndex(name, ".v")
	if separator <= 0 {
		return "", 0, false
	}
	decoded, err := base64.RawURLEncoding.DecodeString(name[:separator])
	if err != nil {
		return "", 0, false
	}
	version, err := strconv.ParseInt(name[separator+2:], 10, 64)
	if err != nil || version <= 0 {
		return "", 0, false
	}
	return string(decoded), version, true
}

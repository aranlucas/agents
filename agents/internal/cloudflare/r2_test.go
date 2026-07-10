package cloudflare

import (
	"bytes"
	"context"
	"io"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"
	"google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

func TestR2ObjectKeyCannotCrossIdentityBoundary(t *testing.T) {
	r2 := newR2(newMemoryS3(), "bucket")
	key, err := r2.ObjectKey("travel", "user-a", "thread-a", "plan.md")
	if err != nil || key != "travel/user-a/thread-a/plan.md" {
		t.Fatalf("key = %q, %v", key, err)
	}
	invalid := [][]string{
		{"travel", "user-a", "thread-a", "../user-b/secret"},
		{"travel/other", "user-a", "thread-a", "plan.md"},
		{"travel", "user-a/other", "thread-a", "plan.md"},
		{"travel", "user-a", "thread-a/other", "plan.md"},
		{"travel", "user-a", "thread-a", ".."},
	}
	for _, input := range invalid {
		if _, err := r2.ObjectKey(input[0], input[1], input[2], input[3]); err == nil {
			t.Fatalf("ObjectKey(%q) accepted", input)
		}
	}
}

func TestArtifactServiceSavesLoadsAndVersionsPart(t *testing.T) {
	store := newMemoryS3()
	service := NewArtifactService(newR2(store, "bucket"))
	first, err := service.Save(context.Background(), &artifact.SaveRequest{
		AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md", Part: &genai.Part{Text: "day one"},
	})
	if err != nil || first.Version != 1 {
		t.Fatalf("first Save() = %#v, %v", first, err)
	}
	second, err := service.Save(context.Background(), &artifact.SaveRequest{
		AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md", Part: &genai.Part{Text: "day two"},
	})
	if err != nil || second.Version != 2 {
		t.Fatalf("second Save() = %#v, %v", second, err)
	}
	loaded, err := service.Load(context.Background(), &artifact.LoadRequest{
		AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md",
	})
	if err != nil || loaded.Part.Text != "day two" {
		t.Fatalf("Load() = %#v, %v", loaded, err)
	}
	versions, err := service.Versions(context.Background(), &artifact.VersionsRequest{
		AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md",
	})
	if err != nil || len(versions.Versions) != 2 || versions.Versions[0] != 1 || versions.Versions[1] != 2 {
		t.Fatalf("Versions() = %#v, %v", versions, err)
	}
	listed, err := service.List(context.Background(), &artifact.ListRequest{AppName: "travel", UserID: "user-a", SessionID: "thread-a"})
	if err != nil || len(listed.FileNames) != 1 || listed.FileNames[0] != "plan.md" {
		t.Fatalf("List() = %#v, %v", listed, err)
	}
	metadata, err := service.GetArtifactVersion(context.Background(), &artifact.GetArtifactVersionRequest{
		AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md", Version: 1,
	})
	if err != nil || metadata.ArtifactVersion.Version != 1 || !strings.HasPrefix(metadata.ArtifactVersion.CanonicalURI, "r2://bucket/travel/user-a/thread-a/") {
		t.Fatalf("GetArtifactVersion() = %#v, %v", metadata, err)
	}
}

func TestArtifactServiceCannotReadAnotherScope(t *testing.T) {
	service := NewArtifactService(newR2(newMemoryS3(), "bucket"))
	_, err := service.Save(context.Background(), &artifact.SaveRequest{
		AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md", Part: &genai.Part{Text: "private"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, request := range []*artifact.LoadRequest{
		{AppName: "travel", UserID: "user-b", SessionID: "thread-a", FileName: "plan.md"},
		{AppName: "travel", UserID: "user-a", SessionID: "thread-b", FileName: "plan.md"},
		{AppName: "grocery", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md"},
	} {
		if _, err := service.Load(context.Background(), request); err == nil {
			t.Fatalf("cross-scope Load(%#v) succeeded", request)
		}
	}
}

func TestArtifactServiceConcurrentSavesAllocateDistinctVersions(t *testing.T) {
	service := NewArtifactService(newR2(newMemoryS3(), "bucket"))
	const workers = 8
	versions := make(chan int64, workers)
	errors := make(chan error, workers)
	var wait sync.WaitGroup
	for index := range workers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			response, err := service.Save(context.Background(), &artifact.SaveRequest{
				AppName: "travel", UserID: "user-a", SessionID: "thread-a", FileName: "plan.md", Part: &genai.Part{Text: string(rune('a' + index))},
			})
			if err != nil {
				errors <- err
				return
			}
			versions <- response.Version
		}()
	}
	wait.Wait()
	close(errors)
	close(versions)
	for err := range errors {
		t.Fatal(err)
	}
	seen := map[int64]bool{}
	for version := range versions {
		seen[version] = true
	}
	if len(seen) != workers {
		t.Fatalf("distinct versions = %v", seen)
	}
}

func TestR2HealthUsesBoundedListRequest(t *testing.T) {
	store := newMemoryS3()
	r2 := newR2(store, "bucket")
	if err := r2.Health(context.Background()); err != nil {
		t.Fatalf("Health() error = %v", err)
	}
	failing := newR2(failingS3{}, "bucket")
	if err := failing.Health(context.Background()); err == nil {
		t.Fatal("Health() with a failing client succeeded")
	}
}

// failingS3 implements s3Client with every call failing; only ListObjectsV2
// is exercised by Health, the rest are unused stubs to satisfy the interface.
type failingS3 struct{}

func (failingS3) PutObject(context.Context, *s3.PutObjectInput, ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	return nil, &fakeAPIError{code: "InternalError"}
}
func (failingS3) GetObject(context.Context, *s3.GetObjectInput, ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	return nil, &fakeAPIError{code: "InternalError"}
}
func (failingS3) DeleteObject(context.Context, *s3.DeleteObjectInput, ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	return nil, &fakeAPIError{code: "InternalError"}
}
func (failingS3) ListObjectsV2(context.Context, *s3.ListObjectsV2Input, ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	return nil, &fakeAPIError{code: "InternalError"}
}

func TestR2DetectsTamperedObjectAndBoundsWrites(t *testing.T) {
	store := newMemoryS3()
	r2 := newR2(store, "bucket")
	if err := r2.Put(context.Background(), "app", "user", "thread", "data", []byte("original"), "text/plain"); err != nil {
		t.Fatal(err)
	}
	store.mu.Lock()
	store.objects["app/user/thread/data"].data = []byte("tampered")
	store.mu.Unlock()
	if _, _, err := r2.Get(context.Background(), "app", "user", "thread", "data"); err == nil || !strings.Contains(err.Error(), "integrity") {
		t.Fatalf("Get() error = %v", err)
	}
	if err := r2.Put(context.Background(), "app", "user", "thread", "large", make([]byte, maxArtifactBytes+1), "application/octet-stream"); err == nil {
		t.Fatal("oversized Put succeeded")
	}
}

type memoryObject struct {
	data, contentType []byte
	metadata          map[string]string
	created           time.Time
}

type memoryS3 struct {
	mu      sync.Mutex
	objects map[string]*memoryObject
}

func newMemoryS3() *memoryS3 { return &memoryS3{objects: map[string]*memoryObject{}} }

func (m *memoryS3) PutObject(_ context.Context, input *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := aws.ToString(input.Key)
	if aws.ToString(input.IfNoneMatch) == "*" {
		if _, exists := m.objects[key]; exists {
			return nil, &fakeAPIError{code: "PreconditionFailed"}
		}
	}
	data, err := io.ReadAll(input.Body)
	if err != nil {
		return nil, err
	}
	m.objects[key] = &memoryObject{data: data, contentType: []byte(aws.ToString(input.ContentType)), metadata: cloneMetadata(input.Metadata), created: time.Now()}
	return &s3.PutObjectOutput{}, nil
}

func (m *memoryS3) GetObject(_ context.Context, input *s3.GetObjectInput, _ ...func(*s3.Options)) (*s3.GetObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	object, exists := m.objects[aws.ToString(input.Key)]
	if !exists {
		return nil, &fakeAPIError{code: "NoSuchKey"}
	}
	data := append([]byte(nil), object.data...)
	return &s3.GetObjectOutput{Body: io.NopCloser(bytes.NewReader(data)), ContentLength: aws.Int64(int64(len(data))), ContentType: aws.String(string(object.contentType)), Metadata: cloneMetadata(object.metadata), LastModified: aws.Time(object.created)}, nil
}

func (m *memoryS3) DeleteObject(_ context.Context, input *s3.DeleteObjectInput, _ ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.objects, aws.ToString(input.Key))
	return &s3.DeleteObjectOutput{}, nil
}

func (m *memoryS3) ListObjectsV2(_ context.Context, input *s3.ListObjectsV2Input, _ ...func(*s3.Options)) (*s3.ListObjectsV2Output, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var keys []string
	for key := range m.objects {
		if strings.HasPrefix(key, aws.ToString(input.Prefix)) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	output := &s3.ListObjectsV2Output{}
	for _, key := range keys {
		object := m.objects[key]
		output.Contents = append(output.Contents, types.Object{Key: aws.String(key), Size: aws.Int64(int64(len(object.data))), LastModified: aws.Time(object.created)})
	}
	return output, nil
}

func cloneMetadata(input map[string]string) map[string]string {
	output := map[string]string{}
	for key, value := range input {
		output[key] = value
	}
	return output
}

type fakeAPIError struct{ code string }

func (e *fakeAPIError) Error() string                 { return e.code }
func (e *fakeAPIError) ErrorCode() string             { return e.code }
func (e *fakeAPIError) ErrorMessage() string          { return e.code }
func (e *fakeAPIError) ErrorFault() smithy.ErrorFault { return smithy.FaultClient }

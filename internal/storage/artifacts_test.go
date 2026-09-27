package storage

import (
	"errors"
	"testing"

	"google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

func TestArtifactServiceVersionsAndScopes(t *testing.T) {
	db := newTestDB(t)
	service := NewArtifactService(db)
	ctx := t.Context()
	save := func(text string, version int64) (int64, error) {
		response, err := service.Save(ctx, &artifact.SaveRequest{
			AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json",
			Part: genai.NewPartFromText(text), Version: version,
		})
		if err != nil {
			return 0, err
		}
		return response.Version, nil
	}
	for want, text := range []string{"", "first", "second"} {
		if want == 0 {
			continue
		}
		got, err := save(text, 0)
		if err != nil || got != int64(want) {
			t.Fatalf("save %q = %d, %v; want %d", text, got, err, want)
		}
	}
	if _, err := save("clobber", 1); err == nil {
		t.Fatal("explicit existing version was overwritten")
	}

	latest, err := service.Load(ctx, &artifact.LoadRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json"})
	if err != nil || latest.Part.Text != "second" {
		t.Fatalf("latest = %+v, %v", latest, err)
	}
	first, err := service.Load(ctx, &artifact.LoadRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json", Version: 1})
	if err != nil || first.Part.Text != "first" {
		t.Fatalf("version 1 = %+v, %v", first, err)
	}
	if _, err := service.Load(ctx, &artifact.LoadRequest{AppName: "grocery_agent", UserID: "user-2", SessionID: "thread-1", FileName: "list.json"}); err == nil {
		t.Fatal("another user's artifact was readable")
	}

	versions, err := service.Versions(ctx, &artifact.VersionsRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json"})
	if err != nil || len(versions.Versions) != 2 || versions.Versions[1] != 2 {
		t.Fatalf("versions = %+v, %v", versions, err)
	}
	listed, err := service.List(ctx, &artifact.ListRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1"})
	if err != nil || len(listed.FileNames) != 1 || listed.FileNames[0] != "list.json" {
		t.Fatalf("list = %+v, %v", listed, err)
	}
	metadata, err := service.GetArtifactVersion(ctx, &artifact.GetArtifactVersionRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json", Version: 1})
	if err != nil || metadata.ArtifactVersion.Version != 1 || metadata.ArtifactVersion.CustomMetadata["sha256"] == "" {
		t.Fatalf("metadata = %+v, %v", metadata, err)
	}

	if err := service.Delete(ctx, &artifact.DeleteRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json", Version: 2}); err != nil {
		t.Fatal(err)
	}
	latest, err = service.Load(ctx, &artifact.LoadRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json"})
	if err != nil || latest.Part.Text != "first" {
		t.Fatalf("latest after delete = %+v, %v", latest, err)
	}
	if err := service.Delete(ctx, &artifact.DeleteRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json"}); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Load(ctx, &artifact.LoadRequest{AppName: "grocery_agent", UserID: "user-1", SessionID: "thread-1", FileName: "list.json"}); err == nil {
		t.Fatal("deleted artifact was readable")
	}
}

func TestArtifactServiceRejectsPathLikeScopesAndTampering(t *testing.T) {
	db := newTestDB(t)
	service := NewArtifactService(db)
	_, err := service.Save(t.Context(), &artifact.SaveRequest{AppName: "app", UserID: "../user", SessionID: "s", FileName: "f", Part: genai.NewPartFromText("x")})
	if !errors.Is(err, ErrInvalidArtifactKey) {
		t.Fatalf("path-like user error = %v", err)
	}
	if _, err := service.Save(t.Context(), &artifact.SaveRequest{AppName: "app", UserID: "u", SessionID: "s", FileName: "f", Part: genai.NewPartFromText("x")}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.SQL().Exec(`UPDATE artifacts SET part_json = '{"text":"forged"}'`); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Load(t.Context(), &artifact.LoadRequest{AppName: "app", UserID: "u", SessionID: "s", FileName: "f"}); err == nil {
		t.Fatal("tampered artifact loaded")
	}
}

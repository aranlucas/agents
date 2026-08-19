package groceries

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"agents/internal/cloudflare"
	d1migrations "agents/migrations/d1"
	"google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
	_ "modernc.org/sqlite"
)

func TestConcurrentShoppingProfilePublishCannotMakeStaleRevisionLatest(t *testing.T) {
	base := newExplicitArtifactService()
	blocking := newBlockingArtifactService(base, 1)
	runner := newShoppingSnapshotSQLiteRunner(t)
	storeA := newShoppingSnapshotTestStore(t, runner, blocking)
	storeB := newShoppingSnapshotTestStore(t, runner, blocking)

	setPreferredStoreRow(t, runner, "First")
	firstDone := make(chan error, 1)
	go func() {
		_, err := storeA.publishPendingShoppingProfileSnapshot(context.Background(), "user_1")
		firstDone <- err
	}()
	<-blocking.started

	setPreferredStoreRow(t, runner, "Second")
	var canonicalName string
	if err := runner.db.QueryRow(`SELECT name FROM preferred_stores WHERE user_id = 'user_1'`).Scan(&canonicalName); err != nil || canonicalName != "Second" {
		t.Fatalf("canonical preferred store = %q, err = %v", canonicalName, err)
	}
	if _, err := runner.db.Exec(`UPDATE shopping_profile_snapshot_jobs SET lease_token = NULL, lease_until = 0 WHERE user_id = 'user_1'`); err != nil {
		t.Fatal(err)
	}
	if _, err := storeB.publishPendingShoppingProfileSnapshot(t.Context(), "user_1"); err != nil {
		t.Fatal(err)
	}
	close(blocking.release)
	if err := <-firstDone; err != nil {
		t.Fatal(err)
	}

	loaded, err := base.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1", FileName: shoppingProfileArtifactName,
	})
	if err != nil || loaded == nil || loaded.Part == nil || loaded.Part.InlineData == nil {
		t.Fatalf("latest artifact = %#v, err = %v", loaded, err)
	}
	var profile ShoppingProfile
	if err := json.Unmarshal(loaded.Part.InlineData.Data, &profile); err != nil {
		t.Fatal(err)
	}
	if profile.PreferredStore == nil || profile.PreferredStore.Name != "Second" {
		name := "<nil>"
		if profile.PreferredStore != nil {
			name = profile.PreferredStore.Name
		}
		t.Fatalf("latest profile store = %q", name)
	}
	var profileRevision, artifactVersion int64
	if err := runner.db.QueryRow(
		`SELECT profile_revision, artifact_version FROM shopping_profile_artifacts WHERE user_id = 'user_1'`,
	).Scan(&profileRevision, &artifactVersion); err != nil {
		t.Fatal(err)
	}
	if profileRevision != 2 || artifactVersion != 2 {
		t.Fatalf("artifact reference = revision %d, version %d", profileRevision, artifactVersion)
	}
}

func TestDelayedDuplicateFinalizeCannotDeleteUnchangedReferencedArtifact(t *testing.T) {
	base := newExplicitArtifactService()
	counting := &countingArtifactService{Service: base}
	blocking := newBlockingArtifactService(counting, 1)
	runner := newShoppingSnapshotSQLiteRunner(t)
	delayedStore := newShoppingSnapshotTestStore(t, runner, blocking)
	currentStore := newShoppingSnapshotTestStore(t, runner, counting)
	setPreferredStoreRow(t, runner, "Kroger")

	delayedDone := make(chan struct {
		more bool
		err  error
	}, 1)
	go func() {
		more, err := delayedStore.publishPendingShoppingProfileSnapshot(context.Background(), "user_1")
		delayedDone <- struct {
			more bool
			err  error
		}{more: more, err: err}
	}()
	select {
	case <-blocking.started:
	case <-time.After(2 * time.Second):
		t.Fatal("delayed artifact save did not start")
	}

	if _, err := runner.db.Exec(
		`UPDATE shopping_profile_snapshot_jobs SET lease_token = NULL, lease_until = 0 WHERE user_id = 'user_1'`,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := currentStore.publishPendingShoppingProfileSnapshot(t.Context(), "user_1"); err != nil {
		t.Fatal(err)
	}
	if _, err := runner.db.Exec(`UPDATE shopping_profile_revisions SET revision = 2 WHERE user_id = 'user_1'`); err != nil {
		t.Fatal(err)
	}
	if _, err := currentStore.publishPendingShoppingProfileSnapshot(t.Context(), "user_1"); err != nil {
		t.Fatal(err)
	}
	var profileRevision, artifactVersion int64
	if err := runner.db.QueryRow(
		`SELECT profile_revision, artifact_version FROM shopping_profile_artifacts WHERE user_id = 'user_1'`,
	).Scan(&profileRevision, &artifactVersion); err != nil {
		t.Fatal(err)
	}
	if profileRevision != 2 || artifactVersion != 1 {
		t.Fatalf("unchanged reference = revision %d, version %d", profileRevision, artifactVersion)
	}

	close(blocking.release)
	delayed := <-delayedDone
	if delayed.err != nil || delayed.more {
		t.Fatalf("delayed finalize more = %v, err = %v", delayed.more, delayed.err)
	}
	var cleanupJobs int
	if err := runner.db.QueryRow(
		`SELECT COUNT(*) FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = 'user_1' AND artifact_version = 1`,
	).Scan(&cleanupJobs); err != nil {
		t.Fatal(err)
	}
	if cleanupJobs != 0 {
		t.Fatalf("currently referenced version queued for cleanup: %d jobs", cleanupJobs)
	}
	if more, err := currentStore.processShoppingProfileSnapshotWork(t.Context(), "user_1"); err != nil || more {
		t.Fatalf("remaining work more = %v, err = %v", more, err)
	}
	if _, err := base.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1",
		FileName: shoppingProfileArtifactName, Version: 1,
	}); err != nil {
		t.Fatalf("currently referenced version was deleted: %v", err)
	}
	if deleted := counting.deletedVersions(); len(deleted) != 0 {
		t.Fatalf("deleted versions = %#v", deleted)
	}
}

func TestShoppingProfileSnapshotIsDetachedFromMutationResponse(t *testing.T) {
	base := newExplicitArtifactService()
	blocking := newBlockingArtifactService(base, 1)
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, blocking)

	requestCtx, cancelRequest := context.WithCancel(context.Background())
	mutationDone := make(chan error, 1)
	go func() {
		_, err := store.SetPreferredStore(
			requestCtx,
			"user_1",
			PreferredStore{LocationID: "loc_1", Name: "Kroger"},
			time.Unix(1, 0),
		)
		mutationDone <- err
	}()
	if err := <-mutationDone; err != nil {
		t.Fatal(err)
	}
	<-blocking.started
	cancelRequest()
	close(blocking.release)
	waitForShoppingProfileSnapshots(t, store)

	loaded, err := base.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1", FileName: shoppingProfileArtifactName,
	})
	if err != nil || loaded == nil || loaded.Part == nil || loaded.Part.InlineData == nil {
		t.Fatalf("detached artifact = %#v, err = %v", loaded, err)
	}
}

func TestLinkKrogerAccountDeletesOldArtifactsAndSuppressesUnchangedRelink(t *testing.T) {
	base := newExplicitArtifactService()
	counting := &countingArtifactService{Service: base}
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, counting)
	oldUserID := "kroger:kroger_sub_1"

	for version := int64(1); version <= 3; version++ {
		if _, err := base.Save(t.Context(), &artifact.SaveRequest{
			AppName: groceryLibraryApp, UserID: oldUserID, SessionID: oldUserID,
			FileName: shoppingProfileArtifactName, Version: version, Part: profileArtifactPart(t, ShoppingProfile{}),
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := runner.db.Exec(
			`INSERT INTO shopping_profile_artifact_versions (user_id, artifact_version, created_at) VALUES (?, ?, ?)`,
			oldUserID, version, version,
		); err != nil {
			t.Fatal(err)
		}
	}

	if err := store.LinkKrogerAccount(t.Context(), "kroger_sub_1", "user_1", time.Unix(1, 0)); err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	for version := int64(1); version <= 3; version++ {
		if loaded, err := base.Load(t.Context(), &artifact.LoadRequest{
			AppName: groceryLibraryApp, UserID: oldUserID, SessionID: oldUserID,
			FileName: shoppingProfileArtifactName, Version: version,
		}); err == nil {
			t.Fatalf("old version %d still exists: %#v", version, loaded)
		}
	}
	newVersions, err := base.Versions(t.Context(), &artifact.VersionsRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1", FileName: shoppingProfileArtifactName,
	})
	if err != nil || len(newVersions.Versions) != 1 {
		t.Fatalf("new versions = %#v, err = %v", newVersions, err)
	}
	savesAfterFirstLink := counting.saveCount()

	if err := store.LinkKrogerAccount(t.Context(), "kroger_sub_1", "user_1", time.Unix(3_601, 0)); err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	if got := counting.saveCount(); got != savesAfterFirstLink {
		t.Fatalf("unchanged hourly relink added artifact: saves %d -> %d", savesAfterFirstLink, got)
	}
}

func TestSamePreferredStoreCreatesNoRevisionJobOrArtifact(t *testing.T) {
	counting := &countingArtifactService{Service: newExplicitArtifactService()}
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, counting)
	preferred := PreferredStore{LocationID: "loc_1", Name: "Kroger", Address: "1 Main", Chain: "Kroger"}

	firstStored, err := store.SetPreferredStore(t.Context(), "user_1", preferred, time.Unix(1, 0))
	if err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	firstSaves := counting.saveCount()
	var firstRevision int64
	if err := runner.db.QueryRow(`SELECT revision FROM shopping_profile_revisions WHERE user_id = 'user_1'`).Scan(&firstRevision); err != nil {
		t.Fatal(err)
	}

	secondStored, err := store.SetPreferredStore(t.Context(), "user_1", preferred, time.Unix(3_601, 0))
	if err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	var secondRevision int64
	if err := runner.db.QueryRow(`SELECT revision FROM shopping_profile_revisions WHERE user_id = 'user_1'`).Scan(&secondRevision); err != nil {
		t.Fatal(err)
	}
	if firstStored.SetAt != secondStored.SetAt || firstStored.SetAt != 1 || firstRevision != secondRevision || counting.saveCount() != firstSaves {
		t.Fatalf("no-op preferred store = set_at %d/%d, revisions %d/%d, saves %d/%d", firstStored.SetAt, secondStored.SetAt, firstRevision, secondRevision, firstSaves, counting.saveCount())
	}
	var jobs int
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_snapshot_jobs WHERE user_id = 'user_1'`).Scan(&jobs); err != nil || jobs != 0 {
		t.Fatalf("snapshot jobs = %d, err = %v", jobs, err)
	}
}

func TestPreferredStoreProviderChangeCreatesRevisionAndArtifact(t *testing.T) {
	counting := &countingArtifactService{Service: newExplicitArtifactService()}
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, counting)
	preferred := PreferredStore{Provider: "kroger", LocationID: "loc_1", Name: "Market", Address: "1 Main", Chain: "Market"}

	if _, err := store.SetPreferredStore(t.Context(), "user_1", preferred, time.Unix(1, 0)); err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	firstSaves := counting.saveCount()
	var firstRevision int64
	if err := runner.db.QueryRow(`SELECT revision FROM shopping_profile_revisions WHERE user_id = 'user_1'`).Scan(&firstRevision); err != nil {
		t.Fatal(err)
	}

	preferred.Provider = "trader_joes"
	stored, err := store.SetPreferredStore(t.Context(), "user_1", preferred, time.Unix(2, 0))
	if err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	var secondRevision int64
	if err := runner.db.QueryRow(`SELECT revision FROM shopping_profile_revisions WHERE user_id = 'user_1'`).Scan(&secondRevision); err != nil {
		t.Fatal(err)
	}
	if stored.Provider != "trader_joes" || secondRevision != firstRevision+1 || counting.saveCount() != firstSaves+1 {
		t.Fatalf("provider change = store %#v, revisions %d/%d, saves %d/%d", stored, firstRevision, secondRevision, firstSaves, counting.saveCount())
	}
}

func TestFrequentItemsKeepSameNamedProductsSeparateByProvider(t *testing.T) {
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := &Store{d1: runner, newID: randomID}

	orders := []Order{
		{ID: "order_kroger", Items: []OrderItem{{Product: &ProductReference{Provider: "kroger", ID: "upc_1"}, Name: "Whole Milk", Quantity: 1}}},
		{ID: "order_trader_joes", Items: []OrderItem{{Product: &ProductReference{Provider: "trader_joes", ID: "sku_1"}, Name: "Whole Milk", Quantity: 2}}},
	}
	for index, order := range orders {
		if _, err := store.RecordOrder(t.Context(), "user_1", order, time.Unix(int64(index+1), 0)); err != nil {
			t.Fatal(err)
		}
	}

	items, err := store.FrequentItems(t.Context(), "user_1")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 {
		t.Fatalf("frequent items = %#v", items)
	}
	seen := map[string]int{}
	for _, item := range items {
		if item.Product == nil {
			t.Fatalf("frequent item has no product reference: %#v", item)
		}
		seen[item.Product.Provider+":"+item.Product.ID] = item.TotalQuantity
	}
	if seen["kroger:upc_1"] != 1 || seen["trader_joes:sku_1"] != 2 {
		t.Fatalf("provider-scoped frequent items = %#v", seen)
	}
}

func TestSamePantryQuantityAndEquipmentCreateNoRevisionOrArtifact(t *testing.T) {
	counting := &countingArtifactService{Service: newExplicitArtifactService()}
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, counting)
	category := "appliance"

	if _, err := store.AddPantryItems(t.Context(), "user_1", []PantryItem{{Name: "Eggs", Quantity: 12}}, time.Unix(1, 0)); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AddEquipment(t.Context(), "user_1", []EquipmentItem{{Name: "Air fryer", Category: &category}}, time.Unix(1, 0)); err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	var firstRevision int64
	if err := runner.db.QueryRow(`SELECT revision FROM shopping_profile_revisions WHERE user_id = 'user_1'`).Scan(&firstRevision); err != nil {
		t.Fatal(err)
	}
	firstSaves := counting.saveCount()

	if _, err := store.SetPantryQuantity(t.Context(), "user_1", "Eggs", 12); err != nil {
		t.Fatal(err)
	}
	if _, err := store.AddEquipment(t.Context(), "user_1", []EquipmentItem{{Name: "Air fryer", Category: &category}}, time.Unix(3_601, 0)); err != nil {
		t.Fatal(err)
	}
	waitForShoppingProfileSnapshots(t, store)
	var secondRevision int64
	if err := runner.db.QueryRow(`SELECT revision FROM shopping_profile_revisions WHERE user_id = 'user_1'`).Scan(&secondRevision); err != nil {
		t.Fatal(err)
	}
	if firstRevision != secondRevision || counting.saveCount() != firstSaves {
		t.Fatalf("no-op pantry/equipment = revisions %d/%d, saves %d/%d", firstRevision, secondRevision, firstSaves, counting.saveCount())
	}
}

func TestShoppingProfileRetentionUsesExactDeletesWithoutVersionScan(t *testing.T) {
	base := newExplicitArtifactService()
	counting := &countingArtifactService{Service: base}
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, counting)
	setPreferredStoreRow(t, runner, "Kroger")

	for version := int64(1); version <= shoppingProfileArtifactRetention+5; version++ {
		if _, err := base.Save(t.Context(), &artifact.SaveRequest{
			AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1",
			FileName: shoppingProfileArtifactName, Version: version, Part: profileArtifactPart(t, ShoppingProfile{}),
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := runner.db.Exec(
			`INSERT INTO shopping_profile_artifact_versions (user_id, artifact_version, created_at) VALUES ('user_1', ?, ?)`,
			version, version,
		); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := runner.db.Exec(`UPDATE shopping_profile_revisions SET revision = 1000 WHERE user_id = 'user_1'`); err != nil {
		t.Fatal(err)
	}
	more, err := store.publishPendingShoppingProfileSnapshot(t.Context(), "user_1")
	if err != nil {
		t.Fatal(err)
	}
	for more {
		more, err = store.processShoppingProfileSnapshotWork(t.Context(), "user_1")
		if err != nil {
			t.Fatal(err)
		}
	}
	if counting.versionsCount() != 0 {
		t.Fatalf("publisher called Versions %d times", counting.versionsCount())
	}
	versions, err := base.Versions(t.Context(), &artifact.VersionsRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1", FileName: shoppingProfileArtifactName,
	})
	if err != nil || len(versions.Versions) != shoppingProfileArtifactRetention {
		t.Fatalf("retained versions = %#v, err = %v", versions, err)
	}
	if len(counting.deletedVersions()) != 6 {
		t.Fatalf("exact deleted versions = %#v", counting.deletedVersions())
	}
}

func TestShoppingProfileRetentionRetriesDurableCleanupWithoutNewMutation(t *testing.T) {
	base := newExplicitArtifactService()
	failing := &failOnceDeleteArtifactService{Service: base}
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, failing)
	setPreferredStoreRow(t, runner, "Kroger")

	if _, err := store.publishPendingShoppingProfileSnapshot(t.Context(), "user_1"); err != nil {
		t.Fatal(err)
	}
	snapshot, err := store.loadShoppingProfileSnapshot(t.Context(), "user_1")
	if err != nil {
		t.Fatal(err)
	}
	for version := int64(2); version <= shoppingProfileArtifactRetention+6; version++ {
		if _, err := base.Save(t.Context(), &artifact.SaveRequest{
			AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1",
			FileName: shoppingProfileArtifactName, Version: version, Part: profileArtifactPart(t, snapshot.Profile),
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := runner.db.Exec(
			`INSERT INTO shopping_profile_artifact_versions (user_id, artifact_version, created_at) VALUES ('user_1', ?, ?)`,
			version, version,
		); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := runner.db.Exec(`UPDATE shopping_profile_revisions SET revision = 2 WHERE user_id = 'user_1'`); err != nil {
		t.Fatal(err)
	}

	more, err := store.publishPendingShoppingProfileSnapshot(t.Context(), "user_1")
	if err != nil || !more {
		t.Fatalf("unchanged publish more = %v, err = %v", more, err)
	}
	var jobs, cleanup int
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_snapshot_jobs WHERE user_id = 'user_1'`).Scan(&jobs); err != nil {
		t.Fatal(err)
	}
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = 'user_1'`).Scan(&cleanup); err != nil {
		t.Fatal(err)
	}
	if jobs != 0 || cleanup != 0 {
		t.Fatalf("finalized work = %d snapshot jobs, %d cleanup jobs", jobs, cleanup)
	}
	pending, err := store.pendingShoppingProfileWork(t.Context(), 10)
	if err != nil || !slices.Contains(pending, "user_1") {
		t.Fatalf("pending overflow work = %#v, err = %v", pending, err)
	}

	if _, err := store.processShoppingProfileSnapshotWork(t.Context(), "user_1"); err == nil {
		t.Fatal("first cleanup unexpectedly succeeded")
	}
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = 'user_1'`).Scan(&cleanup); err != nil || cleanup != 6 {
		t.Fatalf("durable cleanup after failure = %d, err = %v", cleanup, err)
	}
	pending, err = store.pendingShoppingProfileWork(t.Context(), 10)
	if err != nil || !slices.Contains(pending, "user_1") {
		t.Fatalf("pending cleanup work = %#v, err = %v", pending, err)
	}

	more, err = store.processShoppingProfileSnapshotWork(t.Context(), "user_1")
	if err != nil || more {
		t.Fatalf("retry cleanup more = %v, err = %v", more, err)
	}
	var tracked int
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_artifact_versions WHERE user_id = 'user_1'`).Scan(&tracked); err != nil {
		t.Fatal(err)
	}
	versions, err := base.Versions(t.Context(), &artifact.VersionsRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1", FileName: shoppingProfileArtifactName,
	})
	if err != nil || tracked != shoppingProfileArtifactRetention || len(versions.Versions) != shoppingProfileArtifactRetention {
		t.Fatalf("retained after retry = tracked %d, versions %#v, err = %v", tracked, versions, err)
	}
	if _, err := base.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1",
		FileName: shoppingProfileArtifactName, Version: 1,
	}); err != nil {
		t.Fatalf("canonical referenced artifact was pruned: %v", err)
	}
}

func TestShoppingProfileRetentionSchedulesAndDrainsBoundedBatchesWithoutMutation(t *testing.T) {
	base := newExplicitArtifactService()
	counting := &countingArtifactService{Service: base}
	failing := &failOnceDeleteArtifactService{Service: counting}
	runner := newShoppingSnapshotSQLiteRunner(t)
	recording := &recordingStatementRunner{statementRunner: runner}
	store := newShoppingSnapshotTestStore(t, recording, failing)
	setPreferredStoreRow(t, runner, "Kroger")

	if _, err := store.publishPendingShoppingProfileSnapshot(t.Context(), "user_1"); err != nil {
		t.Fatal(err)
	}
	snapshot, err := store.loadShoppingProfileSnapshot(t.Context(), "user_1")
	if err != nil {
		t.Fatal(err)
	}
	lastVersion := int64(shoppingProfileArtifactRetention + 2*shoppingProfileCleanupBatch + 5)
	for version := int64(2); version <= lastVersion; version++ {
		if _, err := base.Save(t.Context(), &artifact.SaveRequest{
			AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1",
			FileName: shoppingProfileArtifactName, Version: version, Part: profileArtifactPart(t, snapshot.Profile),
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := runner.db.Exec(
			`INSERT INTO shopping_profile_artifact_versions (user_id, artifact_version, created_at) VALUES ('user_1', ?, ?)`,
			version, version,
		); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := runner.db.Exec(`UPDATE shopping_profile_revisions SET revision = 2 WHERE user_id = 'user_1'`); err != nil {
		t.Fatal(err)
	}
	more, err := store.publishPendingShoppingProfileSnapshot(t.Context(), "user_1")
	if err != nil || !more {
		t.Fatalf("unchanged publish more = %v, err = %v", more, err)
	}
	var jobs int
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_snapshot_jobs WHERE user_id = 'user_1'`).Scan(&jobs); err != nil || jobs != 0 {
		t.Fatalf("snapshot jobs after ack = %d, err = %v", jobs, err)
	}
	var cleanup int
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = 'user_1'`).Scan(&cleanup); err != nil || cleanup != 0 {
		t.Fatalf("cleanup jobs before bounded scheduling = %d, err = %v", cleanup, err)
	}
	pending, err := store.pendingShoppingProfileWork(t.Context(), 10)
	if err != nil || !slices.Contains(pending, "user_1") {
		t.Fatalf("pollable overflow = %#v, err = %v", pending, err)
	}

	if _, err := store.processShoppingProfileSnapshotWork(t.Context(), "user_1"); err == nil {
		t.Fatal("first bounded cleanup unexpectedly succeeded")
	}
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = 'user_1'`).Scan(&cleanup); err != nil || cleanup != shoppingProfileCleanupBatch {
		t.Fatalf("durable bounded cleanup = %d, err = %v", cleanup, err)
	}
	pending, err = store.pendingShoppingProfileWork(t.Context(), 10)
	if err != nil || !slices.Contains(pending, "user_1") {
		t.Fatalf("retryable bounded cleanup = %#v, err = %v", pending, err)
	}

	more = true
	for attempts := 0; more && attempts < 10; attempts++ {
		more, err = store.processShoppingProfileSnapshotWork(t.Context(), "user_1")
		if err != nil {
			t.Fatal(err)
		}
	}
	if more {
		t.Fatal("overflow did not drain within bounded passes")
	}
	schedules := recording.cleanupSchedules()
	for _, statement := range schedules {
		bounded := len(statement.Params) == 4 && strings.Contains(statement.SQL, "LIMIT ?") && !strings.Contains(statement.SQL, "LIMIT -1")
		if strings.Contains(statement.SQL, "OFFSET ?") {
			bounded = bounded && statement.Params[2] == shoppingProfileCleanupBatch && statement.Params[3] == shoppingProfileArtifactRetention-1
		} else {
			bounded = bounded && strings.Contains(statement.SQL, "NOT EXISTS") && statement.Params[3] == shoppingProfileCleanupBatch
		}
		if !bounded {
			t.Fatalf("unbounded cleanup schedule = %#v", statement)
		}
	}
	if len(schedules) < 6 {
		t.Fatalf("cleanup schedule statements = %d, want multiple bounded batches", len(schedules))
	}
	var tracked int
	if err := runner.db.QueryRow(`SELECT COUNT(*) FROM shopping_profile_artifact_versions WHERE user_id = 'user_1'`).Scan(&tracked); err != nil {
		t.Fatal(err)
	}
	versions, err := base.Versions(t.Context(), &artifact.VersionsRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1", FileName: shoppingProfileArtifactName,
	})
	if err != nil || tracked != shoppingProfileArtifactRetention || len(versions.Versions) != shoppingProfileArtifactRetention {
		t.Fatalf("retained after bounded drain = tracked %d, versions %#v, err = %v", tracked, versions, err)
	}
	if deleted := counting.deletedVersions(); len(deleted) != int(lastVersion)-shoppingProfileArtifactRetention {
		t.Fatalf("deleted versions = %d, want %d", len(deleted), int(lastVersion)-shoppingProfileArtifactRetention)
	}
	if _, err := base.Load(t.Context(), &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1",
		FileName: shoppingProfileArtifactName, Version: 1,
	}); err != nil {
		t.Fatalf("canonical referenced artifact was pruned: %v", err)
	}
}

func TestStoreCloseCancelsActiveShoppingProfileSaveAndCannotRestart(t *testing.T) {
	base := newExplicitArtifactService()
	blocking := newBlockingArtifactService(base, 1)
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, blocking)

	if _, err := store.SetPreferredStore(
		t.Context(), "user_1", PreferredStore{LocationID: "loc_1", Name: "Kroger"}, time.Unix(1, 0),
	); err != nil {
		t.Fatal(err)
	}
	select {
	case <-blocking.started:
	case <-time.After(2 * time.Second):
		t.Fatal("artifact save did not start")
	}

	closed := make(chan error, 1)
	go func() { closed <- store.Close() }()
	select {
	case err := <-closed:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Store.Close did not cancel the active artifact save")
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	store.enqueueShoppingProfileSnapshot("user_1")
	waitCtx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := store.waitShoppingProfileSnapshots(waitCtx); err != nil {
		t.Fatalf("closed scheduler did not remain idle: %v", err)
	}
	if _, err := store.PreferredStore(t.Context(), "user_1"); !errors.Is(err, ErrStoreClosed) {
		t.Fatalf("use after Close error = %v", err)
	}
}

func TestShoppingProfilePublishRecoversSaveBeforeReference(t *testing.T) {
	base := newExplicitArtifactService()
	runner := newShoppingSnapshotSQLiteRunner(t)
	store := newShoppingSnapshotTestStore(t, runner, base)
	setPreferredStoreRow(t, runner, "Kroger")
	snapshot, err := store.loadShoppingProfileSnapshot(t.Context(), "user_1")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := base.Save(t.Context(), &artifact.SaveRequest{
		AppName: groceryLibraryApp, UserID: "user_1", SessionID: "user_1",
		FileName: shoppingProfileArtifactName, Version: snapshot.Revision, Part: profileArtifactPart(t, snapshot.Profile),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := store.publishPendingShoppingProfileSnapshot(t.Context(), "user_1"); err != nil {
		t.Fatal(err)
	}
	var version int64
	if err := runner.db.QueryRow(`SELECT artifact_version FROM shopping_profile_artifacts WHERE user_id = 'user_1'`).Scan(&version); err != nil || version != snapshot.Revision {
		t.Fatalf("recovered reference version = %d, err = %v", version, err)
	}
}

type shoppingSnapshotSQLiteRunner struct {
	db *sql.DB
}

type recordingStatementRunner struct {
	statementRunner
	mu        sync.Mutex
	schedules []cloudflare.Statement
}

func (r *recordingStatementRunner) Run(ctx context.Context, statements ...cloudflare.Statement) ([]cloudflare.Result, error) {
	r.mu.Lock()
	for _, statement := range statements {
		if strings.Contains(statement.SQL, "INSERT OR IGNORE INTO shopping_profile_artifact_cleanup_jobs") &&
			strings.Contains(statement.SQL, "FROM shopping_profile_artifact_versions AS versions") {
			statement.Params = append([]any(nil), statement.Params...)
			r.schedules = append(r.schedules, statement)
		}
	}
	r.mu.Unlock()
	return r.statementRunner.Run(ctx, statements...)
}

func (r *recordingStatementRunner) cleanupSchedules() []cloudflare.Statement {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]cloudflare.Statement(nil), r.schedules...)
}

func newShoppingSnapshotSQLiteRunner(t *testing.T) *shoppingSnapshotSQLiteRunner {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	for _, source := range []string{
		d1migrations.Initial,
		d1migrations.SharedLists,
		d1migrations.SavedGroceryResources,
		d1migrations.ShoppingProfile,
		d1migrations.ShoppingProfileArtifacts,
		d1migrations.UniversalProductReferences,
	} {
		for _, statement := range splitShoppingSnapshotTestSQL(source) {
			if _, err := db.Exec(statement); err != nil {
				_ = db.Close()
				t.Fatalf("execute test migration statement %q: %v", statement, err)
			}
		}
	}
	t.Cleanup(func() { _ = db.Close() })
	return &shoppingSnapshotSQLiteRunner{db: db}
}

func (r *shoppingSnapshotSQLiteRunner) Run(ctx context.Context, statements ...cloudflare.Statement) ([]cloudflare.Result, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	results := make([]cloudflare.Result, 0, len(statements))
	for _, statement := range statements {
		result := cloudflare.Result{Success: true}
		upperSQL := strings.ToUpper(strings.TrimSpace(statement.SQL))
		if strings.HasPrefix(upperSQL, "SELECT ") || strings.Contains(upperSQL, " RETURNING ") {
			rows, err := tx.QueryContext(ctx, statement.SQL, statement.Params...)
			if err != nil {
				return nil, fmt.Errorf("query %q: %w", statement.SQL, err)
			}
			columns, err := rows.Columns()
			if err != nil {
				_ = rows.Close()
				return nil, err
			}
			for rows.Next() {
				values := make([]any, len(columns))
				pointers := make([]any, len(columns))
				for index := range values {
					pointers[index] = &values[index]
				}
				if err := rows.Scan(pointers...); err != nil {
					_ = rows.Close()
					return nil, err
				}
				row := map[string]any{}
				for index, column := range columns {
					if bytes, ok := values[index].([]byte); ok {
						values[index] = string(bytes)
					}
					row[column] = values[index]
				}
				encoded, err := json.Marshal(row)
				if err != nil {
					_ = rows.Close()
					return nil, err
				}
				result.Rows = append(result.Rows, encoded)
			}
			if err := rows.Close(); err != nil {
				return nil, err
			}
		} else {
			executed, err := tx.ExecContext(ctx, statement.SQL, statement.Params...)
			if err != nil {
				return nil, fmt.Errorf("exec %q: %w", statement.SQL, err)
			}
			result.Meta.Changes, _ = executed.RowsAffected()
		}
		results = append(results, result)
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return results, nil
}

func newShoppingSnapshotTestStore(t *testing.T, runner statementRunner, service artifact.Service) *Store {
	t.Helper()
	store := &Store{d1: runner, artifacts: service, newID: randomID}
	t.Cleanup(store.stopShoppingProfileSnapshots)
	return store
}

func setPreferredStoreRow(t *testing.T, runner *shoppingSnapshotSQLiteRunner, name string) {
	t.Helper()
	_, err := runner.db.Exec(
		`INSERT INTO preferred_stores (user_id, location_id, name, address, chain, set_at)
		 VALUES ('user_1', 'loc_1', ?, '1 Main', 'Kroger', 1)
		 ON CONFLICT(user_id) DO UPDATE SET name = excluded.name WHERE preferred_stores.name IS NOT excluded.name`,
		name,
	)
	if err != nil {
		t.Fatal(err)
	}
}

func profileArtifactPart(t *testing.T, profile ShoppingProfile) *genai.Part {
	t.Helper()
	data, err := json.Marshal(profile)
	if err != nil {
		t.Fatal(err)
	}
	return &genai.Part{InlineData: &genai.Blob{Data: data, MIMEType: "application/json"}}
}

func waitForShoppingProfileSnapshots(t *testing.T, store *Store) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := store.waitShoppingProfileSnapshots(ctx); err != nil {
		t.Fatal(err)
	}
}

type blockingArtifactService struct {
	artifact.Service
	blockVersion int64
	started      chan struct{}
	release      chan struct{}
	once         sync.Once
}

func newBlockingArtifactService(service artifact.Service, version int64) *blockingArtifactService {
	return &blockingArtifactService{
		Service: service, blockVersion: version, started: make(chan struct{}), release: make(chan struct{}),
	}
}

func (s *blockingArtifactService) Save(ctx context.Context, request *artifact.SaveRequest) (*artifact.SaveResponse, error) {
	if request.Version == s.blockVersion {
		s.once.Do(func() { close(s.started) })
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-s.release:
		}
	}
	return s.Service.Save(ctx, request)
}

type countingArtifactService struct {
	artifact.Service
	mu       sync.Mutex
	saves    int
	versions int
	deleted  []int64
}

type failOnceDeleteArtifactService struct {
	artifact.Service
	mu     sync.Mutex
	failed bool
}

func (s *failOnceDeleteArtifactService) Delete(ctx context.Context, request *artifact.DeleteRequest) error {
	s.mu.Lock()
	if !s.failed {
		s.failed = true
		s.mu.Unlock()
		return errors.New("injected artifact delete failure")
	}
	s.mu.Unlock()
	return s.Service.Delete(ctx, request)
}

type explicitArtifactKey struct {
	app, user, session, file string
}

type explicitArtifactService struct {
	mu        sync.Mutex
	artifacts map[explicitArtifactKey]map[int64]*genai.Part
}

func newExplicitArtifactService() *explicitArtifactService {
	return &explicitArtifactService{artifacts: map[explicitArtifactKey]map[int64]*genai.Part{}}
}

func (s *explicitArtifactService) Save(_ context.Context, request *artifact.SaveRequest) (*artifact.SaveResponse, error) {
	if request == nil {
		return nil, errors.New("save request is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	key := explicitArtifactKey{request.AppName, request.UserID, request.SessionID, request.FileName}
	s.mu.Lock()
	defer s.mu.Unlock()
	versions := s.artifacts[key]
	if versions == nil {
		versions = map[int64]*genai.Part{}
		s.artifacts[key] = versions
	}
	version := request.Version
	if version == 0 {
		version = 1
		for candidate := range versions {
			if candidate >= version {
				version = candidate + 1
			}
		}
	}
	if _, exists := versions[version]; exists {
		return nil, errors.New("artifact version already exists")
	}
	versions[version] = request.Part
	return &artifact.SaveResponse{Version: version}, nil
}

func (s *explicitArtifactService) Load(_ context.Context, request *artifact.LoadRequest) (*artifact.LoadResponse, error) {
	if request == nil {
		return nil, errors.New("load request is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	key := explicitArtifactKey{request.AppName, request.UserID, request.SessionID, request.FileName}
	s.mu.Lock()
	defer s.mu.Unlock()
	versions := s.artifacts[key]
	version := request.Version
	if version == 0 {
		for candidate := range versions {
			if candidate > version {
				version = candidate
			}
		}
	}
	part := versions[version]
	if part == nil {
		return nil, errors.New("artifact not found")
	}
	return &artifact.LoadResponse{Part: part}, nil
}

func (s *explicitArtifactService) Delete(_ context.Context, request *artifact.DeleteRequest) error {
	if request == nil {
		return errors.New("delete request is required")
	}
	if err := request.Validate(); err != nil {
		return err
	}
	key := explicitArtifactKey{request.AppName, request.UserID, request.SessionID, request.FileName}
	s.mu.Lock()
	defer s.mu.Unlock()
	if request.Version == 0 {
		delete(s.artifacts, key)
		return nil
	}
	delete(s.artifacts[key], request.Version)
	return nil
}

func (s *explicitArtifactService) List(_ context.Context, request *artifact.ListRequest) (*artifact.ListResponse, error) {
	if request == nil {
		return nil, errors.New("list request is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	seen := map[string]bool{}
	for key := range s.artifacts {
		if key.app == request.AppName && key.user == request.UserID && key.session == request.SessionID {
			seen[key.file] = true
		}
	}
	response := &artifact.ListResponse{}
	for file := range seen {
		response.FileNames = append(response.FileNames, file)
	}
	slices.Sort(response.FileNames)
	return response, nil
}

func (s *explicitArtifactService) Versions(_ context.Context, request *artifact.VersionsRequest) (*artifact.VersionsResponse, error) {
	if request == nil {
		return nil, errors.New("versions request is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	key := explicitArtifactKey{request.AppName, request.UserID, request.SessionID, request.FileName}
	s.mu.Lock()
	defer s.mu.Unlock()
	response := &artifact.VersionsResponse{}
	for version := range s.artifacts[key] {
		response.Versions = append(response.Versions, version)
	}
	slices.Sort(response.Versions)
	return response, nil
}

func (s *explicitArtifactService) GetArtifactVersion(_ context.Context, request *artifact.GetArtifactVersionRequest) (*artifact.GetArtifactVersionResponse, error) {
	if request == nil {
		return nil, errors.New("artifact version request is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	return &artifact.GetArtifactVersionResponse{ArtifactVersion: &artifact.ArtifactVersion{Version: request.Version}}, nil
}

func (s *countingArtifactService) Save(ctx context.Context, request *artifact.SaveRequest) (*artifact.SaveResponse, error) {
	s.mu.Lock()
	s.saves++
	s.mu.Unlock()
	return s.Service.Save(ctx, request)
}

func (s *countingArtifactService) Versions(ctx context.Context, request *artifact.VersionsRequest) (*artifact.VersionsResponse, error) {
	s.mu.Lock()
	s.versions++
	s.mu.Unlock()
	return s.Service.Versions(ctx, request)
}

func (s *countingArtifactService) Delete(ctx context.Context, request *artifact.DeleteRequest) error {
	s.mu.Lock()
	s.deleted = append(s.deleted, request.Version)
	s.mu.Unlock()
	return s.Service.Delete(ctx, request)
}

func (s *countingArtifactService) saveCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saves
}

func (s *countingArtifactService) versionsCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.versions
}

func (s *countingArtifactService) deletedVersions() []int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]int64(nil), s.deleted...)
}

func splitShoppingSnapshotTestSQL(source string) []string {
	var statements []string
	var current strings.Builder
	inTrigger := false
	flush := func() {
		statement := strings.TrimSpace(current.String())
		statement = strings.TrimSpace(strings.TrimSuffix(statement, ";"))
		if statement != "" {
			statements = append(statements, statement)
		}
		current.Reset()
	}
	for line := range strings.SplitSeq(source, "\n") {
		trimmed := strings.TrimSpace(line)
		if !inTrigger && strings.HasPrefix(strings.ToUpper(trimmed), "CREATE TRIGGER ") {
			inTrigger = true
		}
		current.WriteString(line)
		current.WriteByte('\n')
		if inTrigger {
			if strings.EqualFold(trimmed, "END;") {
				flush()
				inTrigger = false
			}
			continue
		}
		if strings.HasSuffix(trimmed, ";") {
			flush()
		}
	}
	flush()
	return statements
}

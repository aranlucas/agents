package groceries

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"agents/internal/cloudflare"
	"google.golang.org/adk/v2/artifact"
	"google.golang.org/genai"
)

const (
	shoppingProfileSnapshotWorkers   = 2
	shoppingProfileSnapshotQueueSize = 256
	shoppingProfileSnapshotTimeout   = 20 * time.Second
	shoppingProfileSnapshotLease     = 45 * time.Second
	shoppingProfileSnapshotPoll      = 30 * time.Second
	shoppingProfileArtifactRetention = 32
	shoppingProfileCleanupBatch      = 64
)

type shoppingProfileSnapshotScheduler struct {
	store  *Store
	ctx    context.Context
	cancel context.CancelFunc

	queue chan string
	stop  chan struct{}
	done  chan struct{}

	mu        sync.Mutex
	pending   map[string]bool
	running   map[string]bool
	waiters   []chan struct{}
	workers   sync.WaitGroup
	closeOnce sync.Once
	closed    bool
}

func newShoppingProfileSnapshotScheduler(store *Store) *shoppingProfileSnapshotScheduler {
	ctx, cancel := context.WithCancel(context.Background())
	scheduler := &shoppingProfileSnapshotScheduler{
		store: store, ctx: ctx, cancel: cancel, queue: make(chan string, shoppingProfileSnapshotQueueSize),
		stop: make(chan struct{}), done: make(chan struct{}),
		pending: map[string]bool{}, running: map[string]bool{},
	}
	for range shoppingProfileSnapshotWorkers {
		scheduler.workers.Add(1)
		go scheduler.worker()
	}
	go scheduler.poller()
	return scheduler
}

func (s *Store) startShoppingProfileSnapshots() {
	if s == nil || s.artifacts == nil {
		return
	}
	s.shoppingSnapshotMu.Lock()
	defer s.shoppingSnapshotMu.Unlock()
	if s.shoppingClosed || s.shoppingSnapshots != nil {
		return
	}
	s.shoppingSnapshots = newShoppingProfileSnapshotScheduler(s)
}

func (s *Store) enqueueShoppingProfileSnapshot(userID string) {
	s.startShoppingProfileSnapshots()
	if s == nil {
		return
	}
	s.shoppingSnapshotMu.RLock()
	scheduler, closed := s.shoppingSnapshots, s.shoppingClosed
	s.shoppingSnapshotMu.RUnlock()
	if scheduler == nil || closed {
		return
	}
	scheduler.enqueue(userID)
}

func (s *Store) enqueueShoppingProfileSnapshotWithCleanup(userID, cleanupUserID string) {
	s.startShoppingProfileSnapshots()
	if s == nil {
		return
	}
	s.shoppingSnapshotMu.RLock()
	scheduler, closed := s.shoppingSnapshots, s.shoppingClosed
	s.shoppingSnapshotMu.RUnlock()
	if scheduler == nil || closed {
		return
	}
	scheduler.enqueue(cleanupUserID)
	scheduler.enqueue(userID)
}

func (s *Store) waitShoppingProfileSnapshots(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.shoppingSnapshotMu.RLock()
	scheduler := s.shoppingSnapshots
	s.shoppingSnapshotMu.RUnlock()
	if scheduler == nil {
		return nil
	}
	return scheduler.waitIdle(ctx)
}

func (s *Store) stopShoppingProfileSnapshots() {
	_ = s.Close()
}

func (s *shoppingProfileSnapshotScheduler) enqueue(userID string) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	if s.running[userID] || s.pending[userID] {
		s.pending[userID] = true
		s.mu.Unlock()
		return
	}
	if len(s.pending)+len(s.running) >= shoppingProfileSnapshotQueueSize {
		s.mu.Unlock()
		log.Printf("shopping profile snapshot queue is full")
		return
	}
	s.pending[userID] = true
	s.mu.Unlock()
	select {
	case s.queue <- userID:
	case <-s.stop:
		s.mu.Lock()
		delete(s.pending, userID)
		s.notifyIdleLocked()
		s.mu.Unlock()
	default:
		s.mu.Lock()
		delete(s.pending, userID)
		s.notifyIdleLocked()
		s.mu.Unlock()
		log.Printf("shopping profile snapshot queue is full")
	}
}

func (s *shoppingProfileSnapshotScheduler) worker() {
	defer s.workers.Done()
	for {
		select {
		case <-s.stop:
			return
		case userID := <-s.queue:
			s.mu.Lock()
			if s.closed {
				delete(s.pending, userID)
				s.notifyIdleLocked()
				s.mu.Unlock()
				return
			}
			delete(s.pending, userID)
			s.running[userID] = true
			s.mu.Unlock()

			for {
				if s.ctx.Err() != nil {
					s.mu.Lock()
					delete(s.pending, userID)
					delete(s.running, userID)
					s.notifyIdleLocked()
					s.mu.Unlock()
					return
				}
				ctx, cancel := context.WithTimeout(s.ctx, shoppingProfileSnapshotTimeout)
				more, err := s.store.processShoppingProfileSnapshotWork(ctx, userID)
				cancel()
				if err != nil && s.ctx.Err() == nil {
					log.Printf("publish shopping profile artifact: %v", err)
					more = false
				}

				s.mu.Lock()
				queuedAgain := s.pending[userID]
				delete(s.pending, userID)
				closed := s.closed
				if closed || (!more && !queuedAgain) {
					delete(s.running, userID)
					s.notifyIdleLocked()
					s.mu.Unlock()
					if closed {
						return
					}
					break
				}
				s.mu.Unlock()
			}
		}
	}
}

func (s *shoppingProfileSnapshotScheduler) poller() {
	defer close(s.done)
	ticker := time.NewTicker(shoppingProfileSnapshotPoll)
	defer ticker.Stop()
	for {
		select {
		case <-s.stop:
			return
		case <-ticker.C:
			ctx, cancel := context.WithTimeout(s.ctx, shoppingProfileSnapshotTimeout)
			userIDs, err := s.store.pendingShoppingProfileWork(ctx, shoppingProfileSnapshotQueueSize)
			cancel()
			if err != nil {
				log.Printf("poll shopping profile snapshot jobs: %v", err)
				continue
			}
			for _, userID := range userIDs {
				s.enqueue(userID)
			}
		}
	}
}

func (s *shoppingProfileSnapshotScheduler) waitIdle(ctx context.Context) error {
	s.mu.Lock()
	if len(s.pending) == 0 && len(s.running) == 0 {
		s.mu.Unlock()
		return nil
	}
	waiter := make(chan struct{})
	s.waiters = append(s.waiters, waiter)
	s.mu.Unlock()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-waiter:
		return nil
	}
}

func (s *shoppingProfileSnapshotScheduler) notifyIdleLocked() {
	if len(s.pending) != 0 || len(s.running) != 0 {
		return
	}
	for _, waiter := range s.waiters {
		close(waiter)
	}
	s.waiters = nil
}

func (s *shoppingProfileSnapshotScheduler) close() {
	s.closeOnce.Do(func() {
		s.mu.Lock()
		s.closed = true
		clear(s.pending)
		s.notifyIdleLocked()
		s.mu.Unlock()
		s.cancel()
		close(s.stop)
		s.workers.Wait()
		<-s.done
	})
}

func (s *Store) pendingShoppingProfileWork(ctx context.Context, limit int) ([]string, error) {
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `SELECT user_id FROM shopping_profile_snapshot_jobs
			      WHERE lease_until IS NULL OR lease_until <= ? ORDER BY updated_at, user_id LIMIT ?`,
			Params: []any{time.Now().UTC().UnixMilli(), limit},
		},
		cloudflare.Statement{
			SQL:    `SELECT DISTINCT user_id FROM shopping_profile_artifact_cleanup_jobs ORDER BY user_id LIMIT ?`,
			Params: []any{limit},
		},
		cloudflare.Statement{
			SQL: `SELECT versions.user_id
			      FROM shopping_profile_artifact_versions AS versions
			      JOIN shopping_profile_artifacts AS current ON current.user_id = versions.user_id
			      WHERE versions.artifact_version <> current.artifact_version
			      GROUP BY versions.user_id HAVING COUNT(*) > ?
			      ORDER BY versions.user_id LIMIT ?`,
			Params: []any{shoppingProfileArtifactRetention - 1, limit},
		},
		cloudflare.Statement{
			SQL: `SELECT DISTINCT versions.user_id
			      FROM shopping_profile_artifact_versions AS versions
			      LEFT JOIN shopping_profile_artifacts AS current ON current.user_id = versions.user_id
			      WHERE current.user_id IS NULL ORDER BY versions.user_id LIMIT ?`,
			Params: []any{limit},
		},
	)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	userIDs := make([]string, 0, limit)
	for _, result := range results {
		for _, raw := range result.Rows {
			var row struct {
				UserID string `json:"user_id"`
			}
			if json.Unmarshal(raw, &row) != nil || strings.TrimSpace(row.UserID) == "" {
				return nil, errors.New("decode shopping profile work")
			}
			if !seen[row.UserID] && len(userIDs) < limit {
				seen[row.UserID] = true
				userIDs = append(userIDs, row.UserID)
			}
		}
	}
	return userIDs, nil
}

func (s *Store) processShoppingProfileSnapshotWork(ctx context.Context, userID string) (bool, error) {
	if err := s.scheduleShoppingProfileArtifactCleanup(ctx, userID); err != nil {
		return false, err
	}
	cleanupMore, err := s.cleanupShoppingProfileArtifacts(ctx, userID)
	if err != nil {
		return false, err
	}
	snapshotMore, err := s.publishPendingShoppingProfileSnapshot(ctx, userID)
	if err != nil {
		return false, err
	}
	return cleanupMore || snapshotMore, nil
}

func (s *Store) scheduleShoppingProfileArtifactCleanup(ctx context.Context, userID string) error {
	now := time.Now().UTC().UnixMilli()
	_, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `INSERT OR IGNORE INTO shopping_profile_artifact_cleanup_jobs
			        (user_id, artifact_version, requested_at)
			      SELECT versions.user_id, versions.artifact_version, ?
			      FROM shopping_profile_artifact_versions AS versions
			      JOIN shopping_profile_artifacts AS current ON current.user_id = versions.user_id
			      WHERE versions.user_id = ? AND versions.artifact_version <> current.artifact_version
			      ORDER BY versions.artifact_version DESC LIMIT ? OFFSET ?`,
			Params: []any{now, userID, shoppingProfileCleanupBatch, shoppingProfileArtifactRetention - 1},
		},
		cloudflare.Statement{
			SQL: `INSERT OR IGNORE INTO shopping_profile_artifact_cleanup_jobs
			        (user_id, artifact_version, requested_at)
			      SELECT versions.user_id, versions.artifact_version, ?
			      FROM shopping_profile_artifact_versions AS versions
			      WHERE versions.user_id = ? AND NOT EXISTS (
			        SELECT 1 FROM shopping_profile_artifacts WHERE user_id = ?
			      )
			      ORDER BY versions.artifact_version DESC LIMIT ?`,
			Params: []any{now, userID, userID, shoppingProfileCleanupBatch},
		},
	)
	return err
}

func (s *Store) cleanupShoppingProfileArtifacts(ctx context.Context, userID string) (bool, error) {
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `SELECT artifact_version FROM shopping_profile_artifact_cleanup_jobs
		      WHERE user_id = ? ORDER BY artifact_version LIMIT ?`,
		Params: []any{userID, shoppingProfileCleanupBatch},
	})
	if err != nil {
		return false, err
	}
	if len(results) == 0 || len(results[0].Rows) == 0 {
		return false, nil
	}
	for _, raw := range results[0].Rows {
		version, err := decodeShoppingProfileArtifactVersion(raw)
		if err != nil {
			return false, err
		}
		if err := s.artifacts.Delete(ctx, &artifact.DeleteRequest{
			AppName: groceryLibraryApp, UserID: userID, SessionID: userID,
			FileName: shoppingProfileArtifactName, Version: version,
		}); err != nil {
			return false, fmt.Errorf("delete old shopping profile artifact: %w", err)
		}
		if _, err := s.d1.Run(
			ctx,
			cloudflare.Statement{
				SQL:    `DELETE FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = ? AND artifact_version = ?`,
				Params: []any{userID, version},
			},
			cloudflare.Statement{
				SQL:    `DELETE FROM shopping_profile_artifact_versions WHERE user_id = ? AND artifact_version = ?`,
				Params: []any{userID, version},
			},
		); err != nil {
			return false, err
		}
	}
	return len(results[0].Rows) == shoppingProfileCleanupBatch, nil
}

func (s *Store) publishPendingShoppingProfileSnapshot(ctx context.Context, userID string) (bool, error) {
	leaseToken, err := randomID("profile_snapshot_lease")
	if err != nil {
		return false, err
	}
	now := time.Now().UTC()
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `UPDATE shopping_profile_snapshot_jobs
		      SET lease_token = ?, lease_until = ?, attempts = attempts + 1
		      WHERE user_id = ? AND (lease_until IS NULL OR lease_until <= ?)
		      RETURNING target_revision`,
		Params: []any{leaseToken, now.Add(shoppingProfileSnapshotLease).UnixMilli(), userID, now.UnixMilli()},
	})
	if err != nil {
		return false, err
	}
	if len(results) == 0 || len(results[0].Rows) == 0 {
		return false, nil
	}
	var claim struct {
		TargetRevision int64 `json:"target_revision"`
	}
	if json.Unmarshal(results[0].Rows[0], &claim) != nil || claim.TargetRevision <= 0 {
		return false, errors.New("decode shopping profile snapshot claim")
	}

	snapshot, err := s.loadShoppingProfileSnapshot(ctx, userID)
	if err != nil {
		return false, err
	}
	if snapshot.Revision < claim.TargetRevision {
		return false, errors.New("shopping profile snapshot revision is behind its job")
	}
	data, err := json.Marshal(snapshot.Profile)
	if err != nil {
		return false, errors.New("encode shopping profile artifact")
	}
	digestBytes := sha256.Sum256(data)
	digest := hex.EncodeToString(digestBytes[:])

	if snapshot.Reference != nil && snapshot.Reference.ContentSHA256 == digest {
		matches, loadErr := s.shoppingProfileArtifactMatches(ctx, userID, snapshot.Reference.ArtifactVersion, data)
		if loadErr == nil && matches {
			more, finalizeErr := s.finalizeUnchangedShoppingProfileSnapshot(ctx, userID, leaseToken, snapshot.Revision, digest, now)
			if finalizeErr != nil {
				return false, finalizeErr
			}
			return more, nil
		}
	}

	if err := s.saveShoppingProfileArtifact(ctx, userID, snapshot.Revision, data); err != nil {
		return false, err
	}
	more, err := s.finalizeShoppingProfileSnapshot(ctx, userID, leaseToken, snapshot.Revision, digest, now)
	if err != nil {
		return false, err
	}
	return more, nil
}

func (s *Store) saveShoppingProfileArtifact(ctx context.Context, userID string, version int64, data []byte) error {
	_, err := s.artifacts.Save(ctx, &artifact.SaveRequest{
		AppName: groceryLibraryApp, UserID: userID, SessionID: userID,
		FileName: shoppingProfileArtifactName, Version: version,
		Part: &genai.Part{InlineData: &genai.Blob{Data: data, MIMEType: "application/json"}},
	})
	if err == nil {
		return nil
	}
	matches, loadErr := s.shoppingProfileArtifactMatches(ctx, userID, version, data)
	if loadErr == nil && matches {
		return nil
	}
	return fmt.Errorf("save shopping profile artifact: %w", err)
}

func (s *Store) shoppingProfileArtifactMatches(ctx context.Context, userID string, version int64, data []byte) (bool, error) {
	loaded, err := s.artifacts.Load(ctx, &artifact.LoadRequest{
		AppName: groceryLibraryApp, UserID: userID, SessionID: userID,
		FileName: shoppingProfileArtifactName, Version: version,
	})
	if err != nil {
		return false, err
	}
	if loaded == nil || loaded.Part == nil || loaded.Part.InlineData == nil {
		return false, errors.New("shopping profile artifact has no JSON data")
	}
	return bytes.Equal(loaded.Part.InlineData.Data, data), nil
}

func (s *Store) finalizeShoppingProfileSnapshot(ctx context.Context, userID, leaseToken string, revision int64, digest string, now time.Time) (bool, error) {
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `INSERT INTO shopping_profile_artifacts
			        (user_id, scope_user_id, file_name, profile_revision, artifact_version, content_sha256, created_at)
			      SELECT ?, ?, ?, ?, ?, ?, ?
			      WHERE EXISTS (
			        SELECT 1 FROM shopping_profile_revisions WHERE user_id = ? AND revision >= ?
			      )
			      ON CONFLICT(user_id) DO UPDATE SET
			        scope_user_id = excluded.scope_user_id,
			        file_name = excluded.file_name,
			        profile_revision = excluded.profile_revision,
			        artifact_version = excluded.artifact_version,
			        content_sha256 = excluded.content_sha256,
			        created_at = excluded.created_at
			      WHERE excluded.profile_revision > shopping_profile_artifacts.profile_revision`,
			Params: []any{userID, userID, shoppingProfileArtifactName, revision, revision, digest, now.UnixMilli(), userID, revision},
		},
		cloudflare.Statement{
			SQL: `INSERT OR IGNORE INTO shopping_profile_artifact_versions (user_id, artifact_version, created_at)
			      SELECT ?, ?, ? WHERE EXISTS (
			        SELECT 1 FROM shopping_profile_artifacts
			        WHERE user_id = ? AND profile_revision = ? AND artifact_version = ?
			      )`,
			Params: []any{userID, revision, now.UnixMilli(), userID, revision, revision},
		},
		cloudflare.Statement{
			SQL: `INSERT OR IGNORE INTO shopping_profile_artifact_cleanup_jobs
			        (user_id, artifact_version, requested_at)
			      SELECT ?, ?, ? WHERE NOT EXISTS (
			        SELECT 1 FROM shopping_profile_artifacts
			        WHERE user_id = ? AND artifact_version = ?
			      )`,
			Params: []any{userID, revision, now.UnixMilli(), userID, revision},
		},
		cloudflare.Statement{
			SQL: `SELECT 1 AS overflow
			      FROM shopping_profile_artifact_versions AS versions
			      JOIN shopping_profile_artifacts AS current ON current.user_id = versions.user_id
			      WHERE versions.user_id = ? AND versions.artifact_version <> current.artifact_version
			      ORDER BY versions.artifact_version DESC LIMIT 1 OFFSET ?`,
			Params: []any{userID, shoppingProfileArtifactRetention - 1},
		},
		cloudflare.Statement{
			SQL: `DELETE FROM shopping_profile_snapshot_jobs
			      WHERE user_id = ? AND lease_token = ? AND target_revision <= ?`,
			Params: []any{userID, leaseToken, revision},
		},
		cloudflare.Statement{
			SQL: `UPDATE shopping_profile_snapshot_jobs SET lease_token = NULL, lease_until = NULL
			      WHERE user_id = ? AND lease_token = ?`,
			Params: []any{userID, leaseToken},
		},
		cloudflare.Statement{
			SQL:    `SELECT 1 AS pending FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = ? LIMIT 1`,
			Params: []any{userID},
		},
	)
	if err != nil {
		return false, err
	}
	more := len(results) >= 7 && (len(results[3].Rows) > 0 || changed([]cloudflare.Result{results[5]}) > 0 || len(results[6].Rows) > 0)
	return more, nil
}

func (s *Store) finalizeUnchangedShoppingProfileSnapshot(ctx context.Context, userID, leaseToken string, revision int64, digest string, now time.Time) (bool, error) {
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `UPDATE shopping_profile_artifacts
			      SET profile_revision = ?, created_at = ?
			      WHERE user_id = ? AND content_sha256 = ? AND profile_revision < ?
			        AND EXISTS (
			          SELECT 1 FROM shopping_profile_revisions WHERE user_id = ? AND revision >= ?
			        )`,
			Params: []any{revision, now.UnixMilli(), userID, digest, revision, userID, revision},
		},
		cloudflare.Statement{
			SQL: `SELECT 1 AS overflow
			      FROM shopping_profile_artifact_versions AS versions
			      JOIN shopping_profile_artifacts AS current ON current.user_id = versions.user_id
			      WHERE versions.user_id = ? AND versions.artifact_version <> current.artifact_version
			      ORDER BY versions.artifact_version DESC LIMIT 1 OFFSET ?`,
			Params: []any{userID, shoppingProfileArtifactRetention - 1},
		},
		cloudflare.Statement{
			SQL: `DELETE FROM shopping_profile_snapshot_jobs
			      WHERE user_id = ? AND lease_token = ? AND target_revision <= ?`,
			Params: []any{userID, leaseToken, revision},
		},
		cloudflare.Statement{
			SQL: `UPDATE shopping_profile_snapshot_jobs SET lease_token = NULL, lease_until = NULL
			      WHERE user_id = ? AND lease_token = ?`,
			Params: []any{userID, leaseToken},
		},
		cloudflare.Statement{
			SQL:    `SELECT 1 AS pending FROM shopping_profile_artifact_cleanup_jobs WHERE user_id = ? LIMIT 1`,
			Params: []any{userID},
		},
	)
	if err != nil {
		return false, err
	}
	return len(results) >= 5 && (len(results[1].Rows) > 0 || changed([]cloudflare.Result{results[3]}) > 0 || len(results[4].Rows) > 0), nil
}

func decodeShoppingProfileArtifactVersion(raw json.RawMessage) (int64, error) {
	var row struct {
		ArtifactVersion int64 `json:"artifact_version"`
	}
	if json.Unmarshal(raw, &row) != nil || row.ArtifactVersion <= 0 {
		return 0, errors.New("decode shopping profile artifact version")
	}
	return row.ArtifactVersion, nil
}

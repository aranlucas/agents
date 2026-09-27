-- 007_shopping_profile_artifacts.sql
-- Add user-scoped references for versioned shopping-profile snapshots. This is
-- intentionally separate from grocery_resource_artifacts: that historical
-- table has a list/recipe-only CHECK constraint, and every migration is safely
-- replayable, so rebuilding it would be an unnecessary operational risk.

CREATE TABLE IF NOT EXISTS shopping_profile_artifacts (
    user_id TEXT PRIMARY KEY,
    scope_user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    profile_revision INTEGER NOT NULL CHECK (profile_revision > 0),
    artifact_version INTEGER NOT NULL CHECK (artifact_version > 0),
    content_sha256 TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_profile_revisions (
    user_id TEXT PRIMARY KEY,
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shopping_profile_snapshot_jobs (
    user_id TEXT PRIMARY KEY,
    target_revision INTEGER NOT NULL CHECK (target_revision > 0),
    lease_token TEXT,
    lease_until INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS shopping_profile_snapshot_jobs_ready
    ON shopping_profile_snapshot_jobs (lease_until, updated_at);

CREATE TABLE IF NOT EXISTS shopping_profile_artifact_versions (
    user_id TEXT NOT NULL,
    artifact_version INTEGER NOT NULL CHECK (artifact_version > 0),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, artifact_version)
);

CREATE TABLE IF NOT EXISTS shopping_profile_artifact_cleanup_jobs (
    user_id TEXT NOT NULL,
    artifact_version INTEGER NOT NULL CHECK (artifact_version > 0),
    requested_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, artifact_version)
);

-- Canonical profile rows reserve their per-user revision inside the same D1
-- transaction as the row change. The revision triggers below deliberately do
-- not watch artifact/outbox tables, so publishing can never mutate canonical
-- profile state.

CREATE TRIGGER IF NOT EXISTS pantry_items_profile_revision_insert
AFTER INSERT ON pantry_items
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS pantry_items_profile_revision_update
AFTER UPDATE ON pantry_items
WHEN OLD.user_id IS NOT NEW.user_id
  OR OLD.name IS NOT NEW.name
  OR OLD.name_key IS NOT NEW.name_key
  OR OLD.quantity IS NOT NEW.quantity
  OR OLD.added_at IS NOT NEW.added_at
  OR OLD.expires_at IS NOT NEW.expires_at
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS pantry_items_profile_revision_delete
AFTER DELETE ON pantry_items
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (OLD.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS equipment_items_profile_revision_insert
AFTER INSERT ON equipment_items
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS equipment_items_profile_revision_update
AFTER UPDATE ON equipment_items
WHEN OLD.user_id IS NOT NEW.user_id
  OR OLD.name IS NOT NEW.name
  OR OLD.name_key IS NOT NEW.name_key
  OR OLD.category IS NOT NEW.category
  OR OLD.added_at IS NOT NEW.added_at
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS equipment_items_profile_revision_delete
AFTER DELETE ON equipment_items
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (OLD.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS shopping_orders_profile_revision_insert
AFTER INSERT ON shopping_orders
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS shopping_orders_profile_revision_update
AFTER UPDATE ON shopping_orders
WHEN OLD.user_id IS NOT NEW.user_id
  OR OLD.total_items IS NOT NEW.total_items
  OR OLD.estimated_total IS NOT NEW.estimated_total
  OR OLD.placed_at IS NOT NEW.placed_at
  OR OLD.location_id IS NOT NEW.location_id
  OR OLD.notes IS NOT NEW.notes
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS shopping_orders_profile_revision_delete
AFTER DELETE ON shopping_orders
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (OLD.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS preferred_stores_profile_revision_insert
AFTER INSERT ON preferred_stores
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS preferred_stores_profile_revision_update
AFTER UPDATE ON preferred_stores
WHEN OLD.location_id IS NOT NEW.location_id
  OR OLD.name IS NOT NEW.name
  OR OLD.address IS NOT NEW.address
  OR OLD.chain IS NOT NEW.chain
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS preferred_stores_profile_revision_delete
AFTER DELETE ON preferred_stores
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (OLD.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

-- A first identity link creates an empty Clerk snapshot when no profile rows
-- exist yet. LinkKrogerAccount's conditional UPSERT emits no update trigger for
-- unchanged hourly relinks, so those calls create neither a revision nor a job.

CREATE TRIGGER IF NOT EXISTS kroger_account_links_profile_revision_insert
AFTER INSERT ON kroger_account_links
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.clerk_user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS kroger_account_links_profile_revision_update
AFTER UPDATE ON kroger_account_links
WHEN OLD.clerk_user_id IS NOT NEW.clerk_user_id
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.clerk_user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

-- Revision rows coalesce into one durable job per user. Active leases are left
-- intact; a publisher only acknowledges the row when it has caught up to the
-- latest target_revision.

CREATE TRIGGER IF NOT EXISTS shopping_profile_revisions_snapshot_job_insert
AFTER INSERT ON shopping_profile_revisions
BEGIN
    INSERT INTO shopping_profile_snapshot_jobs (user_id, target_revision, updated_at)
    VALUES (NEW.user_id, NEW.revision, NEW.updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
        target_revision = excluded.target_revision,
        updated_at = excluded.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS shopping_profile_revisions_snapshot_job_update
AFTER UPDATE ON shopping_profile_revisions
BEGIN
    INSERT INTO shopping_profile_snapshot_jobs (user_id, target_revision, updated_at)
    VALUES (NEW.user_id, NEW.revision, NEW.updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
        target_revision = excluded.target_revision,
        updated_at = excluded.updated_at;
END;

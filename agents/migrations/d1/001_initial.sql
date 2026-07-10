CREATE TABLE IF NOT EXISTS sessions (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    state_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (app_name, user_id, session_id)
);

CREATE INDEX IF NOT EXISTS sessions_identity_updated
    ON sessions (app_name, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS app_states (
    app_name TEXT PRIMARY KEY,
    state_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS user_states (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    state_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY (app_name, user_id)
);

CREATE TABLE IF NOT EXISTS session_events (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    invocation_id TEXT NOT NULL DEFAULT '',
    event_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (app_name, user_id, session_id, event_id),
    FOREIGN KEY (app_name, user_id, session_id)
        REFERENCES sessions (app_name, user_id, session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS session_events_order
    ON session_events (app_name, user_id, session_id, created_at, event_id);

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_limits (
    provider TEXT NOT NULL,
    minute_window INTEGER NOT NULL,
    request_count INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (provider, minute_window)
);

CREATE INDEX IF NOT EXISTS provider_limits_expiry ON provider_limits (expires_at);

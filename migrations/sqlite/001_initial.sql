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

CREATE TABLE IF NOT EXISTS pending_client_tools (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args_json TEXT NOT NULL,
    result_json TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'resolved')),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (app_name, user_id, thread_id, call_id)
);

CREATE INDEX IF NOT EXISTS pending_client_tools_expiry
    ON pending_client_tools (expires_at);

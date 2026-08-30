CREATE TABLE IF NOT EXISTS agui_active_runs (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
    stop_requested INTEGER NOT NULL DEFAULT 0 CHECK (stop_requested IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (app_name, user_id, thread_id)
);

CREATE INDEX IF NOT EXISTS agui_active_runs_expiry ON agui_active_runs (expires_at);

CREATE TABLE IF NOT EXISTS agui_active_run_events (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    event_index INTEGER NOT NULL,
    event_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (app_name, user_id, thread_id, run_id, event_index),
    FOREIGN KEY (app_name, user_id, thread_id)
        REFERENCES agui_active_runs (app_name, user_id, thread_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agui_active_run_events_order
    ON agui_active_run_events (app_name, user_id, thread_id, run_id, event_index);

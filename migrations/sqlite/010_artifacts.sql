CREATE TABLE IF NOT EXISTS artifacts (
    app_name TEXT NOT NULL,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    part_json TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (app_name, user_id, session_id, file_name, version)
);

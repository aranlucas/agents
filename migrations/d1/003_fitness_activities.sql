CREATE TABLE IF NOT EXISTS fitness_activities (
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_activity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sport_type TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    distance_m REAL,
    moving_time_s INTEGER,
    elapsed_time_s INTEGER,
    total_elevation_gain_m REAL,
    average_heartrate REAL,
    perceived_effort INTEGER,
    data_origin TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, source, source_activity_id)
);

CREATE INDEX IF NOT EXISTS fitness_activities_user_start
    ON fitness_activities (user_id, start_date DESC);

CREATE TABLE IF NOT EXISTS fitness_sync_sources (
    user_id TEXT NOT NULL,
    source TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    accepted_count INTEGER NOT NULL,
    PRIMARY KEY (user_id, source)
);

CREATE INDEX IF NOT EXISTS fitness_sync_sources_user_synced
    ON fitness_sync_sources (user_id, synced_at DESC);

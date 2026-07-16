CREATE TABLE IF NOT EXISTS households (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS household_members (
    household_id TEXT NOT NULL,
    clerk_user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (household_id, clerk_user_id),
    FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS household_members_user
    ON household_members (clerk_user_id);

CREATE TABLE IF NOT EXISTS household_invites (
    code TEXT PRIMARY KEY,
    household_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    max_uses INTEGER NOT NULL CHECK (max_uses > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grocery_lists (
    id TEXT PRIMARY KEY,
    household_id TEXT,
    owner_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS grocery_lists_household
    ON grocery_lists (household_id);

CREATE TABLE IF NOT EXISTS grocery_list_items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL,
    note TEXT,
    position INTEGER NOT NULL,
    added_by TEXT NOT NULL,
    checked_by TEXT,
    checked_at INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (list_id) REFERENCES grocery_lists (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS grocery_list_items_list
    ON grocery_list_items (list_id);

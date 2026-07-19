-- 006_shopping_profile.sql
-- Shopping-profile domains moved from the ai-shopping-mcp Worker's KV into D1,
-- plus the Kroger-sub -> Clerk identity link that unifies both surfaces.

CREATE TABLE IF NOT EXISTS pantry_items (
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    added_at INTEGER NOT NULL,
    expires_at INTEGER,
    PRIMARY KEY (user_id, name_key)
);

CREATE TABLE IF NOT EXISTS equipment_items (
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    category TEXT,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, name_key)
);

CREATE TABLE IF NOT EXISTS shopping_orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    total_items INTEGER NOT NULL,
    estimated_total REAL,
    placed_at INTEGER NOT NULL,
    location_id TEXT,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS shopping_orders_user
    ON shopping_orders (user_id, placed_at DESC);

CREATE TABLE IF NOT EXISTS shopping_order_items (
    order_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    upc TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price REAL,
    PRIMARY KEY (order_id, position),
    FOREIGN KEY (order_id) REFERENCES shopping_orders (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS preferred_stores (
    user_id TEXT PRIMARY KEY,
    location_id TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    chain TEXT NOT NULL DEFAULT '',
    set_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kroger_account_links (
    kroger_sub TEXT PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    linked_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS kroger_account_links_clerk
    ON kroger_account_links (clerk_user_id);

-- Side table instead of ALTER TABLE grocery_list_items ADD COLUMN: both the
-- production runner (runMigration in migrations.go) and
-- TestEmbeddedMigrationsExecuteTwiceAndProduceRequiredSchema execute every
-- migration's SQL twice against a real SQLite/D1 connection, and SQLite has
-- no ADD COLUMN IF NOT EXISTS, so a plain ALTER TABLE breaks idempotency on
-- the second run. CREATE TABLE IF NOT EXISTS keeps it idempotent without
-- touching shared migration-runner code.
CREATE TABLE IF NOT EXISTS grocery_list_item_upcs (
    item_id TEXT PRIMARY KEY,
    upc TEXT NOT NULL
);

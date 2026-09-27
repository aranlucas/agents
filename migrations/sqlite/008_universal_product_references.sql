-- 008_universal_product_references.sql
-- Provider-scoped product identities for lists and order history. Side tables
-- keep the migration idempotent and preserve the applied 006 schema.

CREATE TABLE IF NOT EXISTS grocery_list_item_product_refs (
    item_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    product_id TEXT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES grocery_list_items (id) ON UPDATE CASCADE ON DELETE CASCADE
);

INSERT OR IGNORE INTO grocery_list_item_product_refs (item_id, provider, product_id)
SELECT item_id, 'kroger', upc FROM grocery_list_item_upcs WHERE trim(upc) <> '';

CREATE TABLE IF NOT EXISTS shopping_order_item_product_refs (
    order_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    provider TEXT NOT NULL,
    product_id TEXT NOT NULL,
    PRIMARY KEY (order_id, position),
    FOREIGN KEY (order_id) REFERENCES shopping_orders (id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO shopping_order_item_product_refs (order_id, position, provider, product_id)
SELECT order_id, position, 'kroger', upc FROM shopping_order_items WHERE trim(upc) <> '';

CREATE TABLE IF NOT EXISTS preferred_store_providers (
    user_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES preferred_stores (user_id) ON UPDATE CASCADE ON DELETE CASCADE
);

INSERT OR IGNORE INTO preferred_store_providers (user_id, provider)
SELECT user_id, 'kroger' FROM preferred_stores;

-- Parent preferred-store triggers already cover creates and deletes. This
-- trigger covers the only new change they cannot see: switching provider while
-- retaining the same provider-scoped store id and display fields.
CREATE TRIGGER IF NOT EXISTS preferred_store_providers_profile_revision_update
AFTER UPDATE OF provider ON preferred_store_providers
WHEN OLD.provider IS NOT NEW.provider
BEGIN
    INSERT INTO shopping_profile_revisions (user_id, revision, updated_at)
    VALUES (NEW.user_id, 1, CAST(strftime('%s', 'now') AS INTEGER))
    ON CONFLICT(user_id) DO UPDATE SET
        revision = shopping_profile_revisions.revision + 1,
        updated_at = excluded.updated_at;
END;

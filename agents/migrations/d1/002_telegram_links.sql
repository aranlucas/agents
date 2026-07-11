CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    token_hash TEXT PRIMARY KEY,
    telegram_user_id INTEGER NOT NULL,
    telegram_chat_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    consumed_at INTEGER,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS telegram_link_tokens_expiry
    ON telegram_link_tokens (expires_at);

CREATE TABLE IF NOT EXISTS telegram_account_links (
    telegram_user_id INTEGER PRIMARY KEY,
    clerk_user_id TEXT NOT NULL,
    telegram_chat_id INTEGER NOT NULL,
    linked_at INTEGER NOT NULL,
    unlinked_at INTEGER
);

CREATE INDEX IF NOT EXISTS telegram_account_links_clerk
    ON telegram_account_links (clerk_user_id, unlinked_at);

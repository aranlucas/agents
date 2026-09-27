CREATE INDEX IF NOT EXISTS grocery_lists_owner
    ON grocery_lists (owner_user_id, household_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS grocery_resource_artifacts (
    resource_type TEXT NOT NULL CHECK (resource_type IN ('list', 'recipe')),
    resource_id TEXT NOT NULL,
    scope_user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (resource_type, resource_id)
);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    household_id TEXT,
    owner_user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    servings TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (household_id) REFERENCES households (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recipes_owner
    ON recipes (owner_user_id, household_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS recipes_household
    ON recipes (household_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity TEXT NOT NULL DEFAULT '',
    unit TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recipe_ingredients_recipe
    ON recipe_ingredients (recipe_id, position, id);

CREATE TABLE IF NOT EXISTS recipe_steps (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL,
    instruction TEXT NOT NULL,
    position INTEGER NOT NULL,
    FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recipe_steps_recipe
    ON recipe_steps (recipe_id, position, id);

CREATE TABLE IF NOT EXISTS recipe_tags (
    recipe_id TEXT NOT NULL,
    tag TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (recipe_id, tag),
    FOREIGN KEY (recipe_id) REFERENCES recipes (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recipe_tags_recipe
    ON recipe_tags (recipe_id, position, tag);

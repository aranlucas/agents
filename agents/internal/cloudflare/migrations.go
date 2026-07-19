package cloudflare

import (
	"context"
	"fmt"
	"strings"
	"time"

	"agents/migrations/d1"
)

// LatestMigrationVersion is the newest schema marker reported by migration
// diagnostics. Readiness requires every marker in migrations. Keep existing
// version strings stable; append instead of editing or renaming applied work.
const LatestMigrationVersion = "007_shopping_profile_artifacts"

type migration struct {
	version string
	source  string
}

var migrations = []migration{
	{version: "001_initial", source: d1migrations.Initial},
	{version: "002_telegram_links", source: d1migrations.TelegramLinks},
	{version: "003_fitness_activities", source: d1migrations.FitnessActivities},
	{version: "004_shared_lists", source: d1migrations.SharedLists},
	{version: "005_saved_grocery_resources", source: d1migrations.SavedGroceryResources},
	{version: "006_shopping_profile", source: d1migrations.ShoppingProfile},
	{version: LatestMigrationVersion, source: d1migrations.ShoppingProfileArtifacts},
}

type schemaTable struct {
	name    string
	columns []string
}

var requiredSchemaTables = []schemaTable{
	{name: "sessions", columns: []string{"app_name", "user_id", "session_id", "state_json", "created_at", "updated_at", "expires_at"}},
	{name: "app_states", columns: []string{"app_name", "state_json"}},
	{name: "user_states", columns: []string{"app_name", "user_id", "state_json"}},
	{name: "session_events", columns: []string{"app_name", "user_id", "session_id", "event_id", "invocation_id", "event_json", "created_at"}},
	{name: "schema_migrations", columns: []string{"version", "applied_at"}},
	{name: "provider_limits", columns: []string{"provider", "minute_window", "request_count", "expires_at"}},
	{name: "pending_client_tools", columns: []string{"app_name", "user_id", "thread_id", "call_id", "tool_name", "args_json", "result_json", "status", "created_at", "expires_at"}},
	{name: "telegram_link_tokens", columns: []string{"token_hash", "telegram_user_id", "telegram_chat_id", "expires_at", "consumed_at", "created_at"}},
	{name: "telegram_account_links", columns: []string{"telegram_user_id", "clerk_user_id", "telegram_chat_id", "linked_at", "unlinked_at"}},
	{name: "fitness_activities", columns: []string{"user_id", "source", "source_activity_id", "name", "sport_type", "start_date", "end_date", "distance_m", "moving_time_s", "elapsed_time_s", "total_elevation_gain_m", "average_heartrate", "perceived_effort", "data_origin", "updated_at"}},
	{name: "fitness_sync_sources", columns: []string{"user_id", "source", "synced_at", "accepted_count"}},
	{name: "households", columns: []string{"id", "name", "created_by", "created_at"}},
	{name: "household_members", columns: []string{"household_id", "clerk_user_id", "role", "joined_at"}},
	{name: "household_invites", columns: []string{"code", "household_id", "created_by", "expires_at", "max_uses", "used_count"}},
	{name: "grocery_lists", columns: []string{"id", "household_id", "owner_user_id", "title", "status", "created_at", "updated_at"}},
	{name: "grocery_list_items", columns: []string{"id", "list_id", "name", "quantity", "note", "position", "added_by", "checked_by", "checked_at", "updated_at"}},
	{name: "grocery_resource_artifacts", columns: []string{"resource_type", "resource_id", "scope_user_id", "file_name", "version", "created_at"}},
	{name: "shopping_profile_artifacts", columns: []string{"user_id", "scope_user_id", "file_name", "profile_revision", "artifact_version", "content_sha256", "created_at"}},
	{name: "shopping_profile_revisions", columns: []string{"user_id", "revision", "updated_at"}},
	{name: "shopping_profile_snapshot_jobs", columns: []string{"user_id", "target_revision", "lease_token", "lease_until", "attempts", "updated_at"}},
	{name: "shopping_profile_artifact_versions", columns: []string{"user_id", "artifact_version", "created_at"}},
	{name: "shopping_profile_artifact_cleanup_jobs", columns: []string{"user_id", "artifact_version", "requested_at"}},
	{name: "recipes", columns: []string{"id", "household_id", "owner_user_id", "title", "description", "servings", "notes", "status", "created_at", "updated_at"}},
	{name: "recipe_ingredients", columns: []string{"id", "recipe_id", "name", "quantity", "unit", "note", "position"}},
	{name: "recipe_steps", columns: []string{"id", "recipe_id", "instruction", "position"}},
	{name: "recipe_tags", columns: []string{"recipe_id", "tag", "position"}},
	{name: "pantry_items", columns: []string{"user_id", "name", "name_key", "quantity", "added_at", "expires_at"}},
	{name: "equipment_items", columns: []string{"user_id", "name", "name_key", "category", "added_at"}},
	{name: "shopping_orders", columns: []string{"id", "user_id", "total_items", "estimated_total", "placed_at", "location_id", "notes"}},
	{name: "shopping_order_items", columns: []string{"order_id", "position", "upc", "name", "quantity", "price"}},
	{name: "preferred_stores", columns: []string{"user_id", "location_id", "name", "address", "chain", "set_at"}},
	{name: "kroger_account_links", columns: []string{"kroger_sub", "clerk_user_id", "linked_at"}},
	{name: "grocery_list_item_upcs", columns: []string{"item_id", "upc"}},
}

var requiredSchemaIndexes = []string{
	"sessions_identity_updated",
	"sessions_expiry",
	"session_events_order",
	"provider_limits_expiry",
	"pending_client_tools_expiry",
	"telegram_link_tokens_expiry",
	"telegram_account_links_clerk",
	"fitness_activities_user_start",
	"fitness_sync_sources_user_synced",
	"household_members_user",
	"grocery_lists_household",
	"grocery_lists_owner",
	"grocery_list_items_list",
	"recipes_owner",
	"recipes_household",
	"recipe_ingredients_recipe",
	"recipe_steps_recipe",
	"recipe_tags_recipe",
	"shopping_orders_user",
	"kroger_account_links_clerk",
	"shopping_profile_snapshot_jobs_ready",
}

var requiredSchemaTriggers = []string{
	"pantry_items_profile_revision_insert",
	"pantry_items_profile_revision_update",
	"pantry_items_profile_revision_delete",
	"equipment_items_profile_revision_insert",
	"equipment_items_profile_revision_update",
	"equipment_items_profile_revision_delete",
	"shopping_orders_profile_revision_insert",
	"shopping_orders_profile_revision_update",
	"shopping_orders_profile_revision_delete",
	"preferred_stores_profile_revision_insert",
	"preferred_stores_profile_revision_update",
	"preferred_stores_profile_revision_delete",
	"kroger_account_links_profile_revision_insert",
	"kroger_account_links_profile_revision_update",
	"shopping_profile_revisions_snapshot_job_insert",
	"shopping_profile_revisions_snapshot_job_update",
}

func migrationVersions() []string {
	versions := make([]string, 0, len(migrations))
	for _, item := range migrations {
		versions = append(versions, item.version)
	}
	return versions
}

// RunMigrations applies the embedded idempotent D1 schema.
func (d *D1) RunMigrations(ctx context.Context) error {
	for _, item := range migrations {
		if err := d.runMigration(ctx, item.version, item.source); err != nil {
			return err
		}
	}
	return nil
}

func (d *D1) runMigration(ctx context.Context, version, source string) error {
	statements := make([]Statement, 0)
	for _, sql := range splitMigrationStatements(source) {
		statements = append(statements, Statement{SQL: sql})
	}
	statements = append(statements, Statement{
		SQL:    "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)",
		Params: []any{version, time.Now().UTC().UnixMilli()},
	})
	if _, err := d.Run(ctx, statements...); err != nil {
		return fmt.Errorf("apply D1 migration %s: %w", version, err)
	}
	return nil
}

// splitMigrationStatements preserves CREATE TRIGGER bodies, whose internal
// semicolons cannot be split into separate D1 batch statements. Repository
// migrations keep one top-level statement terminator at the end of a line.
func splitMigrationStatements(source string) []string {
	var statements []string
	var current strings.Builder
	inTrigger := false
	flush := func() {
		statement := strings.TrimSpace(current.String())
		statement = strings.TrimSpace(strings.TrimSuffix(statement, ";"))
		if statement != "" {
			statements = append(statements, statement)
		}
		current.Reset()
	}
	for line := range strings.SplitSeq(source, "\n") {
		trimmed := strings.TrimSpace(line)
		if !inTrigger && strings.HasPrefix(strings.ToUpper(trimmed), "CREATE TRIGGER ") {
			inTrigger = true
		}
		current.WriteString(line)
		current.WriteByte('\n')
		if inTrigger {
			if strings.EqualFold(trimmed, "END;") {
				flush()
				inTrigger = false
			}
			continue
		}
		if strings.HasSuffix(trimmed, ";") {
			flush()
		}
	}
	flush()
	return statements
}

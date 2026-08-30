// Package d1migrations embeds the D1 schema into the Go gateway binary.
package d1migrations

import _ "embed"

// Initial is the idempotent initial D1 schema.
//
//go:embed 001_initial.sql
var Initial string

// TelegramLinks is the idempotent Telegram account-link schema.
//
//go:embed 002_telegram_links.sql
var TelegramLinks string

// FitnessActivities is the provider-neutral workout sync schema.
//
//go:embed 003_fitness_activities.sql
var FitnessActivities string

// SharedLists is the household and shared grocery-list schema.
//
//go:embed 004_shared_lists.sql
var SharedLists string

// SavedGroceryResources is the personal/shared list library, recipe library,
// and ADK artifact reference schema.
//
//go:embed 005_saved_grocery_resources.sql
var SavedGroceryResources string

// ShoppingProfile is the pantry/equipment/orders/preferred-store schema and
// the Kroger account-link table.
//
//go:embed 006_shopping_profile.sql
var ShoppingProfile string

// ShoppingProfileArtifacts stores references to versioned user
// shopping-profile snapshots.
//
//go:embed 007_shopping_profile_artifacts.sql
var ShoppingProfileArtifacts string

// UniversalProductReferences stores provider-scoped product and store identities
// without changing the history of already-applied shopping migrations.
//
//go:embed 008_universal_product_references.sql
var UniversalProductReferences string

// AGUIActiveRuns contains the cross-replica AG-UI execution lease and replay journal.
//
//go:embed 009_agui_active_runs.sql
var AGUIActiveRuns string

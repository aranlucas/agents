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

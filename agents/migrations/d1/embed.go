// Package d1migrations embeds the D1 schema into the Go gateway binary.
package d1migrations

import _ "embed"

// Initial is the idempotent initial D1 schema.
//
//go:embed 001_initial.sql
var Initial string

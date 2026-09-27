// Package sqlmigrations embeds the SQLite schema into the service binary.
package sqlmigrations

import "embed"

// FS holds the migrations. Files apply in name order and each file name
// (without .sql) is its permanent version.
//
//go:embed *.sql
var FS embed.FS

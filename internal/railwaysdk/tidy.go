//go:build tidy

// Package railwaysdk keeps the Railway Go SDK in go.mod. Only
// .railway/railway.go imports it, and ./... skips dot directories, so
// go mod tidy would otherwise drop it. The tidy tag keeps this file out of
// every build.
package railwaysdk

import _ "github.com/railwayapp/railway-go-sdk"

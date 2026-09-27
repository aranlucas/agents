// Package jobs implements authenticated job matching and application drafting.
package jobs

import _ "embed"

// Instruction uses only the authenticated user's supplied career evidence.
//
//go:embed instructions.md
var Instruction string

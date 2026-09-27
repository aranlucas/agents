// Package jobs implements Lucas's private job-matching and application-drafting
// assistant for the Go ADK runtime.
package jobs

import (
	_ "embed"
	"strings"
)

//go:embed instructions.md
var instructionTemplate string

//go:embed resume.md
var resumeText string

// Instruction is grounded in Lucas's canonical resume. The agent is
// authenticated and may also use user-supplied private application-profile
// state.
var Instruction = strings.ReplaceAll(instructionTemplate, "{{RESUME}}", resumeText)

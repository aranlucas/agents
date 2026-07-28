// Package jobs implements Lucas's private job-matching and application-drafting
// assistant for the Go ADK runtime.
package jobs

import (
	_ "embed"
	"strings"

	"agents/resume"
)

//go:embed instructions.md
var instructionTemplate string

// Instruction is grounded in the same canonical resume as the public Resume
// agent, but the Jobs agent is authenticated and may also use user-supplied
// private application-profile state.
var Instruction = strings.ReplaceAll(instructionTemplate, "{{RESUME}}", resume.SourceText())

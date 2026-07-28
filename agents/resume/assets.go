// Package resume implements the public resume assistant for the Go ADK
// runtime: grounded Q&A plus an optional stateful job-fit workflow.
package resume

import (
	_ "embed"
	"strings"
)

//go:embed instructions.md
var instructionTemplate string

//go:embed resume.md
var resumeText string

// SourceText returns the canonical embedded resume used to ground authenticated
// personal workflows without duplicating a second, drift-prone resume file.
func SourceText() string {
	return resumeText
}

// Instruction is the resume agent's full instruction, with the {{RESUME}}
// placeholder resolved to the embedded resume content. Mirrors the Python
// resume agent's INSTRUCTION construction in
// agents/resume/src/resume_agent/agent.py.
var Instruction = strings.ReplaceAll(instructionTemplate, "{{RESUME}}", resumeText)

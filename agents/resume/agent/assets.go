// Package resume implements the public resume Q&A agent for the Go ADK
// runtime: a Q&A surface over Lucas Arango's professional background, with
// no authentication and no tools.
package resume

import (
	_ "embed"
	"strings"
)

//go:embed instructions.md
var instructionTemplate string

//go:embed resume.md
var resumeText string

// Instruction is the resume agent's full instruction, with the {{RESUME}}
// placeholder resolved to the embedded resume content. Mirrors the Python
// resume agent's INSTRUCTION construction in
// agents/resume/src/resume_agent/agent.py.
var Instruction = strings.ReplaceAll(instructionTemplate, "{{RESUME}}", resumeText)

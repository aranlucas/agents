package agentruntime

import "google.golang.org/adk/v2/session/compaction"

// DefaultCompaction summarizes completed windows without repeatedly compressing
// earlier summaries. Live recall failed with rolling tail retention, so it is
// restricted to the recall experiment. Sliding summaries still grow with the
// conversation; neither strategy guarantees retention of every detail. ADK
// keeps original events and structured session state in SQLite.
func DefaultCompaction() *compaction.Config {
	return &compaction.Config{CompactionInterval: 8}
}

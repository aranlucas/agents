package trends

import (
	"errors"
	"regexp"
	"strings"
)

var ErrUnsafeSQL = errors.New("unsafe Trends SQL")

var (
	forbiddenSQL = regexp.MustCompile(`(?i)\b(INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|CALL|EXPORT|LOAD)\b`)
	limitSQL     = regexp.MustCompile(`(?i)\bLIMIT\s+[0-9]+\b`)
)

func CleanSQL(sql string) string {
	value := strings.ReplaceAll(sql, "```sql", "")
	value = strings.ReplaceAll(value, "```SQL", "")
	value = strings.ReplaceAll(value, "```", "")
	return strings.TrimSpace(value)
}

func ValidateSQL(sql string) error {
	normalized := CleanSQL(sql)
	trimmed := strings.TrimSpace(strings.TrimSuffix(normalized, ";"))
	upper := strings.ToUpper(trimmed)
	if trimmed == "" || strings.Contains(trimmed, ";") || forbiddenSQL.MatchString(trimmed) {
		return ErrUnsafeSQL
	}
	if !strings.HasPrefix(upper, "SELECT ") && !strings.HasPrefix(upper, "WITH ") {
		return ErrUnsafeSQL
	}
	if !limitSQL.MatchString(trimmed) {
		return ErrUnsafeSQL
	}
	return nil
}

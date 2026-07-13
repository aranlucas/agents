package trends

import (
	"errors"
	"regexp"
	"strings"
)

var ErrUnsafeSQL = errors.New("unsafe Trends SQL")

var (
	forbiddenSQL  = regexp.MustCompile(`(?i)\b(INSERT|UPDATE|DELETE|MERGE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|CALL|EXPORT|LOAD)\b`)
	limitSQL      = regexp.MustCompile(`(?i)\bLIMIT\s+[0-9]+\b`)
	usDMATableSQL = regexp.MustCompile("(?i)`bigquery-public-data\\.google_trends\\.(top_terms|top_rising_terms)`")
	dmaColumnSQL  = regexp.MustCompile(`(?i)\bdma_(id|name)\b`)
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
	fields := strings.Fields(upper)
	if len(fields) == 0 || (fields[0] != "SELECT" && fields[0] != "WITH") {
		return ErrUnsafeSQL
	}
	if !limitSQL.MatchString(trimmed) {
		return ErrUnsafeSQL
	}
	if usDMATableSQL.MatchString(trimmed) && !dmaColumnSQL.MatchString(trimmed) {
		return ErrUnsafeSQL
	}
	return nil
}

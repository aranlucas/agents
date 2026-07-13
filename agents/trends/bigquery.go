package trends

import (
	"context"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/googleapi"
	"google.golang.org/api/iterator"
)

const (
	defaultRowLimit = 100
	// DefaultMaxBytesBilled keeps every query cost-bounded while allowing the
	// current public Trends tables, which require just over 2 GiB to scan.
	DefaultMaxBytesBilled = 4 << 30
)

var (
	errBigQueryFailed             = errors.New("BigQuery query failed")
	errBigQueryResultFailed       = errors.New("BigQuery result failed")
	errBigQueryBytesLimitExceeded = errors.New("BigQuery bytes billed limit exceeded")
)

type BigQueryExecutor struct {
	client         *bigquery.Client
	project        string
	dataset        string
	maxBytesBilled int64
	timeout        time.Duration
	rowLimit       int
}

func NewBigQueryExecutor(client *bigquery.Client, project, dataset string, maxBytesBilled int64, timeout time.Duration) (*BigQueryExecutor, error) {
	if client == nil || strings.TrimSpace(project) == "" || strings.TrimSpace(dataset) == "" {
		return nil, errors.New("BigQuery client, project, and dataset are required")
	}
	if maxBytesBilled <= 0 {
		maxBytesBilled = DefaultMaxBytesBilled
	}
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &BigQueryExecutor{client: client, project: project, dataset: dataset, maxBytesBilled: maxBytesBilled, timeout: timeout, rowLimit: defaultRowLimit}, nil
}

func (e *BigQueryExecutor) ExecuteBigQuery(ctx context.Context, sql string) (ColumnsRows, error) {
	if err := ValidateSQL(sql); err != nil {
		return ColumnsRows{}, err
	}
	if err := e.validateTables(sql); err != nil {
		return ColumnsRows{}, err
	}
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()
	query := e.client.Query(CleanSQL(sql))
	query.DefaultProjectID, query.DefaultDatasetID = e.project, e.dataset
	query.MaxBytesBilled, query.JobTimeout = e.maxBytesBilled, e.timeout
	query.UseLegacySQL = false
	rows, err := query.Read(ctx)
	if err != nil {
		log.Printf("trends BigQuery query failed: %v", err)
		return ColumnsRows{}, classifyBigQueryError(err)
	}
	result := ColumnsRows{Columns: []string{}, Rows: []Row{}}
	for _, field := range rows.Schema {
		result.Columns = append(result.Columns, field.Name)
	}
	for len(result.Rows) < e.rowLimit {
		var values []bigquery.Value
		if err := rows.Next(&values); errors.Is(err, iterator.Done) {
			break
		} else if err != nil {
			log.Printf("trends BigQuery result iteration failed: %v", err)
			return ColumnsRows{}, errBigQueryResultFailed
		}
		if len(result.Columns) == 0 {
			for _, field := range rows.Schema {
				result.Columns = append(result.Columns, field.Name)
			}
		}
		row := make(Row, len(result.Columns))
		for index, column := range result.Columns {
			if index < len(values) {
				row[column] = normalizeValue(values[index])
			}
		}
		result.Rows = append(result.Rows, row)
	}
	return result, nil
}

func classifyBigQueryError(err error) error {
	var apiError *googleapi.Error
	if errors.As(err, &apiError) {
		for _, detail := range apiError.Errors {
			if detail.Reason == "bytesBilledLimitExceeded" {
				return errBigQueryBytesLimitExceeded
			}
		}
	}
	return errBigQueryFailed
}

func (e *BigQueryExecutor) validateTables(sql string) error {
	for _, match := range regexpBackticks.FindAllStringSubmatch(sql, -1) {
		parts := strings.Split(match[1], ".")
		if len(parts) != 3 || parts[0] != e.project || parts[1] != e.dataset {
			return fmt.Errorf("%w: table outside configured dataset", ErrUnsafeSQL)
		}
	}
	return nil
}

var regexpBackticks = regexp.MustCompile("`([^`]+)`")

func normalizeValue(value bigquery.Value) any {
	switch typed := value.(type) {
	case time.Time:
		return typed.Format(time.RFC3339Nano)
	case []bigquery.Value:
		result := make([]any, 0, len(typed))
		for _, entry := range typed {
			result = append(result, normalizeValue(entry))
		}
		return result
	case map[string]bigquery.Value:
		result := make(map[string]any, len(typed))
		for key, entry := range typed {
			result[key] = normalizeValue(entry)
		}
		return result
	case nil, string, int64, float64, bool:
		return typed
	default:
		return fmt.Sprint(typed)
	}
}

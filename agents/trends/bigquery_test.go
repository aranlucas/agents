package trends

import (
	"errors"
	"testing"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/googleapi"
)

func TestNewBigQueryExecutorUsesFourGiBDefault(t *testing.T) {
	executor, err := NewBigQueryExecutor(&bigquery.Client{}, "project", "dataset", 0, 0)
	if err != nil {
		t.Fatal(err)
	}
	if DefaultMaxBytesBilled != 4<<30 {
		t.Fatalf("DefaultMaxBytesBilled = %d, want %d", int64(DefaultMaxBytesBilled), int64(4<<30))
	}
	if executor.maxBytesBilled != DefaultMaxBytesBilled {
		t.Fatalf("maxBytesBilled = %d, want %d", executor.maxBytesBilled, int64(DefaultMaxBytesBilled))
	}
}

func TestClassifyBigQueryErrorRecognizesBytesBilledLimit(t *testing.T) {
	err := classifyBigQueryError(&googleapi.Error{
		Code:   400,
		Errors: []googleapi.ErrorItem{{Reason: "bytesBilledLimitExceeded"}},
	})
	if !errors.Is(err, errBigQueryBytesLimitExceeded) {
		t.Fatalf("classifyBigQueryError() = %v, want bytes billed limit error", err)
	}
}

func TestClassifyBigQueryErrorKeepsOtherFailuresGeneric(t *testing.T) {
	err := classifyBigQueryError(&googleapi.Error{
		Code:   403,
		Errors: []googleapi.ErrorItem{{Reason: "accessDenied"}},
	})
	if !errors.Is(err, errBigQueryFailed) {
		t.Fatalf("classifyBigQueryError() = %v, want generic query error", err)
	}
}

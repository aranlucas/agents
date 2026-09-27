package common

import (
	"context"
	"errors"
	"testing"
)

type stubChecker struct{ err error }

func (c stubChecker) Health(context.Context) error { return c.err }

func TestReadyChecksReportsConfiguredAndMissingDependencies(t *testing.T) {
	checks := ReadyChecks(t.Context(), map[string]HealthChecker{
		"d1": stubChecker{},
		"r2": stubChecker{err: errors.New("down")},
		"s3": nil,
	})
	if checks["d1"] != "ok" || checks["r2"] != "unavailable" || checks["s3"] != "unconfigured" {
		t.Fatalf("checks = %#v", checks)
	}
}

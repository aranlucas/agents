package common

import (
	"context"
	"sync"
)

// HealthChecker is satisfied by *storage.DB.
type HealthChecker interface {
	Health(context.Context) error
}

// ReadyChecks reports "ok", "unavailable", or "unconfigured" for each named
// dependency. Checks run concurrently so they share the caller's deadline.
func ReadyChecks(ctx context.Context, checkers map[string]HealthChecker) map[string]string {
	checks := make(map[string]string, len(checkers))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for name, checker := range checkers {
		wg.Go(func() {
			status := "unconfigured"
			if checker != nil {
				status = "ok"
				if err := checker.Health(ctx); err != nil {
					status = "unavailable"
				}
			}
			mu.Lock()
			checks[name] = status
			mu.Unlock()
		})
	}
	wg.Wait()
	return checks
}

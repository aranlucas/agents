package common

import (
	"testing"
	"time"
)

type fixedClock struct{ now time.Time }

func (c fixedClock) Now() time.Time { return c.now }

func TestDateDetailsUsesUTCClock(t *testing.T) {
	got := DateDetails(fixedClock{now: time.Date(2026, 9, 16, 23, 0, 0, 0, time.FixedZone("PDT", -7*60*60))})
	if got != (CurrentDate{Date: "2026-09-17", Weekday: "Thursday", Month: "September 2026"}) {
		t.Fatalf("date = %#v", got)
	}
}

func TestCurrentDateToolBuilds(t *testing.T) {
	built, err := CurrentDateTool()
	if err != nil || built == nil || built.Name() != "get_current_date" {
		t.Fatalf("tool/err = %#v / %v", built, err)
	}
}

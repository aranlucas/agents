package common

import "time"

type Clock interface{ Now() time.Time }
type realClock struct{}

func (realClock) Now() time.Time { return time.Now() }

// Today returns the current UTC date in ISO 8601 form.
func Today(clock Clock) string {
	if clock == nil {
		clock = realClock{}
	}
	return clock.Now().UTC().Format(time.DateOnly)
}

type CurrentDate struct{ Date, Weekday, Month string }

func DateDetails(clock Clock) CurrentDate {
	if clock == nil {
		clock = realClock{}
	}
	now := clock.Now().UTC()
	return CurrentDate{Date: now.Format(time.DateOnly), Weekday: now.Format("Monday"), Month: now.Format("January 2006")}
}

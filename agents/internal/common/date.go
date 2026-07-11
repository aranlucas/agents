package common

import "time"

type (
	Clock     interface{ Now() time.Time }
	realClock struct{}
)

func (realClock) Now() time.Time { return time.Now() }

type CurrentDate struct{ Date, Weekday, Month string }

func DateDetails(clock Clock) CurrentDate {
	if clock == nil {
		clock = realClock{}
	}
	now := clock.Now().UTC()
	return CurrentDate{Date: now.Format(time.DateOnly), Weekday: now.Format("Monday"), Month: now.Format("January 2006")}
}

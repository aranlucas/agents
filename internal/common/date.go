package common

import (
	"time"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/tool"
	"google.golang.org/adk/v2/tool/functiontool"
)

type (
	Clock     interface{ Now() time.Time }
	realClock struct{}
)

func (realClock) Now() time.Time { return time.Now() }

type CurrentDate struct{ Date, Weekday, Month string }

type currentDateArgs struct{}

type currentDateResult struct {
	OK      bool   `json:"ok"`
	Date    string `json:"date,omitempty"`
	Weekday string `json:"weekday,omitempty"`
	Month   string `json:"month,omitempty"`
}

func DateDetails(clock Clock) CurrentDate {
	if clock == nil {
		clock = realClock{}
	}
	now := clock.Now().UTC()
	return CurrentDate{Date: now.Format(time.DateOnly), Weekday: now.Format("Monday"), Month: now.Format("January 2006")}
}

func CurrentDateTool() (tool.Tool, error) {
	return functiontool.New(functiontool.Config{
		Name:        "get_current_date",
		Description: "Return the current UTC date.",
	}, getCurrentDate)
}

func getCurrentDate(_ agent.Context, _ currentDateArgs) (currentDateResult, error) {
	date := DateDetails(nil)
	return currentDateResult{OK: true, Date: date.Date, Weekday: date.Weekday, Month: date.Month}, nil
}

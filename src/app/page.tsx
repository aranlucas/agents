"use client";

import { useRenderToolCall } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { FlightResults } from "@/components/flight-results";
import { DateResults } from "@/components/date-results";

function PlaneSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: "1.25rem", height: "1.25rem", color: "var(--amber)" }}
    >
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

export default function Page() {
  useRenderToolCall(
    {
      name: "search_flights",
      render: ({ args, result }) => (
        <FlightResults
          args={args as Record<string, string>}
          result={result as string | undefined}
        />
      ),
    },
    []
  );

  useRenderToolCall(
    {
      name: "search_dates",
      render: ({ args, result }) => (
        <DateResults
          args={args as Record<string, string>}
          result={result as string | undefined}
        />
      ),
    },
    []
  );

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      <CopilotSidebar
        disableSystemMessage={true}
        clickOutsideToClose={false}
        defaultOpen={true}
        labels={{
          title: "Weekend Trips",
          initial: "Where do you want to escape to this weekend?",
        }}
        suggestions={[
          {
            title: "Vegas this weekend",
            message: "Find flights from Seattle to Las Vegas this weekend",
          },
          {
            title: "SF getaway",
            message:
              "Cheapest weekend to fly from Seattle to San Francisco in the next 6 weeks?",
          },
          {
            title: "LA quick trip",
            message: "Direct flights from Seattle to Los Angeles next Saturday",
          },
          {
            title: "Denver escape",
            message: "Find flights from Seattle to Denver for a weekend in May",
          },
        ]}
      >
        {/* Main canvas — shown when no results rendered */}
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "4rem 2rem",
          }}
        >
          {/* Logo / wordmark */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              marginBottom: "1.25rem",
            }}
          >
            <PlaneSvg />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.65rem",
                letterSpacing: "0.25em",
                color: "var(--amber)",
                textTransform: "uppercase",
              }}
            >
              SEA WEEKEND TRIPS
            </span>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 300,
              fontSize: "clamp(3.5rem, 10vw, 6rem)",
              lineHeight: 0.9,
              letterSpacing: "-0.01em",
              color: "var(--cream)",
              textAlign: "center",
              marginBottom: "1.5rem",
            }}
          >
            Escape
            <br />
            <em
              style={{
                fontStyle: "italic",
                color: "var(--amber)",
              }}
            >
              this weekend.
            </em>
          </h1>

          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--cream-muted)",
              letterSpacing: "0.1em",
              textAlign: "center",
              maxWidth: "22rem",
              lineHeight: 1.8,
            }}
          >
            Weekend trip planner flying out of Seattle.
            Find cheap flights and the best travel dates.
          </p>

          {/* Decorative departure board strip */}
          <div
            style={{
              marginTop: "3rem",
              display: "flex",
              gap: "1.5rem",
              opacity: 0.35,
            }}
          >
            {["SEA", "SFO", "LAX", "LAS", "DEN", "ORD", "JFK"].map(
              (code) => (
                <span
                  key={code}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.12em",
                    color: "var(--amber)",
                  }}
                >
                  {code}
                </span>
              )
            )}
          </div>
        </div>
      </CopilotSidebar>
    </main>
  );
}

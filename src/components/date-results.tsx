"use client";

import { DateSearchResult, DatePrice } from "@/lib/types";

function formatDate(dateValue: string | string[]): { day: string; month: string; weekday: string } {
  const dateStr = Array.isArray(dateValue) ? dateValue[0] : dateValue;
  try {
    const d = new Date(dateStr + "T12:00:00");
    return {
      day: d.toLocaleDateString("en-US", { day: "2-digit" }),
      month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase(),
    };
  } catch {
    return { day: dateStr, month: "", weekday: "" };
  }
}

export function DateResults({
  args,
  result,
}: {
  args: Record<string, string>;
  result?: DateSearchResult | string;
}) {
  const from = args?.departure_airport ?? args?.from ?? "???";
  const to = args?.arrival_airport ?? args?.to ?? "???";

  const parsed: DateSearchResult | null =
    result == null
      ? null
      : typeof result === "string"
      ? tryParse(result)
      : result;

  const dates: DatePrice[] = (
    parsed?.dates ?? parsed?.cheapest_dates ?? []
  ).sort((a, b) => a.price - b.price);

  const isLoading = result == null;
  const minPrice = dates.length ? dates[0].price : null;
  const maxPrice = dates.length ? dates[dates.length - 1].price : null;

  const priceRange = maxPrice && minPrice ? maxPrice - minPrice : 1;

  function priceColor(price: number): string {
    if (!minPrice || !maxPrice || priceRange === 0) return "var(--cream-muted)";
    const ratio = (price - minPrice) / priceRange;
    if (ratio < 0.25) return "var(--green)";
    if (ratio < 0.6) return "var(--amber)";
    return "var(--red)";
  }

  return (
    <div style={{ width: "100%", maxWidth: "28rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1rem" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.6rem",
            fontWeight: 600,
            color: "var(--cream)",
            letterSpacing: "0.04em",
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          {from} <span style={{ color: "var(--amber)" }}>→</span> {to}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--cream-muted)",
            letterSpacing: "0.12em",
            marginTop: "0.25rem",
          }}
        >
          CHEAPEST TRAVEL DATES
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="loading-shimmer animate-boarding-pass"
              style={{
                width: "4.5rem",
                height: "5rem",
                borderRadius: "0.5rem",
                animationDelay: `${i * 60}ms`,
              }}
            />
          ))}
        </div>
      )}

      {/* Date grid */}
      {!isLoading && dates.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {dates.map((d, i) => {
            const { day, month, weekday } = formatDate(d.date);
            const isCheapest = i === 0;
            return (
              <div
                key={Array.isArray(d.date) ? d.date.join(":") : d.date}
                className="animate-boarding-pass"
                style={{
                  animationDelay: `${i * 40}ms`,
                  background: isCheapest ? "rgba(95,184,138,0.08)" : "var(--bg-card)",
                  border: `1px solid ${isCheapest ? "var(--green)" : "var(--border)"}`,
                  borderRadius: "0.5rem",
                  padding: "0.6rem 0.75rem",
                  textAlign: "center",
                  minWidth: "4.5rem",
                  cursor: "default",
                  position: "relative",
                }}
              >
                {isCheapest && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-0.5rem",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--green)",
                      color: "#07080a",
                      fontSize: "0.5rem",
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      padding: "0.1rem 0.35rem",
                      borderRadius: "0.2rem",
                      whiteSpace: "nowrap",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    CHEAPEST
                  </div>
                )}
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    color: "var(--cream-muted)",
                    letterSpacing: "0.1em",
                  }}
                >
                  {weekday}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "1.3rem",
                    fontWeight: 700,
                    color: "var(--cream)",
                    lineHeight: 1.1,
                  }}
                >
                  {day}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.55rem",
                    color: "var(--cream-muted)",
                    letterSpacing: "0.1em",
                    marginBottom: "0.3rem",
                  }}
                >
                  {month}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    color: priceColor(d.price),
                    lineHeight: 1,
                  }}
                >
                  ${d.price}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && dates.length === 0 && !parsed?.error && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--cream-muted)",
            letterSpacing: "0.08em",
            textAlign: "center",
            padding: "1.25rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
          }}
        >
          NO DATES FOUND
        </div>
      )}

      {parsed?.error && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--red)",
            background: "var(--bg-card)",
            border: "1px solid var(--red)",
            borderRadius: "0.5rem",
            padding: "1rem",
          }}
        >
          {parsed.error}
        </div>
      )}
    </div>
  );
}

function tryParse(s: string): DateSearchResult {
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return { dates: parsed };
    return parsed;
  } catch {
    return { error: s };
  }
}

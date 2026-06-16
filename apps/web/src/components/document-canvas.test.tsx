import { render } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@agents/ui/components/input", () => ({
  Input: (props: ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@agents/ui/components/textarea", () => ({
  Textarea: (props: ComponentProps<"textarea">) => <textarea {...props} />,
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { DocumentCanvas } from "./document-canvas";

const defaultProps = {
  destination: "Kyoto",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  travelers: 2,
  budgetUsd: 4500,
  headline: "Temples and food",
  summary: "A balanced week.",
  itinerary: "Intro\n## Day 1: Arrival\n- 09:00 - Land\n## Day 2: Markets\n- 10:00 - Nishiki",
  flights: "UA 1",
  status: "booked" as const,
  isStreaming: true,
  reviewSummary: "Ready",
  onDestinationChange: vi.fn(),
  onHeadlineChange: vi.fn(),
  onItineraryChange: vi.fn(),
  onReset: vi.fn(),
};

describe("DocumentCanvas", () => {
  it("renders booked streaming state", () => {
    expect(() => render(<DocumentCanvas {...defaultProps} />)).not.toThrow();
  });

  it("renders drafting non-streaming state", () => {
    expect(() =>
      render(
        <DocumentCanvas
          {...defaultProps}
          startDate="bad-date"
          endDate=""
          itinerary="## Day 1: Arrival\n- Land\n## Day 2:"
          flights=""
          status="drafting"
          isStreaming={false}
        />,
      ),
    ).not.toThrow();
  });

  it("renders without throwing", () => {
    expect(() =>
      render(<DocumentCanvas {...defaultProps} isStreaming={false} />),
    ).not.toThrow();
  });
});

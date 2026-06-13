import React from "react";
import { describe, it, vi } from "vitest";
import { renderSmoke, interactSmoke } from "@/test/test-utils";

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: (props: React.ComponentProps<"textarea">) => <textarea {...props} />,
}));

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
  it("renders booked streaming state", async () => {
    await renderSmoke("document-canvas", <DocumentCanvas {...defaultProps} />);
  });

  it("renders drafting non-streaming state", async () => {
    await renderSmoke("document-canvas", (
      <DocumentCanvas
        {...defaultProps}
        startDate="bad-date"
        endDate=""
        itinerary="## Day 1: Arrival\n- Land\n## Day 2:"
        flights=""
        status="drafting"
        isStreaming={false}
      />
    ));
  });

  it("interacts without throwing", async () => {
    await interactSmoke("document-canvas", <DocumentCanvas {...defaultProps} isStreaming={false} />);
  });
});

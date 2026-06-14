// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@base-ui/react/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));

import { DocumentCanvas } from "./document-canvas";

const defaults = {
  destination: "Tokyo",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  travelers: 2,
  budgetUsd: 4000,
  headline: "Food and culture",
  summary: "A great week.",
  itinerary: "",
  flights: "",
  status: "idle" as const,
  isStreaming: false,
  onDestinationChange: vi.fn(),
  onHeadlineChange: vi.fn(),
  onItineraryChange: vi.fn(),
  onReset: vi.fn(),
};

describe("DocumentCanvas", () => {
  it("shows empty state when itinerary is blank", () => {
    render(<DocumentCanvas {...defaults} itinerary="" />);
    expect(screen.getByText("No itinerary yet")).toBeInTheDocument();
  });

  it("does not show empty state when itinerary has content", () => {
    render(
      <DocumentCanvas
        {...defaults}
        itinerary="## Day 1: Arrival
- Land at HND"
      />,
    );
    expect(screen.queryByText("No itinerary yet")).not.toBeInTheDocument();
  });

  it("renders destination in the editable input", () => {
    render(<DocumentCanvas {...defaults} />);
    expect(screen.getByDisplayValue("Tokyo")).toBeInTheDocument();
  });

  it("calls onDestinationChange when destination input changes", async () => {
    const onDestinationChange = vi.fn();
    render(<DocumentCanvas {...defaults} onDestinationChange={onDestinationChange} />);
    const input = screen.getByDisplayValue("Tokyo");
    await userEvent.clear(input);
    await userEvent.type(input, "Kyoto");
    expect(onDestinationChange).toHaveBeenCalled();
  });

  it("calls onHeadlineChange when headline input changes", async () => {
    const onHeadlineChange = vi.fn();
    render(<DocumentCanvas {...defaults} onHeadlineChange={onHeadlineChange} />);
    const input = screen.getByDisplayValue("Food and culture");
    await userEvent.clear(input);
    await userEvent.type(input, "New headline");
    expect(onHeadlineChange).toHaveBeenCalled();
  });

  it("calls onReset when Reset button is clicked", async () => {
    const onReset = vi.fn();
    render(<DocumentCanvas {...defaults} onReset={onReset} />);
    await userEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("shows 'agent writing' when isStreaming", () => {
    render(<DocumentCanvas {...defaults} isStreaming itinerary="## Day 1: Arrival
- Land" />);
    expect(screen.getByText("agent writing")).toBeInTheDocument();
  });

  it("does not show 'agent writing' when not streaming", () => {
    render(<DocumentCanvas {...defaults} isStreaming={false} />);
    expect(screen.queryByText("agent writing")).not.toBeInTheDocument();
  });

  it("shows flights section when flights content is provided", () => {
    render(<DocumentCanvas {...defaults} flights="UA 100 SFO→NRT" />);
    expect(screen.getByText(/Flights/i)).toBeInTheDocument();
    expect(screen.getByText("UA 100 SFO→NRT")).toBeInTheDocument();
  });

  it("does not show flights section when flights is empty", () => {
    render(<DocumentCanvas {...defaults} flights="" />);
    expect(screen.queryByText(/Flights/i)).not.toBeInTheDocument();
  });

  it("shows review summary when status is ready_to_book", () => {
    render(
      <DocumentCanvas
        {...defaults}
        status="ready_to_book"
        reviewSummary="You're good to book."
      />,
    );
    expect(screen.getByText(/You're good to book\./)).toBeInTheDocument();
  });

  it("does not show review summary for other statuses", () => {
    render(
      <DocumentCanvas {...defaults} status="drafting" reviewSummary="You're good to book." />,
    );
    expect(screen.queryByText(/You're good to book\./)).not.toBeInTheDocument();
  });

  it("shows the correct status label for each DocStatus", () => {
    const { rerender } = render(<DocumentCanvas {...defaults} status="idle" />);
    expect(screen.getByText("No trip yet")).toBeInTheDocument();

    rerender(<DocumentCanvas {...defaults} status="drafting" />);
    expect(screen.getByText("Drafting")).toBeInTheDocument();

    rerender(<DocumentCanvas {...defaults} status="ready_to_book" />);
    expect(screen.getByText("Ready to book")).toBeInTheDocument();

    rerender(<DocumentCanvas {...defaults} status="booked" />);
    expect(screen.getByText("Booked")).toBeInTheDocument();
  });

  it("shows traveler count and budget in the stats row", () => {
    render(<DocumentCanvas {...defaults} travelers={3} budgetUsd={6000} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("$6,000")).toBeInTheDocument();
  });

  it("shows dashes for zero traveler count and zero budget", () => {
    render(<DocumentCanvas {...defaults} travelers={0} budgetUsd={0} />);
    // Each stat with no value renders "—"
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("calls onItineraryChange when the raw textarea changes", async () => {
    const onItineraryChange = vi.fn();
    const { container } = render(
      <DocumentCanvas
        {...defaults}
        itinerary="## Day 1: Arrival\n- Land"
        onItineraryChange={onItineraryChange}
      />,
    );
    // The textarea is the only <textarea> in the component (inside <details>)
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    await userEvent.type(textarea!, "x");
    expect(onItineraryChange).toHaveBeenCalled();
  });
});

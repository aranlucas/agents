import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrendsArtifact } from "./trends";

const view = {
  title: "Trends analysis",
  kind: "document" as const,
  content: "Top searches across US markets",
  status: "ready",
  version: 1,
};

describe("TrendsArtifact", () => {
  it("renders a native comparison chart, insights, result table, and SQL", () => {
    render(
      <TrendsArtifact
        state={{
          query: "Top searches across US markets",
          generated_sql: "SELECT term, COUNT(DISTINCT dma_name) FROM top_terms LIMIT 10",
          columns: ["term", "rank", "dma_count", "average_dma_rank"],
          rows: [
            { term: "solar eclipse", rank: 1, dma_count: 178, average_dma_rank: 2.4 },
            { term: "world cup", rank: 2, dma_count: 154, average_dma_rank: 3.1 },
          ],
          insights: "**Solar eclipse** has the widest geographic reach.",
          status: "ready",
        }}
        view={view}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Top searches across US markets" })).toBeVisible();
    expect(screen.getByText("DMA reach")).toBeVisible();
    expect(screen.getByText("178 markets")).toBeVisible();
    expect(screen.getAllByTestId("trends-chart-bar")).toHaveLength(2);
    expect(screen.getAllByText("Solar eclipse", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByText("average dma rank")).toBeVisible();
    expect(screen.getByText("Generated SQL")).toBeVisible();
  });

  it("prefers percent gain for rising results and closes from the header", () => {
    const onClose = vi.fn();
    render(
      <TrendsArtifact
        state={{
          query: "Fastest rising searches",
          columns: ["term", "average_dma_percent_gain", "dma_count"],
          rows: [{ term: "jayden adams", average_dma_percent_gain: 4050, dma_count: 180 }],
          status: "ready",
        }}
        view={view}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Average DMA gain")).toBeVisible();
    expect(screen.getByText("4,050%")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close Trends analysis" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

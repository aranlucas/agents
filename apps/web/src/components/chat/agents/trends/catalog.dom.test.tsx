// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  SqlDisclosureRenderer,
  TrendBarChartRenderer,
  TrendLineChartRenderer,
  TrendMetricRenderer,
  TrendTableRenderer,
} from "./catalog";

describe("Trends A2UI renderers", () => {
  it("renders a metric", () => {
    render(<TrendMetricRenderer props={{ label: "Rows", value: 10, detail: "Latest week" }} />);
    expect(screen.getByText("Rows")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("renders bars only for numeric data", () => {
    render(
      <TrendBarChartRenderer
        props={{
          title: "Top terms",
          categoryKey: "term",
          valueKey: "score",
          rows: [
            { term: "python", score: 100 },
            { term: "bad", score: "high" },
          ],
          maxItems: 10,
          valueFormat: "number",
        }}
      />,
    );
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.queryByText("bad")).not.toBeInTheDocument();
  });

  it("renders an empty line-chart state without a fabricated path", () => {
    const { container } = render(
      <TrendLineChartRenderer
        props={{
          title: "Weekly score",
          xKey: "week",
          yKey: "score",
          rows: [],
          valueFormat: "number",
        }}
      />,
    );
    expect(screen.getByText("No numeric time-series data.")).toBeInTheDocument();
    expect(container.querySelector("path")).toBeNull();
  });

  it("bounds table rows and uses accessible headers", () => {
    render(
      <TrendTableRenderer
        props={{
          title: "Source rows",
          columns: [{ key: "term", label: "Term", format: "text" }],
          rows: [{ term: "python" }, { term: "typescript" }],
          maxRows: 1,
        }}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Term" })).toBeInTheDocument();
    expect(screen.getByText("python")).toBeInTheDocument();
    expect(screen.queryByText("typescript")).not.toBeInTheDocument();
  });

  it("copies SQL from a collapsed disclosure", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<SqlDisclosureRenderer props={{ title: "Generated SQL", sql: "SELECT 1" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy SQL" }));
    expect(writeText).toHaveBeenCalledWith("SELECT 1");
  });
});

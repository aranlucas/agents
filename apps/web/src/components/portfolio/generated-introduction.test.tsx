// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_AGENTS_BASE_URL: "https://gateway.example" },
}));

import {
  IntroductionContent,
  IntroductionSkeleton,
  StreamingIntroduction,
} from "./streaming-introduction";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeneratedIntroduction", () => {
  it("keeps the same frame height while the server agent writes", () => {
    render(<IntroductionSkeleton />);

    expect(screen.getByLabelText("Resume agent is writing")).toHaveClass(
      "mt-5",
      "min-h-80",
      "sm:min-h-64",
    );
  });

  it("renders a generated introduction as paragraphs", () => {
    const view = render(
      <IntroductionContent
        text={"I build products from idea to launch.\n\nOutside work, I build agents and climb."}
      />,
    );

    expect(view.container.querySelectorAll("p")).toHaveLength(2);
    expect(screen.getByText("I build products from idea to launch.")).toBeVisible();
    expect(screen.getByText("Outside work, I build agents and climb.")).toBeVisible();
  });

  it("starts empty and renders only fresh streamed text", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    const fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StreamingIntroduction />);
    expect(screen.getByLabelText("Resume agent is writing")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/agent/resume/suggest",
      expect.objectContaining({ cache: "no-store", method: "POST" }),
    );

    await act(async () => {
      streamController?.enqueue(
        new TextEncoder().encode(
          'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Fresh introduction"}\n\n',
        ),
      );
    });
    expect(screen.getByText("Fresh introduction")).toBeVisible();

    await act(async () => {
      streamController?.enqueue(
        new TextEncoder().encode(
          'data: {"type":"TEXT_MESSAGE_CONTENT","delta":" streams in."}\n\n',
        ),
      );
      streamController?.close();
    });
    expect(screen.getByText("Fresh introduction streams in.")).toBeVisible();
  });
});

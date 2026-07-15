// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  it("renders fresh text from the server-provided stream", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    const streamPromise = Promise.resolve(stream);
    await act(async () => {
      render(
        <Suspense fallback={<IntroductionSkeleton />}>
          <StreamingIntroduction stream={streamPromise} />
        </Suspense>,
      );
    });
    expect(screen.getByLabelText("Resume agent is writing")).toBeVisible();

    await act(async () => {
      streamController?.enqueue(
        new TextEncoder().encode(
          'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Fresh introduction"}\n\n',
        ),
      );
    });
    await waitFor(() => expect(screen.getByText("Fresh introduction")).toBeVisible());

    await act(async () => {
      streamController?.enqueue(
        new TextEncoder().encode(
          'data: {"type":"TEXT_MESSAGE_CONTENT","delta":" streams in."}\n\n',
        ),
      );
      streamController?.close();
    });
    await waitFor(() => expect(screen.getByText("Fresh introduction streams in.")).toBeVisible());
  });
});

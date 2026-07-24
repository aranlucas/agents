// @vitest-environment jsdom
import { StrictMode, Suspense } from "react";
import { render, screen } from "@testing-library/react";
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
  it("reserves the same frame height while writing and once ready", () => {
    const writing = render(<IntroductionSkeleton />).container;
    const ready = render(<IntroductionContent text="Done." />).container;

    for (const frame of [writing.querySelector(".min-h-80"), ready.querySelector(".min-h-80")]) {
      expect(frame).toHaveClass("mt-5", "min-h-80", "sm:min-h-64");
    }
  });

  it("labels the run that writes the introduction", () => {
    const writing = render(<IntroductionSkeleton />).container;
    expect(writing).toHaveTextContent("resume-agent");
    expect(writing).toHaveTextContent("writing");

    const ready = render(<IntroductionContent text="Done." />).container;
    expect(ready).toHaveTextContent("resume-agent");
    expect(ready).toHaveTextContent("ready");
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
    expect(screen.getByRole("status")).toHaveTextContent("Resume introduction ready");
  });

  it("renders fresh text from the server-provided stream", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    const streamPromise = Promise.resolve(stream);

    render(
      <Suspense fallback={<IntroductionSkeleton />}>
        <StreamingIntroduction stream={streamPromise} />
      </Suspense>,
    );

    expect(screen.getByLabelText("Resume agent is writing")).toBeVisible();

    streamController?.enqueue(
      new TextEncoder().encode(
        'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Fresh introduction"}\n\n',
      ),
    );
    expect(await screen.findByText("Fresh introduction")).toBeVisible();

    streamController?.enqueue(
      new TextEncoder().encode('data: {"type":"TEXT_MESSAGE_CONTENT","delta":" streams in."}\n\n'),
    );
    streamController?.close();
    expect(await screen.findByText("Fresh introduction streams in.")).toBeVisible();
  });

  it("keeps a final text delta when the stream closes without a trailing newline", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Complete introduction"}',
          ),
        );
        controller.close();
      },
    });

    render(
      <Suspense fallback={<IntroductionSkeleton />}>
        <StreamingIntroduction stream={Promise.resolve(stream)} />
      </Suspense>,
    );

    expect(await screen.findByText("Complete introduction")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Resume introduction ready");
  });

  it("does not cancel the stream during the Strict Mode effect probe", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });

    render(
      <StrictMode>
        <Suspense fallback={<IntroductionSkeleton />}>
          <StreamingIntroduction stream={Promise.resolve(stream)} />
        </Suspense>
      </StrictMode>,
    );

    streamController?.enqueue(
      new TextEncoder().encode(
        'data: {"type":"TEXT_MESSAGE_CONTENT","delta":"Strict-safe introduction"}\n\n',
      ),
    );
    streamController?.close();

    expect(await screen.findByText("Strict-safe introduction")).toBeVisible();
  });
});

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { textDeltasFromAguiLines } from "@/lib/resume-introduction";

const INTRODUCTION_FRAME_CLASS = "min-h-80 sm:min-h-64";

/**
 * The run strip: a mono status rail naming the agent that writes the text
 * below it. The About copy on this page is a real streamed run against the
 * same gateway the console uses, so the page labels it as one instead of
 * passing it off as static prose.
 */
function RunStrip({ status }: { status: "writing" | "ready" | "unavailable" }) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
      <span className="text-foreground">resume-agent</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-1.5">
        {status === "writing" ? (
          <span
            aria-hidden="true"
            className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none"
          />
        ) : (
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${status === "ready" ? "bg-success" : "bg-muted-foreground"}`}
          />
        )}
        {status === "writing" ? "writing" : status === "ready" ? "ready" : "unavailable"}
      </span>
    </div>
  );
}

/** Prose written by the agent, marked off by a rule the way output is. */
function IntroductionBody({ children, busy }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div
      aria-busy={busy}
      className={`${INTRODUCTION_FRAME_CLASS} mt-5 flex flex-col gap-5 border-s-2 border-border ps-5 text-ink-soft`}
    >
      {children}
    </div>
  );
}

export function IntroductionSkeleton() {
  return (
    <div aria-label="Resume agent is writing" role="status">
      <RunStrip status="writing" />
      <IntroductionBody busy>
        <div
          aria-hidden="true"
          className="flex animate-pulse flex-col gap-3 py-1 motion-reduce:animate-none"
        >
          <div className="h-3 w-full rounded-full bg-muted" />
          <div className="h-3 w-11/12 rounded-full bg-muted" />
          <div className="h-3 w-full rounded-full bg-muted" />
          <div className="h-3 w-3/5 rounded-full bg-muted" />
        </div>
        <div
          aria-hidden="true"
          className="flex animate-pulse flex-col gap-3 motion-reduce:animate-none"
        >
          <div className="h-3 w-full rounded-full bg-muted" />
          <div className="h-3 w-10/12 rounded-full bg-muted" />
          <div className="h-3 w-11/12 rounded-full bg-muted" />
          <div className="h-3 w-2/5 rounded-full bg-muted" />
        </div>
      </IntroductionBody>
    </div>
  );
}

export function IntroductionContent({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div>
      <RunStrip status={streaming ? "writing" : "ready"} />
      <IntroductionBody busy={streaming}>
        {paragraphs.map((paragraph, index) => (
          <p key={paragraph}>
            {paragraph}
            {streaming && index === paragraphs.length - 1 ? (
              <span
                aria-hidden="true"
                className="inline-block h-4 w-0.5 animate-pulse bg-primary align-text-bottom motion-reduce:animate-none"
              />
            ) : null}
          </p>
        ))}
        <span className="sr-only" role="status">
          {streaming ? "Resume agent is writing" : "Resume introduction ready"}
        </span>
      </IntroductionBody>
    </div>
  );
}

export function StreamingIntroduction({
  stream,
}: {
  stream: Promise<ReadableStream<Uint8Array> | null>;
}) {
  const [serverStream, setServerStream] = useState<ReadableStream<Uint8Array> | null | undefined>(
    undefined,
  );
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [failed, setFailed] = useState(false);
  const readingStreamRef = useRef<ReadableStream<Uint8Array> | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const readEffectIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    setServerStream(undefined);
    setText("");
    setStreaming(false);
    setFailed(false);

    void Promise.resolve(stream)
      .then((resolved) => {
        if (cancelled) {
          return;
        }

        setServerStream(resolved);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setFailed(true);
        setServerStream(null);
      });

    return () => {
      cancelled = true;
      if (readerRef.current) {
        void readerRef.current.cancel();
      }
    };
  }, [stream]);

  useEffect(() => {
    const currentStream = serverStream;
    const streamId = ++readEffectIdRef.current;
    let cleanup: (() => void) | undefined;

    async function readStream(
      activeStream: ReadableStream<Uint8Array>,
      reader: ReadableStreamDefaultReader<Uint8Array>,
    ) {
      const decoder = new TextDecoder();
      let buffer = "";
      let generated = "";

      while (true) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- stream reads are inherently sequential
        const { value, done } = await reader.read();
        if (readingStreamRef.current !== activeStream || readEffectIdRef.current !== streamId) {
          return;
        }

        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        const deltas = textDeltasFromAguiLines(lines);

        if (deltas.length > 0) {
          generated += deltas.join("");
          if (readingStreamRef.current === activeStream && readEffectIdRef.current === streamId) {
            setStreaming(!done);
            setText(generated);
          }
        }

        if (done) break;
      }

      if (readingStreamRef.current === activeStream && readEffectIdRef.current === streamId) {
        setStreaming(false);
      }
    }

    if (currentStream === undefined) {
      return cleanup;
    }

    if (!currentStream) {
      setFailed(true);
      return cleanup;
    }

    if (readingStreamRef.current !== currentStream) {
      void readerRef.current?.cancel();
      readerRef.current = null;
      readingStreamRef.current = currentStream;
    }

    if (readerRef.current === null) {
      const reader = currentStream.getReader();
      readerRef.current = reader;
      void readStream(currentStream, reader).catch(() => {
        if (readingStreamRef.current === currentStream && readEffectIdRef.current === streamId) {
          setStreaming(false);
          setFailed(true);
        }
      });
    }

    cleanup = () => {
      const activeReader = readerRef.current;
      if (readEffectIdRef.current === streamId && readingStreamRef.current === currentStream) {
        void activeReader?.cancel();
        readerRef.current = null;
        readingStreamRef.current = null;
      }
    };

    return cleanup;
  }, [serverStream]);

  if (!text && !failed) return <IntroductionSkeleton />;
  if (!text) {
    return (
      <div>
        <RunStrip status="unavailable" />
        <IntroductionBody>
          <p role="status">
            The introduction did not come back this time. You can still{" "}
            <Link
              className="rounded-sm font-medium underline decoration-muted-foreground underline-offset-3 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              href="/console/resume"
              target="_top"
            >
              ask the Resume agent directly
            </Link>
            .
          </p>
        </IntroductionBody>
      </div>
    );
  }

  return <IntroductionContent text={text} streaming={streaming} />;
}

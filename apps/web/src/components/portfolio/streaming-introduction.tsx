"use client";

import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";

import { textDeltasFromAguiLines } from "@/lib/resume-introduction";

const INTRODUCTION_FRAME_CLASS = "mt-5 min-h-80 sm:min-h-64";

export function IntroductionSkeleton() {
  return (
    <div
      aria-label="Resume agent is writing"
      className={`${INTRODUCTION_FRAME_CLASS} flex animate-pulse flex-col gap-5 py-1 motion-reduce:animate-none`}
      role="status"
    >
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="h-3 w-full rounded-full bg-muted" />
        <div className="h-3 w-11/12 rounded-full bg-muted" />
        <div className="h-3 w-full rounded-full bg-muted" />
        <div className="h-3 w-3/5 rounded-full bg-muted" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="h-3 w-full rounded-full bg-muted" />
        <div className="h-3 w-10/12 rounded-full bg-muted" />
        <div className="h-3 w-11/12 rounded-full bg-muted" />
        <div className="h-3 w-2/5 rounded-full bg-muted" />
      </div>
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
    <div
      aria-busy={streaming}
      className={`${INTRODUCTION_FRAME_CLASS} flex flex-col gap-5 text-ink-soft`}
    >
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
    </div>
  );
}

export function StreamingIntroduction({
  stream,
}: {
  stream: Promise<ReadableStream<Uint8Array> | null>;
}) {
  const serverStream = use(stream);
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [failed, setFailed] = useState(false);
  const mountedRef = useRef(false);
  const readingStreamRef = useRef<ReadableStream<Uint8Array> | null | undefined>(undefined);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    async function readStream(
      currentStream: ReadableStream<Uint8Array>,
      reader: ReadableStreamDefaultReader<Uint8Array>,
    ) {
      const decoder = new TextDecoder();
      let buffer = "";
      let generated = "";
      while (true) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- stream reads are inherently sequential
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        const deltas = textDeltasFromAguiLines(lines);
        if (deltas.length > 0) {
          generated += deltas.join("");
          if (mountedRef.current && readingStreamRef.current === currentStream) {
            setStreaming(!done);
            setText(generated);
          }
        }
        if (done) break;
      }
      if (mountedRef.current && readingStreamRef.current === currentStream) {
        setStreaming(false);
      }
    }

    if (readingStreamRef.current !== serverStream) {
      void readerRef.current?.cancel();
      readerRef.current = null;
      readingStreamRef.current = serverStream;
      setText("");
      setStreaming(false);
      setFailed(false);

      if (!serverStream) {
        setFailed(true);
      } else {
        const reader = serverStream.getReader();
        readerRef.current = reader;
        void readStream(serverStream, reader).catch(() => {
          if (mountedRef.current && readingStreamRef.current === serverStream) {
            setStreaming(false);
            setFailed(true);
          }
        });
      }
    }

    return () => {
      mountedRef.current = false;
      queueMicrotask(() => {
        if (!mountedRef.current && readingStreamRef.current === serverStream) {
          void readerRef.current?.cancel();
        }
      });
    };
  }, [serverStream]);

  if (!text && !failed) return <IntroductionSkeleton />;
  if (!text) {
    return (
      <p className={`${INTRODUCTION_FRAME_CLASS} text-muted-foreground`} role="status">
        The introduction is unavailable right now. You can still{" "}
        <Link
          className="rounded-sm font-medium underline decoration-muted-foreground underline-offset-3 transition-colors hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          href="/console/resume"
          target="_top"
        >
          ask my Resume agent
        </Link>
        .
      </p>
    );
  }
  return <IntroductionContent text={text} streaming={streaming} />;
}

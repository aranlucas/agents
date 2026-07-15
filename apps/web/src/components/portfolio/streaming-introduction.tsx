"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { textDeltasFromAguiLines } from "@/lib/resume-introduction";

export function IntroductionSkeleton() {
  return (
    <div
      aria-label="Resume agent is writing"
      className="mt-5 flex min-h-80 animate-pulse flex-col gap-2 py-1 motion-reduce:animate-none sm:min-h-64"
    >
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-11/12 rounded bg-muted" />
      <div className="h-3 w-2/3 rounded bg-muted" />
      <div className="mt-3 h-3 w-full rounded bg-muted" />
      <div className="h-3 w-4/5 rounded bg-muted" />
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
    <div aria-live="polite" className="mt-5 flex min-h-80 flex-col gap-5 text-ink-soft sm:min-h-64">
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

  useEffect(() => {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    async function readStream() {
      if (!serverStream) {
        setFailed(true);
        return;
      }
      reader = serverStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let generated = "";
      while (true) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- stream reads are inherently sequential
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        const deltas = textDeltasFromAguiLines(lines);
        if (deltas.length > 0) {
          generated += deltas.join("");
          setStreaming(true);
          setText(generated);
        }
        if (done) break;
      }
      setStreaming(false);
    }

    void readStream().catch(() => {
      setStreaming(false);
      setFailed(true);
    });

    return () => {
      void reader?.cancel();
    };
  }, [serverStream]);

  if (!text && !failed) return <IntroductionSkeleton />;
  if (!text) {
    return (
      <p className="mt-5 min-h-80 text-muted-foreground sm:min-h-64">
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

"use client";

import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { env } from "@/env";
import { runResumeIntroduction } from "@/lib/resume-introduction";

const INTRODUCTION_FRAME_CLASS = "min-h-80 sm:min-h-64";

/**
 * The run strip: a mono status rail naming the agent that writes the text
 * below it. The About copy on this page is a real streamed run against the
 * same gateway the console uses, so the page labels it as one instead of
 * passing it off as static prose.
 */
function RunStrip({ status }: { status: "writing" | "ready" | "unavailable" }) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs tracking-wide text-muted-foreground">
      <span className="text-primary">resume-agent</span>
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
function IntroductionBody({
  children,
  busy,
  compact = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      aria-busy={busy}
      className={`${compact ? "min-h-24" : INTRODUCTION_FRAME_CLASS} mt-5 flex flex-col gap-6 border-s border-primary/40 ps-6 text-ink-soft sm:ps-8`}
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

export function StreamingIntroduction() {
  const { getToken, isLoaded } = useAuth();
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [failed, setFailed] = useState(false);
  const runEffectIdRef = useRef(0);

  useEffect(() => {
    if (!isLoaded) return undefined;

    const effectId = ++runEffectIdRef.current;
    const abortController = new AbortController();
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      abortController.abort();
    }, 20_000);

    setText("");
    setStreaming(false);
    setFailed(false);

    void (async () => {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch {
        // The endpoint is public, so Clerk availability must not prevent the run.
      }

      if (abortController.signal.aborted || runEffectIdRef.current !== effectId) return;

      try {
        await runResumeIntroduction({
          baseUrl: env.NEXT_PUBLIC_AGENTS_BASE_URL,
          token,
          abortController,
          onDelta(_delta, generated) {
            if (runEffectIdRef.current !== effectId) return;
            setStreaming(true);
            setText(generated);
          },
        });
        if (runEffectIdRef.current === effectId) setStreaming(false);
      } catch {
        if (runEffectIdRef.current === effectId && (!abortController.signal.aborted || timedOut)) {
          setStreaming(false);
          setFailed(true);
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      window.clearTimeout(timeout);
      abortController.abort();
    };
  }, [getToken, isLoaded]);

  if (!text && !failed) return <IntroductionSkeleton />;
  if (!text) {
    return (
      <div>
        <RunStrip status="unavailable" />
        <IntroductionBody compact>
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

"use client";

import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { ConsoleSession } from "@/components/chat/console-session";
import { toRenderItems } from "@/components/chat/messages";

const prompt = `Write a first-person introduction for Lucas Arango's personal website.
Use only facts from your embedded source resume. Focus on how he thinks and builds, not employers,
job history, dates, credentials, or a career summary. Use plain language and no hype. Write no more
than two short sentences and 45 words.`;

function isConnectedRuntimeStatus(status: unknown) {
  return status === "connected";
}

function IntroductionFrame({ children }: { children: ReactNode }) {
  return (
    <div aria-live="polite" className="mt-4 min-h-42">
      {children}
    </div>
  );
}

function IntroductionSkeletonContent() {
  return (
    <div
      aria-label="Resume agent is connecting"
      className="flex animate-pulse flex-col gap-2 py-1 motion-reduce:animate-none"
    >
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-3 w-4/5 rounded bg-muted" />
    </div>
  );
}

function IntroductionSkeleton() {
  return (
    <IntroductionFrame>
      <IntroductionSkeletonContent />
    </IntroductionFrame>
  );
}

function IntroductionWriter() {
  const { agent } = useAgent({ agentId: "resume" });
  const { copilotkit } = useCopilotKit();
  const isRuntimeConnected = isConnectedRuntimeStatus(copilotkit.runtimeConnectionStatus);
  const requested = useRef(false);
  const [failed, setFailed] = useState(false);
  const [streamCompleted, setStreamCompleted] = useState(false);

  const items = toRenderItems(agent.messages);
  let text = "";
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "assistant") {
      text = item.text;
      break;
    }
  }

  useEffect(() => {
    if (!isRuntimeConnected || requested.current) return;

    requested.current = true;
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: prompt });

    void copilotkit
      .runAgent({ agent })
      .catch(() => setFailed(true))
      .finally(() => setStreamCompleted(true));
  }, [agent, copilotkit, isRuntimeConnected]);

  const showSkeleton = !failed && !text;

  return (
    <IntroductionFrame>
      {showSkeleton ? <IntroductionSkeletonContent /> : null}
      {text ? (
        <p className="animate-in text-base leading-7 text-ink-soft duration-500 ease-out fade-in motion-reduce:animate-none">
          {text}
          {agent.isRunning ? (
            <span
              aria-hidden="true"
              className="inline-block h-4 w-0.5 animate-pulse bg-primary align-text-bottom motion-reduce:animate-none"
            />
          ) : null}
        </p>
      ) : null}
      {failed ? (
        <p className="text-sm leading-6 text-muted-foreground">
          The introduction is unavailable right now.
        </p>
      ) : null}
      {streamCompleted ? (
        <p className="mt-4 animate-in text-sm duration-500 ease-out fade-in slide-in-from-bottom-1 motion-reduce:animate-none">
          <Link
            className="rounded-sm font-medium text-primary underline decoration-primary/35 underline-offset-4 transition-colors hover:text-accent-foreground hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            href="/console/resume"
            target="_top"
          >
            Ask the Resume agent →
          </Link>
        </p>
      ) : null}
    </IntroductionFrame>
  );
}

export function GeneratedIntroduction() {
  return (
    <ConsoleSession agent="resume" loading={<IntroductionSkeleton />}>
      <IntroductionWriter />
    </ConsoleSession>
  );
}

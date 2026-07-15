"use client";

import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { ConsoleSession } from "@/components/chat/console-session";
import { toRenderItems } from "@/components/chat/messages";

const prompt = `Write a first-person About introduction for Lucas Arango's personal website.
Use only facts from your embedded source resume. Write with a quiet, personal, editorial voice:
direct, warm, specific, and conversational. It should sound like a person explaining what he does
and cares about, not a resume summary or marketing copy.

In the first paragraph, share Lucas's engineering background: more than 10 years building and
shipping products at DoorDash, Amazon, and AWS, with an emphasis on taking ideas from prototype to
launch and on his work with conversational AI and agents. Do not list titles, dates, or credentials.

In the second paragraph, connect that work to his interests. Include his habit of building personal
agents, his interest in learning and creative problem-solving, and grounded details about life
outside work such as travel, camping and climbing in the Cascades, running, or lifting.

Write two short paragraphs and 90 to 120 words total. Do not use a heading, bullets, a call to action,
hype, clichés, or language copied from another person's website.`;

function isConnectedRuntimeStatus(status: unknown) {
  return status === "connected";
}

function IntroductionFrame({ children }: { children: ReactNode }) {
  return (
    <div aria-live="polite" className="mt-5 min-h-80 sm:min-h-64">
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
      <div className="h-3 w-11/12 rounded bg-muted" />
      <div className="h-3 w-2/3 rounded bg-muted" />
      <div className="mt-3 h-3 w-full rounded bg-muted" />
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

    void copilotkit.runAgent({ agent }).catch(() => setFailed(true));
  }, [agent, copilotkit, isRuntimeConnected]);

  const showSkeleton = !failed && !text;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <IntroductionFrame>
      {showSkeleton ? <IntroductionSkeletonContent /> : null}
      {paragraphs.length > 0 ? (
        <div className="flex animate-in flex-col gap-5 text-ink-soft duration-500 ease-out fade-in motion-reduce:animate-none">
          {paragraphs.map((paragraph, index) => (
            <p key={paragraph}>
              {paragraph}
              {agent.isRunning && index === paragraphs.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-0.5 animate-pulse bg-primary align-text-bottom motion-reduce:animate-none"
                />
              ) : null}
            </p>
          ))}
        </div>
      ) : null}
      {failed ? (
        <p className="text-muted-foreground">
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

"use client";

import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { ConsoleSession } from "@/components/chat/console-session";
import { toRenderItems } from "@/components/chat/messages";

const prompt = `Write a first-person introduction for Lucas Arango's personal website.
Use only facts from your embedded source resume. Focus on how he thinks and builds, not employers,
job history, dates, credentials, or a career summary. Use plain language and no hype. Write no more
than two short sentences and 45 words.`;

function IntroductionWriter() {
  const { agent } = useAgent({ agentId: "resume" });
  const { copilotkit } = useCopilotKit();
  const requested = useRef(false);
  const [previousText, setPreviousText] = useState("");
  const [animatedChunk, setAnimatedChunk] = useState("");
  const [chunkSequence, setChunkSequence] = useState(0);
  const [started, setStarted] = useState(false);
  const [failed, setFailed] = useState(false);

  const items = toRenderItems(agent?.messages ?? []);
  let text = "";
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind === "assistant") {
      text = item.text;
      break;
    }
  }

  const generate = useCallback(async () => {
    if (!agent || requested.current) return;

    requested.current = true;
    setStarted(true);
    console.info("[portfolio:introduction] run:start", {
      agentId: agent.agentId,
      threadId: agent.threadId,
    });
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: prompt });

    try {
      await copilotkit.runAgent({ agent });
      console.info("[portfolio:introduction] run:finish", {
        messageCount: agent.messages.length,
      });
    } catch (error) {
      console.error("[portfolio:introduction] run:error", error);
      setFailed(true);
    }
  }, [agent, copilotkit]);

  useEffect(() => {
    if (agent && !requested.current) {
      void generate();
    }
  }, [agent, generate]);

  useEffect(() => {
    if (!started) return;
    console.info("[portfolio:introduction] stream:update", {
      isRunning: agent?.isRunning ?? false,
      messageCount: agent?.messages.length ?? 0,
      assistantText: text,
    });
  }, [agent?.isRunning, agent?.messages, started, text]);

  const showSkeleton = !failed && !text;

  useEffect(() => {
    if (!text) {
      setPreviousText("");
      setAnimatedChunk("");
      setChunkSequence(0);
      return;
    }

    if (text === previousText) {
      return;
    }

    const nextChunk = text.startsWith(previousText) ? text.slice(previousText.length) : text;
    setPreviousText(text);
    setAnimatedChunk(nextChunk);
    setChunkSequence((current) => current + 1);
  }, [text, previousText]);

  const visibleBaseText = text.slice(0, text.length - animatedChunk.length);

  return (
    <div aria-live="polite" className="mt-4 min-h-[136px]">
      {showSkeleton ? (
        <div aria-label="Resume agent is connecting" className="space-y-2 py-1">
          <div className="shimmer h-3 w-full rounded" />
          <div className="shimmer h-3 w-4/5 rounded" />
        </div>
      ) : null}
      {text ? (
        <p className="text-[16px] leading-7 text-(--ink-soft) transition-opacity duration-300">
          <span>{visibleBaseText}</span>
          {animatedChunk ? (
            <span key={`intro-chunk-${chunkSequence}`} className="intro-text-chunk">
              {animatedChunk}
            </span>
          ) : null}
          {agent?.isRunning ? <span aria-hidden="true" className="caret" /> : null}
        </p>
      ) : null}
      {failed ? (
        <p className="text-muted-foreground text-[14px] leading-6">
          The introduction is unavailable right now.
        </p>
      ) : null}
      <p className="mt-4 text-[14px]">
        <Link
          className="text-primary decoration-primary/35 hover:text-accent-foreground focus-visible:outline-ring rounded-sm font-medium underline underline-offset-[3px] transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4"
          href="/console/resume"
          target="_top"
        >
          Ask the Resume agent →
        </Link>
      </p>
    </div>
  );
}

export function GeneratedIntroduction() {
  return (
    <ConsoleSession agent="resume">
      <IntroductionWriter />
    </ConsoleSession>
  );
}

"use client";

import { useAgent, useCopilotKit } from "@copilotkit/react-core/v2";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ConsoleSession } from "@/components/chat/console-session";
import { toRenderItems } from "@/components/chat/messages";

const prompt = `Write a first-person introduction for Lucas Arango's personal website.
Use only facts from your embedded source resume. Focus on how he thinks and builds, not employers,
job history, dates, credentials, or a career summary. Use plain language and no hype. Write no more
than two short sentences and 45 words.`;

type AnimatedToken = {
  id: number;
  text: string;
  isWord: boolean;
};

function IntroductionWriter() {
  const { agent } = useAgent({ agentId: "resume" });
  const { copilotkit } = useCopilotKit();
  const requested = useRef(false);
  const [previousText, setPreviousText] = useState("");
  const [animatedTokens, setAnimatedTokens] = useState<AnimatedToken[]>([]);
  const nextTokenId = useRef(0);
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

  useLayoutEffect(() => {
    if (!text) {
      setPreviousText("");
      setAnimatedTokens([]);
      nextTokenId.current = 0;
      return;
    }

    if (text === previousText) {
      return;
    }

    const shouldAppend = text.startsWith(previousText);
    const nextChunk = shouldAppend ? text.slice(previousText.length) : text;
    const nextTokens = nextChunk.match(/\S+|\s+/g) ?? [];

    if (!shouldAppend) {
      nextTokenId.current = 0;
    }

    setAnimatedTokens((current) => {
      const baseTokens = shouldAppend ? current : [];
      const appended = nextTokens.map((token): AnimatedToken => {
        const nextId = nextTokenId.current;
        nextTokenId.current += 1;
        return {
          id: nextId,
          text: token,
          isWord: token.trim().length > 0,
        };
      });

      return [...baseTokens, ...appended];
    });

    setPreviousText(text);
  }, [text, previousText]);

  const streamFinished = !!text && !agent?.isRunning;
  const showAskResume = failed || streamFinished;

  return (
    <div aria-live="polite" className="mt-4 h-42 overflow-hidden">
      {showSkeleton ? (
        <div aria-label="Resume agent is connecting" className="space-y-2 py-1">
          <div className="bg-muted h-3 w-full animate-[shimmer_1.6s_ease-in-out_infinite] rounded bg-[linear-gradient(90deg,transparent_0%,_color-mix(in_srgb,_var(--foreground)_10%,_transparent)_50%,_transparent_100%)] bg-[size:200%_100%]" />
          <div className="bg-muted h-3 w-4/5 animate-[shimmer_1.6s_ease-in-out_infinite] rounded bg-[linear-gradient(90deg,transparent_0%,_color-mix(in_srgb,_var(--foreground)_10%,_transparent)_50%,_transparent_100%)] bg-[size:200%_100%]" />
        </div>
      ) : null}
      {text ? (
        <p className="text-[16px] leading-7 text-(--ink-soft) transition-opacity duration-300">
          {animatedTokens.map((token) =>
            token.isWord ? (
              <span
                key={token.id}
                className="inline-block animate-[intro-word-rise_0.55s_cubic-bezier(0.16,1,0.3,1)_both] bg-[linear-gradient(90deg,transparent_0%,_color-mix(in_srgb,_var(--accent)_25%,_transparent)_50%,_transparent_100%)] bg-[size:220%_100%]"
              >
                {token.text}
              </span>
            ) : (
              <span key={token.id}>{token.text}</span>
            ),
          )}
          {agent?.isRunning ? (
            <span
              aria-hidden="true"
              className="inline-block h-4 w-0.5 animate-[blink_1s_steps(2)_infinite] bg-(--accent) align-text-bottom"
            />
          ) : null}
        </p>
      ) : null}
      {failed ? (
        <p className="text-muted-foreground text-[14px] leading-6">
          The introduction is unavailable right now.
        </p>
      ) : null}
      {showAskResume ? (
        <p className="mt-4 text-[14px]">
          <Link
            className="text-primary decoration-primary/35 hover:text-accent-foreground focus-visible:outline-ring rounded-sm font-medium underline underline-offset-[3px] transition-colors hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-4"
            href="/console/resume"
            target="_top"
          >
            Ask the Resume agent →
          </Link>
        </p>
      ) : null}
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

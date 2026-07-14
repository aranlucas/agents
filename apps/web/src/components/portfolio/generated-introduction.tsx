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
  const [failed, setFailed] = useState(false);
  const [streamCompleted, setStreamCompleted] = useState(false);
  const [showAskResumeAnimation, setShowAskResumeAnimation] = useState(false);
  const [showAskResumeLink, setShowAskResumeLink] = useState(false);

  const showAskResume = failed || streamCompleted;

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
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: prompt });

    try {
      await copilotkit.runAgent({ agent });
    } catch {
      setFailed(true);
    } finally {
      setStreamCompleted(true);
    }
  }, [agent, copilotkit]);

  useEffect(() => {
    if (agent && !requested.current) {
      void generate();
    }
  }, [agent, generate]);

  useEffect(() => {
    if (!showAskResume) {
      setShowAskResumeLink(false);
      setShowAskResumeAnimation(false);
      return;
    }

    let frame: number | undefined;

    const showDelay = setTimeout(() => {
      setShowAskResumeLink(true);
      setShowAskResumeAnimation(false);
      frame = requestAnimationFrame(() => {
        setShowAskResumeAnimation(true);
      });
    }, 180);

    return () => {
      clearTimeout(showDelay);
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [showAskResume]);

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

  return (
    <div aria-live="polite" className="mt-4 h-42 overflow-hidden">
      {showSkeleton ? (
        <div aria-label="Resume agent is connecting" className="space-y-2 py-1">
          <div className="bg-muted h-3 w-full rounded" />
          <div className="bg-muted h-3 w-4/5 rounded" />
        </div>
      ) : null}
      {text ? (
        <p className="text-[16px] leading-7 text-(--ink-soft) transition-opacity duration-300">
          {animatedTokens.map((token) =>
            token.isWord ? (
              <span
                key={token.id}
                className="inline-block animate-[intro-word-rise_0.55s_cubic-bezier(0.16,1,0.3,1)_both]"
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
      {showAskResumeLink ? (
        <p
          className={`mt-4 text-[14px] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            showAskResumeAnimation
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-1 opacity-0"
          }`}
        >
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

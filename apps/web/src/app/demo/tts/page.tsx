"use client";

import { useState } from "react";
import { PlayIcon, SquareIcon } from "lucide-react";
import { speak, stopSpeaking } from "@/lib/copilotkit/speak-question";

const SAMPLE_TEXT = `
The pediatric dental examination begins with a thorough medical history review.
Assess the patient's caries risk using the Caries Risk Assessment tool.
Check for any signs of early childhood caries, particularly on the maxillary
incisors. Evaluate the occlusion and look for any developing malocclusions.
Review the patient's fluoride exposure and dietary habits. Consider whether
sealants are indicated for the permanent first molars.

A 7-year-old patient presents with a deep carious lesion on tooth number 19.
The tooth is vital and asymptomatic. What is your treatment plan? Consider
the proximity to the pulp and the patient's cooperation level. Would you
recommend a pulpotomy or pulpectomy? What are the indications for each
procedure?

In pediatric patients with special health care needs, behavior guidance
techniques should be tailored to the individual. Tell-show-do is the
foundation of non-pharmacologic behavior management. For patients with
anxiety, consider nitrous oxide or conscious sedation. Document all
behavior management techniques used and their effectiveness.
`;

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-(--bg-soft) px-1.5 py-0.5 text-xs text-(--ink-soft)">
      {children}
    </code>
  );
}

function TtsTestButton({ text, label }: { text: string; label: string }) {
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    void speak(text).finally(() => setPlaying(false));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className={
        "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors " +
        (playing
          ? "border-(--danger) bg-(--danger)/10 text-(--danger) hover:bg-(--danger)/15"
          : "border-(--border) bg-(--accent) text-(--primary-foreground) hover:bg-(--accent-strong)")
      }
    >
      {playing ? (
        <>
          <SquareIcon className="size-4" />
          Stop
        </>
      ) : (
        <>
          <PlayIcon className="size-4" />
          {label}
        </>
      )}
    </button>
  );
}

function RapidToggleTest() {
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog((prev) => [...prev.slice(-19), `${new Date().toISOString().slice(11, 19)} ${msg}`]);
  };

  const play = () => {
    addLog("speak() called");
    void speak(SAMPLE_TEXT)
      .then((r) => addLog(`speak() resolved: ${r}`))
      .catch((e) => addLog(`speak() rejected: ${e}`));
  };

  const stop = () => {
    addLog("stopSpeaking() called");
    stopSpeaking();
  };

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold tracking-wide text-(--ink-soft) uppercase">
        Rapid toggle test
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={play}
          className="inline-flex items-center gap-2 rounded-lg border border-(--border) bg-(--accent) px-4 py-2 text-sm font-medium text-(--primary-foreground) hover:bg-(--accent-strong)"
        >
          <PlayIcon className="size-4" />
          Speak
        </button>
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-2 rounded-lg border border-(--danger) bg-(--danger)/10 px-4 py-2 text-sm font-medium text-(--danger) hover:bg-(--danger)/15"
        >
          <SquareIcon className="size-4" />
          Stop
        </button>
      </div>
      <pre className="h-48 overflow-y-scroll rounded border border-(--border) bg-(--bg-soft) p-3 font-mono text-xs leading-relaxed text-(--ink-soft)">
        {log.length === 0 ? (
          <span className="italic text-(--ink-mute)">
            Click Speak to start, then Stop mid-playback.
          </span>
        ) : (
          log.map((entry, i) => (
            // oxlint-disable-next-line react/no-array-index-key -- log entries are ordered by position
            <div key={i}>{entry}</div>
          ))
        )}
      </pre>
    </div>
  );
}

export default function TtsDemoPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-8 text-(--ink)">
      <header className="mb-8">
        <h1 className="text-lg font-semibold">TTS Listen/Stop Test</h1>
        <p className="mt-1 text-sm text-(--ink-soft)">
          Test the <Code>speak</Code> / <Code>stopSpeaking</Code> fix. Click{" "}
          <strong>Listen</strong>, then click <strong>Stop</strong> — audio should stop immediately
          and not restart.
        </p>
      </header>

      <section className="mb-8 space-y-4 rounded-xl border border-(--border) bg-(--surface) p-6 shadow-(--shadow-card)">
        <h2 className="text-sm font-semibold text-(--ink)">Single button (TtsButton)</h2>
        <p className="text-xs leading-relaxed text-(--ink-soft)">
          Click Listen to start playback. Click Stop while audio is playing. The button should
          toggle to &quot;Listen&quot; and audio should stop right away.
        </p>
        <TtsTestButton text={SAMPLE_TEXT} label="Listen" />
      </section>

      <section className="mb-8 space-y-4 rounded-xl border border-(--border) bg-(--surface) p-6 shadow-(--shadow-card)">
        <h2 className="text-sm font-semibold text-(--ink)">Split Speak / Stop</h2>
        <p className="text-xs leading-relaxed text-(--ink-soft)">
          Click <strong>Speak</strong> to start, then <strong>Stop</strong> to cancel mid-playback.
          The log shows when each function is called and when the <Code>speak()</Code> promise
          resolves or rejects.
        </p>
        <RapidToggleTest />
      </section>

      <section className="space-y-4 rounded-xl border border-(--border) bg-(--surface) p-6 shadow-(--shadow-card)">
        <h2 className="text-sm font-semibold text-(--ink)">Multiple buttons (concurrent)</h2>
        <p className="text-xs leading-relaxed text-(--ink-soft)">
          Two independent TTS buttons. Using one should not affect the other (they share the same
          underlying <Code>speak</Code> / <Code>stopSpeaking</Code> — stopping one stops playback).
        </p>
        <div className="flex flex-wrap gap-4">
          <div className="space-y-2">
            <p className="text-xs text-(--ink-mute)">Button A (short text)</p>
            <TtsTestButton
              text="The maxillary canine typically erupts between 11 and 12 years of age."
              label="Listen A"
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-(--ink-mute)">Button B (long text)</p>
            <TtsTestButton text={SAMPLE_TEXT} label="Listen B" />
          </div>
        </div>
      </section>
    </div>
  );
}

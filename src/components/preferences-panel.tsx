"use client";

import React from "react";

export type Tone = "neutral" | "warm" | "punchy" | "academic";
export type Audience =
  | "general"
  | "executive"
  | "engineering"
  | "marketing"
  | "personal";
export type Length = "short" | "medium" | "long";

export interface Preferences {
  authorName: string;
  tone: Tone;
  audience: Audience;
  length: Length;
  focus: string;
}

export const DEFAULT_PREFERENCES: Preferences = {
  authorName: "",
  tone: "warm",
  audience: "general",
  length: "medium",
  focus: "",
};

const TONE_OPTIONS: { value: Tone; label: string; emoji: string }[] = [
  { value: "neutral", label: "Neutral", emoji: "·" },
  { value: "warm", label: "Warm", emoji: "·" },
  { value: "punchy", label: "Punchy", emoji: "·" },
  { value: "academic", label: "Academic", emoji: "·" },
];

const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: "general", label: "General readers" },
  { value: "executive", label: "Executives" },
  { value: "engineering", label: "Engineers" },
  { value: "marketing", label: "Marketing" },
  { value: "personal", label: "Personal note" },
];

const LENGTH_OPTIONS: { value: Length; label: string; hint: string }[] = [
  { value: "short", label: "Short", hint: "~150 words" },
  { value: "medium", label: "Medium", hint: "~350 words" },
  { value: "long", label: "Long", hint: "~700 words" },
];

interface Props {
  value: Preferences;
  onChange: (next: Preferences) => void;
}

export function PreferencesPanel({ value, onChange }: Props) {
  const set = <K extends keyof Preferences>(key: K, v: Preferences[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Writing brief
          </h3>
          <p className="text-xs text-[var(--ink-mute)] mt-0.5">
            Shared with the agent on every turn.
          </p>
        </div>
        <span className="text-[10px] font-mono tracking-wider uppercase text-[var(--ink-mute)] bg-[var(--bg-soft)] px-2 py-1 rounded-md">
          UI → Agent
        </span>
      </div>

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
        Your name
      </label>
      <input
        type="text"
        value={value.authorName}
        onChange={(e) => set("authorName", e.target.value)}
        placeholder="e.g. Ada"
        className="w-full mb-4 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
      />

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
        Tone
      </label>
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        {TONE_OPTIONS.map((opt) => {
          const active = value.tone === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("tone", opt.value)}
              className={`px-3 py-2 text-xs rounded-lg border transition ${
                active
                  ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm"
                  : "bg-[var(--surface-soft)] text-[var(--ink-soft)] border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
        Audience
      </label>
      <select
        value={value.audience}
        onChange={(e) => set("audience", e.target.value as Audience)}
        className="w-full mb-4 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
      >
        {AUDIENCE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
        Length
      </label>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {LENGTH_OPTIONS.map((opt) => {
          const active = value.length === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("length", opt.value)}
              className={`px-2 py-2 text-xs rounded-lg border transition flex flex-col items-center gap-0.5 ${
                active
                  ? "bg-[var(--accent)] text-white border-[var(--accent)] shadow-sm"
                  : "bg-[var(--surface-soft)] text-[var(--ink-soft)] border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              <span className="font-medium">{opt.label}</span>
              <span
                className={`text-[10px] ${
                  active ? "text-white/80" : "text-[var(--ink-mute)]"
                }`}
              >
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
        Focus / angle{" "}
        <span className="text-[var(--ink-mute)] font-normal">(optional)</span>
      </label>
      <textarea
        value={value.focus}
        onChange={(e) => set("focus", e.target.value)}
        placeholder="What should the agent emphasize?"
        rows={2}
        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none"
      />
    </div>
  );
}

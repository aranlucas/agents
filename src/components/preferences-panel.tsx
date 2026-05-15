"use client";

import React from "react";

export type BudgetTier = "shoestring" | "comfort" | "premium" | "luxury";
export type Vibe =
  | "relaxed"
  | "adventure"
  | "foodie"
  | "culture"
  | "nightlife"
  | "family";
export type Pace = "slow" | "balanced" | "packed";

export interface Preferences {
  travelerName: string;
  homeAirport: string;
  budgetTier: BudgetTier;
  vibe: Vibe;
  pace: Pace;
  dietary: string;
  mobility: string;
  interests: string[];
}

export const DEFAULT_PREFERENCES: Preferences = {
  travelerName: "",
  homeAirport: "",
  budgetTier: "comfort",
  vibe: "foodie",
  pace: "balanced",
  dietary: "",
  mobility: "",
  interests: [],
};

const BUDGET_OPTIONS: { value: BudgetTier; label: string; hint: string }[] = [
  { value: "shoestring", label: "Shoestring", hint: "< $100/day" },
  { value: "comfort", label: "Comfort", hint: "~ $250/day" },
  { value: "premium", label: "Premium", hint: "~ $500/day" },
  { value: "luxury", label: "Luxury", hint: "$1k+/day" },
];

const VIBE_OPTIONS: { value: Vibe; label: string }[] = [
  { value: "relaxed", label: "Relaxed" },
  { value: "adventure", label: "Adventure" },
  { value: "foodie", label: "Foodie" },
  { value: "culture", label: "Culture" },
  { value: "nightlife", label: "Nightlife" },
  { value: "family", label: "Family" },
];

const PACE_OPTIONS: { value: Pace; label: string; hint: string }[] = [
  { value: "slow", label: "Slow", hint: "1–2 stops" },
  { value: "balanced", label: "Balanced", hint: "3–4 stops" },
  { value: "packed", label: "Packed", hint: "5+ stops" },
];

const INTEREST_OPTIONS = [
  "Museums",
  "Hiking",
  "Markets",
  "Coffee",
  "Photography",
  "History",
  "Beaches",
  "Music",
  "Architecture",
];

interface Props {
  value: Preferences;
  onChange: (next: Preferences) => void;
}

export function PreferencesPanel({ value, onChange }: Props) {
  const set = <K extends keyof Preferences>(key: K, v: Preferences[K]) =>
    onChange({ ...value, [key]: v });

  const toggleInterest = (i: string) => {
    const has = value.interests.includes(i);
    set(
      "interests",
      has ? value.interests.filter((x) => x !== i) : [...value.interests, i],
    );
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">
            Traveler brief
          </h3>
          <p className="text-xs text-[var(--ink-mute)] mt-0.5">
            Shared with the agent on every turn.
          </p>
        </div>
        <span className="text-[10px] font-mono tracking-wider uppercase text-[var(--ink-mute)] bg-[var(--bg-soft)] px-2 py-1 rounded-md">
          UI → Agent
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div>
          <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
            Your name
          </label>
          <input
            type="text"
            value={value.travelerName}
            onChange={(e) => set("travelerName", e.target.value)}
            placeholder="e.g. Ada"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
            Home airport
          </label>
          <input
            type="text"
            value={value.homeAirport}
            onChange={(e) =>
              set("homeAirport", e.target.value.toUpperCase().slice(0, 4))
            }
            placeholder="SFO"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent font-mono uppercase"
          />
        </div>
      </div>

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
        Budget tier
      </label>
      <div className="grid grid-cols-2 gap-1.5 mb-4">
        {BUDGET_OPTIONS.map((opt) => {
          const active = value.budgetTier === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("budgetTier", opt.value)}
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

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
        Vibe
      </label>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {VIBE_OPTIONS.map((opt) => {
          const active = value.vibe === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("vibe", opt.value)}
              className={`px-2 py-1.5 text-xs rounded-lg border transition ${
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
        Pace
      </label>
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {PACE_OPTIONS.map((opt) => {
          const active = value.pace === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => set("pace", opt.value)}
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

      <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
        Interests
      </label>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {INTEREST_OPTIONS.map((i) => {
          const active = value.interests.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggleInterest(i)}
              className={`px-2.5 py-1 text-xs rounded-full border transition ${
                active
                  ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                  : "bg-[var(--surface-soft)] text-[var(--ink-soft)] border-[var(--border)] hover:border-[var(--accent)]"
              }`}
            >
              {i}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-2">
        <div>
          <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
            Dietary{" "}
            <span className="text-[var(--ink-mute)] font-normal">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={value.dietary}
            onChange={(e) => set("dietary", e.target.value)}
            placeholder="e.g. vegetarian, gluten-free"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
            Mobility / energy{" "}
            <span className="text-[var(--ink-mute)] font-normal">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={value.mobility}
            onChange={(e) => set("mobility", e.target.value)}
            placeholder="e.g. avoid stairs, traveling with kids"
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--surface-soft)] text-[var(--ink)] placeholder-[var(--ink-mute)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent"
          />
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useAgentContext } from "@copilotkit/react-core/v2";
import { Car, Plane } from "lucide-react";
import type {
  BudgetTier,
  Pace,
  Preferences,
  TransportMode,
  Vibe,
} from "@agents/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const DEFAULT_PREFERENCES: Preferences = {
  travelerName: "",
  homeAirport: "",
  transportMode: "flight",
  budgetTier: "comfort",
  vibe: "foodie",
  pace: "balanced",
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
  "Nightlife",
  "Wine & Spirits",
  "Street Food",
  "Fine Dining",
  "Wildlife",
  "Snorkeling",
  "Surfing",
  "Skiing",
  "Yoga & Wellness",
  "Shopping",
  "Local Crafts",
  "Temples & Shrines",
  "Street Art",
  "Live Shows",
  "Food Tours",
  "Cycling",
  "Scenic Drives",
  "Camping",
  "Festivals",
];

export function PreferencesPanel() {
  const [value, setValue] = useState<Preferences>(DEFAULT_PREFERENCES);

  useAgentContext({
    description: "Traveler preferences set by the user in the brief panel.",
    value: {
      travelerName: value.travelerName,
      homeAirport: value.homeAirport,
      transportMode: value.transportMode,
      budgetTier: value.budgetTier,
      vibe: value.vibe,
      pace: value.pace,
      interests: value.interests,
    },
  });

  const set = <K extends keyof Preferences>(key: K, v: Preferences[K]) =>
    setValue((prev) => ({ ...prev, [key]: v }));

  const toggleInterest = (i: string) => {
    const has = value.interests.includes(i);
    set(
      "interests",
      has ? value.interests.filter((x) => x !== i) : [...value.interests, i],
    );
  };

  return (
    <Card size="sm" className="gap-4">
      <CardHeader className="border-b border-[var(--border-soft)] pb-4">
        <div>
          <CardTitle>Traveler brief</CardTitle>
          <CardDescription className="text-xs">
            Shared with the agent on every turn.
          </CardDescription>
        </div>
        <CardAction>
          <Badge
            variant="outline"
            className="h-auto rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider"
          >
            UI → Agent
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
              Your name
            </label>
            <Input
              type="text"
              value={value.travelerName}
              onChange={(e) => set("travelerName", e.target.value)}
              placeholder="e.g. Ada"
              className="bg-[var(--surface-soft)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1">
              Home airport
            </label>
            <Input
              type="text"
              value={value.homeAirport}
              onChange={(e) =>
                set("homeAirport", e.target.value.toUpperCase().slice(0, 4))
              }
              placeholder="SFO"
              className="bg-[var(--surface-soft)] font-mono uppercase"
            />
          </div>
        </div>

        <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
          Transport mode
        </label>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {[
            {
              value: "flight" as TransportMode,
              label: "Flight",
              icon: Plane,
            },
            {
              value: "road_trip" as TransportMode,
              label: "Road trip",
              icon: Car,
            },
          ].map((opt) => {
            const active = value.transportMode === opt.value;
            const Icon = opt.icon;
            return (
              <Button
                key={opt.value}
                type="button"
                onClick={() => set("transportMode", opt.value)}
                variant={active ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-9 text-xs",
                  !active && "bg-[var(--surface-soft)]",
                )}
              >
                <Icon className="size-3.5" />
                <span className="font-medium">{opt.label}</span>
              </Button>
            );
          })}
        </div>

        <label className="block text-xs font-medium text-[var(--ink-soft)] mb-2">
          Budget tier
        </label>
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {BUDGET_OPTIONS.map((opt) => {
            const active = value.budgetTier === opt.value;
            return (
              <Button
                key={opt.value}
                type="button"
                onClick={() => set("budgetTier", opt.value)}
                variant={active ? "default" : "outline"}
                className={cn(
                  "h-auto flex-col gap-0.5 py-2 text-xs",
                  !active && "bg-[var(--surface-soft)]",
                )}
              >
                <span className="font-medium">{opt.label}</span>
                <span
                  className={`text-[10px] ${
                    active ? "text-white/80" : "text-[var(--ink-mute)]"
                  }`}
                >
                  {opt.hint}
                </span>
              </Button>
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
              <Button
                key={opt.value}
                type="button"
                onClick={() => set("vibe", opt.value)}
                variant={active ? "default" : "outline"}
                size="xs"
                className={cn(
                  "h-8 text-xs",
                  !active && "bg-[var(--surface-soft)]",
                )}
              >
                {opt.label}
              </Button>
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
              <Button
                key={opt.value}
                type="button"
                onClick={() => set("pace", opt.value)}
                variant={active ? "default" : "outline"}
                className={cn(
                  "h-auto flex-col gap-0.5 py-2 text-xs",
                  !active && "bg-[var(--surface-soft)]",
                )}
              >
                <span className="font-medium">{opt.label}</span>
                <span
                  className={`text-[10px] ${
                    active ? "text-white/80" : "text-[var(--ink-mute)]"
                  }`}
                >
                  {opt.hint}
                </span>
              </Button>
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
              <Button
                key={i}
                type="button"
                onClick={() => toggleInterest(i)}
                variant={active ? "default" : "outline"}
                size="xs"
                className={cn(
                  "rounded-full text-xs",
                  !active && "bg-[var(--surface-soft)]",
                )}
              >
                {i}
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

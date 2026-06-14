"use client";

import { useSyncExternalStore } from "react";

let current = "";
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function setCurrentQuestion(question: string) {
  if (question === current) return;
  current = question;
  emit();
}

export function clearCurrentQuestion() {
  setCurrentQuestion("");
}

export function getCurrentQuestion() {
  return current;
}

export function subscribeCurrentQuestion(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentQuestion() {
  return useSyncExternalStore(subscribeCurrentQuestion, getCurrentQuestion, getCurrentQuestion);
}

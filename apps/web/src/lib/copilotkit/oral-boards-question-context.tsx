"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface OralBoardsQuestionContextValue {
  currentQuestion: string;
  setCurrentQuestion: (question: string) => void;
  clearCurrentQuestion: () => void;
}

const OralBoardsQuestionContext = createContext<OralBoardsQuestionContextValue | null>(null);

export function OralBoardsQuestionProvider({ children }: { children: ReactNode }) {
  const [currentQuestion, setCurrentQuestion] = useState("");

  const clearCurrentQuestion = useCallback(() => setCurrentQuestion(""), []);

  const value = useMemo(
    () => ({ currentQuestion, setCurrentQuestion, clearCurrentQuestion }),
    [currentQuestion, clearCurrentQuestion],
  );

  return (
    <OralBoardsQuestionContext.Provider value={value}>
      {children}
    </OralBoardsQuestionContext.Provider>
  );
}

export function useOralBoardsQuestion(): OralBoardsQuestionContextValue {
  const ctx = useContext(OralBoardsQuestionContext);
  if (!ctx) {
    throw new Error(
      "useOralBoardsQuestion must be used within an OralBoardsQuestionProvider",
    );
  }
  return ctx;
}
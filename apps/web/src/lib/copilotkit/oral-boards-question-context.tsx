"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type OralBoardsInputKind = "ready" | "answer";

type PendingInput = {
  id: string;
  kind: OralBoardsInputKind;
  question: string;
  respond: (response: { answer: string }) => void | Promise<void>;
};

interface OralBoardsQuestionContextValue {
  currentQuestion: string;
  setCurrentQuestion: (question: string) => void;
  clearCurrentQuestion: () => void;
  pendingInputKind: OralBoardsInputKind | null;
  registerPendingInput: (input: PendingInput) => void;
  clearPendingInput: (id: string) => void;
  respondToPendingInput: (answer: string) => boolean;
}

const OralBoardsQuestionContext = createContext<OralBoardsQuestionContextValue | null>(null);

export function OralBoardsQuestionProvider({ children }: { children: ReactNode }) {
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [pendingInput, setPendingInput] = useState<PendingInput | null>(null);
  const pendingInputRef = useRef<PendingInput | null>(null);

  const clearCurrentQuestion = useCallback(() => setCurrentQuestion(""), []);

  const registerPendingInput = useCallback((input: PendingInput) => {
    pendingInputRef.current = input;
    setPendingInput(input);
    if (input.kind === "answer") setCurrentQuestion(input.question);
  }, []);

  const clearPendingInput = useCallback((id: string) => {
    if (pendingInputRef.current?.id !== id) return;
    pendingInputRef.current = null;
    setPendingInput(null);
  }, []);

  const respondToPendingInput = useCallback((answer: string) => {
    const input = pendingInputRef.current;
    if (!input) return false;

    pendingInputRef.current = null;
    setPendingInput(null);
    void input.respond({ answer });
    return true;
  }, []);

  const value = useMemo(
    () => ({
      currentQuestion,
      setCurrentQuestion,
      clearCurrentQuestion,
      pendingInputKind: pendingInput?.kind ?? null,
      registerPendingInput,
      clearPendingInput,
      respondToPendingInput,
    }),
    [
      currentQuestion,
      pendingInput?.kind,
      clearCurrentQuestion,
      registerPendingInput,
      clearPendingInput,
      respondToPendingInput,
    ],
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
    throw new Error("useOralBoardsQuestion must be used within an OralBoardsQuestionProvider");
  }
  return ctx;
}

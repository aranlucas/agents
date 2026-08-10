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
  respondToPendingInput: (answer: string) => Promise<boolean>;
}

const OralBoardsQuestionContext = createContext<OralBoardsQuestionContextValue | null>(null);

export function OralBoardsQuestionProvider({ children }: { children: ReactNode }) {
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [pendingInputKind, setPendingInputKind] = useState<OralBoardsInputKind | null>(null);
  const pendingInputRef = useRef<PendingInput | null>(null);
  const pendingResponseRef = useRef<{ id: string; promise: Promise<boolean> } | null>(null);

  const clearCurrentQuestion = useCallback(() => setCurrentQuestion(""), []);

  const registerPendingInput = useCallback((input: PendingInput) => {
    pendingInputRef.current = input;
    setPendingInputKind(input.kind);
    if (input.kind === "answer") setCurrentQuestion(input.question);
  }, []);

  const clearPendingInput = useCallback((id: string) => {
    if (pendingInputRef.current?.id !== id) return;
    pendingInputRef.current = null;
    setPendingInputKind(null);
  }, []);

  const respondToPendingInput = useCallback(async (answer: string) => {
    const input = pendingInputRef.current;
    if (!input) return false;
    if (pendingResponseRef.current?.id === input.id) return pendingResponseRef.current.promise;

    const response = (async () => {
      try {
        await input.respond({ answer });
        if (pendingInputRef.current?.id === input.id) {
          pendingInputRef.current = null;
          setPendingInputKind(null);
        }
        return true;
      } catch (error) {
        // CopilotKit clears its pending interrupt when the resume run rejects.
        // Retain our exact input metadata so the UI stays actionable and can
        // offer a reconnect instead of silently claiming the answer succeeded.
        pendingInputRef.current = input;
        setPendingInputKind(input.kind);
        throw error;
      }
    })();
    pendingResponseRef.current = { id: input.id, promise: response };
    try {
      return await response;
    } finally {
      if (pendingResponseRef.current?.id === input.id) pendingResponseRef.current = null;
    }
  }, []);

  const value = useMemo(
    () => ({
      currentQuestion,
      setCurrentQuestion,
      clearCurrentQuestion,
      pendingInputKind,
      registerPendingInput,
      clearPendingInput,
      respondToPendingInput,
    }),
    [
      currentQuestion,
      pendingInputKind,
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

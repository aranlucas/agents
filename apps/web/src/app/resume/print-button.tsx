"use client";

import { Printer } from "lucide-react";

export function ResumePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-primary"
    >
      <Printer aria-hidden="true" className="size-4" />
      Print / PDF
    </button>
  );
}

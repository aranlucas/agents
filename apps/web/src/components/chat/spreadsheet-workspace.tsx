"use client";

import { useState } from "react";
import { CopilotSidebar, useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { SpreadsheetState } from "@agents/types";
import { cn, ScrollArea } from "@agents/ui";
import { SidebarInset, SidebarProvider } from "@agents/ui";
import { Streamdown } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { useNewThread } from "@/components/chat/use-new-thread";
import { cssVars } from "@/lib/css";

const AGENT_ID = "spreadsheet" as const;

function SheetTab({
  title,
  active,
  onClick,
}: {
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-t border-b-2 px-4 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-[var(--page-color)] text-[var(--page-color)]"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {title}
    </button>
  );
}

function SpreadsheetTable({ rows }: { rows: string[][] }) {
  if (!rows.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data yet.
      </div>
    );
  }

  const [header, ...body] = rows;

  return (
    <div className="overflow-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            {header?.map((cell, ci) => (
              <th
                key={`h-${ci}-${cell}`}
                className="border border-border px-3 py-2 text-left font-semibold text-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={`r-${ri}`} className="hover:bg-muted/30">
              {header?.map((_, ci) => (
                <td key={`c-${ri}-${ci}`} className="border border-border px-3 py-1.5 text-muted-foreground">
                  {row[ci] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SpreadsheetWorkspace({ threadId: _threadId }: { threadId: string }) {
  const config = getAgentConfig(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const startNewThread = useNewThread(AGENT_ID);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = (agent?.state ?? {}) as SpreadsheetState;
  const sheets = state.sheets ?? [];

  const [localActiveIndex, setLocalActiveIndex] = useState(0);
  const activeIndex =
    sheets.length > 0
      ? Math.min(state.active_sheet_index ?? localActiveIndex, sheets.length - 1)
      : 0;
  const activeSheet = sheets[activeIndex];

  return (
    <SidebarProvider
      defaultOpen={false}
      className="h-dvh overflow-hidden"
      style={cssVars({ "--page-color": `var(${config.colorVar})` })}
    >
      <CopilotSidebar
        defaultOpen={false}
        labels={{
          modalHeaderTitle: "Spreadsheet chat",
          chatInputPlaceholder: config.placeholder,
        }}
      />
      <AppSidebar activePath={`/console/${AGENT_ID}`} onNewThread={startNewThread} />
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="flex h-full flex-col bg-background">
          {/* Sheet tabs */}
          <div className="flex shrink-0 items-end border-b px-4 pt-2">
            {sheets.length === 0 ? (
              <span className="pb-2 text-xs text-muted-foreground">No sheets yet — ask in chat</span>
            ) : (
              sheets.map((sheet, i) => (
                <SheetTab
                  key={sheet.title || `sheet-${i}`}
                  title={sheet.title}
                  active={i === activeIndex}
                  onClick={() => setLocalActiveIndex(i)}
                />
              ))
            )}
          </div>

          {/* Sheet content */}
          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full p-4">
              {activeSheet ? (
                <SpreadsheetTable rows={activeSheet.rows} />
              ) : (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <p className="text-4xl">📊</p>
                  <p className="text-sm">
                    Ask me to create a spreadsheet in the chat.
                    <br />
                    Try: &ldquo;Create a monthly budget tracker&rdquo;
                  </p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Summary strip */}
          {state.summary && (
            <div className="shrink-0 border-t px-4 py-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Analysis
              </p>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <Streamdown>{state.summary}</Streamdown>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

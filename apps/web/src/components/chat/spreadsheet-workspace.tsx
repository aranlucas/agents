"use client";

import { useState } from "react";
import { CopilotSidebar, useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";

import type { SpreadsheetState } from "@agents/types";
import { cn, ScrollArea } from "@agents/ui";
import { SidebarInset, SidebarProvider } from "@agents/ui";
import { Streamdown } from "@agents/ui";
import { getAgentConfig } from "@/components/chat/agents/registry";
import { AppSidebar } from "@/components/chat/app-sidebar";
import { ConsoleTopBar } from "@/components/chat/console-top-bar";
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
        "rounded-t border-b-2 px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-page text-page"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {title}
    </button>
  );
}

function keyedValues(values: string[], fallback: string) {
  const seen = new Map<string, number>();

  return values.map((value, index) => {
    const baseKey = value || fallback;
    const count = seen.get(baseKey) ?? 0;
    seen.set(baseKey, count + 1);

    return {
      index,
      key: count === 0 ? baseKey : `${baseKey}-${count}`,
      value,
    };
  });
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
  const columns = keyedValues(header ?? [], "column");
  const keyedRows = keyedValues(
    body.map((row) => row.join("\u001f")),
    "row",
  ).map((keyedRow) => ({
    key: keyedRow.key,
    row: body[keyedRow.index],
  }));

  return (
    <div className="overflow-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            {columns.map((column) => (
              <th
                key={column.key}
                className="border border-border px-3 py-2 text-left font-semibold text-foreground"
              >
                {column.value}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keyedRows.map(({ key, row }) => (
            <tr key={key} className="hover:bg-muted/30">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className="border border-border px-3 py-1.5 text-muted-foreground"
                >
                  {row[column.index] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SpreadsheetWorkspace({ threadId }: { threadId: string }) {
  const config = getAgentConfig(AGENT_ID);
  const { agent } = useAgent({
    agentId: AGENT_ID,
    updates: [UseAgentUpdate.OnStateChanged, UseAgentUpdate.OnRunStatusChanged],
  });
  const startNewThread = useNewThread(AGENT_ID);

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const state = (agent?.state ?? {}) as SpreadsheetState;
  const sheets = state.sheets ?? [];

  // Until the user picks a tab, follow the agent's active sheet. Once they do,
  // keep navigation local and immediate instead of asking the model to switch.
  const [localActiveIndex, setLocalActiveIndex] = useState<number | null>(null);
  const activeIndex =
    sheets.length > 0
      ? Math.max(0, Math.min(localActiveIndex ?? state.active_sheet_index ?? 0, sheets.length - 1))
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
      <AppSidebar
        activePath={`/console/${AGENT_ID}`}
        agentId={AGENT_ID}
        activeThreadId={threadId}
        onNewThread={startNewThread}
      />
      <SidebarInset className="min-h-0 overflow-hidden">
        <ConsoleTopBar agentId={AGENT_ID} threadId={threadId} isRunning={agent?.isRunning} />
        <div className="flex min-h-0 flex-1 flex-col bg-background">
          {/* Sheet tabs */}
          <div className="flex shrink-0 items-end border-b px-4 pt-2">
            {sheets.length === 0 ? (
              <span className="pb-2 text-xs text-muted-foreground">
                No sheets yet — ask in chat
              </span>
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
                <div className="flex h-full min-h-72 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
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
              <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Analysis
              </p>
              <div>
                <Streamdown>{state.summary}</Streamdown>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

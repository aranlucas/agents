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
        "rounded-t border-b-2 px-4 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
        active
          ? "border-[var(--page-color)] text-[var(--page-color)]"
          : "text-muted-foreground hover:text-foreground border-transparent",
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
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
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
                className="border-border text-foreground border px-3 py-2 text-left font-semibold"
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
                  className="border-border text-muted-foreground border px-3 py-1.5"
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
        <div className="bg-background flex h-full flex-col">
          {/* Sheet tabs */}
          <div className="flex shrink-0 items-end border-b px-4 pt-2">
            {sheets.length === 0 ? (
              <span className="text-muted-foreground pb-2 text-xs">
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
                <div className="text-muted-foreground flex h-full min-h-[300px] flex-col items-center justify-center gap-3 text-center">
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
              <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
                Analysis
              </p>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Streamdown>{state.summary}</Streamdown>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

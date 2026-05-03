"use client";

import * as React from "react";

interface ToolCallProps {
  status: "complete" | "inProgress" | "executing";
  name?: string;
  args?: any;
  result?: any;
}

export default function McpToolCall({
  status,
  name = "",
  args,
  result,
}: ToolCallProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const format = (content: any): string => {
    if (!content) return "";
    const text =
      typeof content === "object"
        ? JSON.stringify(content, null, 2)
        : String(content);
    return text
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  };

  const statusColor =
    status === "complete"
      ? "bg-green-400"
      : status === "inProgress" || status === "executing"
        ? "bg-amber-400 animate-pulse"
        : "bg-gray-500";

  return (
    <div
      className="bg-black/40 backdrop-blur-sm rounded-lg overflow-hidden w-full border border-white/10"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <div
        className="p-3 flex items-center cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-white text-sm overflow-hidden text-ellipsis">
          {name || "MCP Tool Call"}
        </span>
        <div className="ml-auto">
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        </div>
      </div>

      {isOpen && (
        <div className="px-4 pb-4 text-amber-100/80 text-xs font-mono">
          {args && (
            <div className="mb-4">
              <div className="text-amber-400/60 mb-2 text-xs uppercase tracking-wider">
                Parameters
              </div>
              <pre className="whitespace-pre-wrap max-h-[200px] overflow-auto bg-black/30 p-2 rounded">
                {format(args)}
              </pre>
            </div>
          )}

          {status === "complete" && result && (
            <div>
              <div className="text-amber-400/60 mb-2 text-xs uppercase tracking-wider">
                Result
              </div>
              <pre className="whitespace-pre-wrap max-h-[200px] overflow-auto bg-black/30 p-2 rounded">
                {format(result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

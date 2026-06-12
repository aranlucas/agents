"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function DocBody({ body }: { body: string }) {
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-semibold prose-headings:text-indigo-800 dark:prose-headings:text-indigo-300
      prose-p:text-gray-700 dark:prose-p:text-gray-300
      prose-strong:text-gray-900 dark:prose-strong:text-gray-100
      prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:underline
      prose-code:bg-gray-100 dark:prose-code:bg-gray-800 prose-code:px-1 prose-code:rounded
      prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800
      prose-table:text-sm prose-th:text-left prose-th:font-semibold
      prose-li:text-gray-700 dark:prose-li:text-gray-300
      prose-blockquote:border-indigo-300 dark:prose-blockquote:border-indigo-600 prose-blockquote:text-gray-500"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
    </div>
  );
}

"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/PageLayout";
import { Navigation } from "@/components/Navigation";
import { PageHeader } from "@/components/PageHeader";
import {
  Search,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

interface SearchResult {
  title: string;
  filepath: string;
  docid: string;
  score: number;
  snippet?: string;
  collectionName?: string;
}

const COLLECTION_LABELS: Record<string, string> = {
  abpd: "ABPD",
  aapd: "AAPD",
  cody: "Prep Course",
};

async function fetchSearch(q: string): Promise<SearchResult[]> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Search failed");
  const seen = new Set<string>();
  return (data.results ?? []).filter((r: SearchResult) => {
    if (seen.has(r.docid)) return false;
    seen.add(r.docid);
    return true;
  });
}

async function fetchDoc(docid: string): Promise<string> {
  const res = await fetch(`/api/doc/${docid}`);
  const data = await res.json();
  return data.doc?.body ?? "";
}

function highlightTerms(text: string, query: string): React.ReactNode {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return text;
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark
        key={i}
        className="bg-yellow-200 dark:bg-yellow-700 text-gray-900 dark:text-gray-100 rounded-sm px-0.5"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function ResultCard({
  result,
  query,
}: {
  result: SearchResult;
  query: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { data: body, isFetching } = useQuery({
    queryKey: ["doc", result.docid],
    queryFn: () => fetchDoc(result.docid),
    enabled: expanded,
    staleTime: Infinity,
  });

  const label =
    COLLECTION_LABELS[result.collectionName ?? ""] ?? result.collectionName;

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-4 flex items-start gap-3"
      >
        <FileText className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
              {result.title}
            </span>
            {label && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                {label}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-600 truncate">
            {result.filepath}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400 tabular-nums">
            {Math.round(result.score * 100)}%
          </span>
          <Link
            href={`/doc/${result.docid}`}
            onClick={(e) => e.stopPropagation()}
            className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
            title="Open document"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3">
          {isFetching ? (
            <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto font-sans">
              {body !== undefined ? highlightTerms(body, query) : null}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    data: results,
    isLoading,
    isFetching,
    error,
  } = useQuery({
    queryKey: ["search", query],
    queryFn: () => fetchSearch(query),
    enabled: query.trim().length > 0,
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(val), 350);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery(input);
  }

  const searched = query.trim().length > 0;

  return (
    <PageLayout
      footer={
        <p>
          Searches ABPD exam guides, AAPD clinical guidelines, and prep course
          materials.
        </p>
      }
    >
      <PageHeader
        title="Search Study Materials"
        subtitle="Full-text search across ABPD documents, AAPD guidelines, and prep course content"
      />

      <Navigation />

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="relative max-w-2xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={input}
            onChange={handleChange}
            placeholder="e.g. pulp therapy, behavior guidance, trauma protocol..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            autoFocus
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-500 animate-spin" />
          )}
        </div>
      </form>

      {error && (
        <div className="max-w-2xl mx-auto mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 text-sm">
          {error instanceof Error ? error.message : "Search failed"}
        </div>
      )}

      {isLoading && (
        <div className="max-w-2xl mx-auto space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 animate-pulse"
            >
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && searched && results?.length === 0 && (
        <div className="text-center text-gray-500 py-8">
          No results for{" "}
          <span className="font-medium text-gray-700 dark:text-gray-300">
            "{query}"
          </span>
        </div>
      )}

      {!isLoading && results && results.length > 0 && (
        <div className="max-w-2xl mx-auto space-y-2">
          {results.map((r) => (
            <ResultCard key={r.docid} result={r} query={query} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
